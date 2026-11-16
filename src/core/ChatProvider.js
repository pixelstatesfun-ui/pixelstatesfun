/*
 * class for chat communications
 */
import RateLimiter from '../utils/RateLimiter.js';
import {
  findIdByNameOrId, getDummyUser, getFactionChatStyleForUser, getLastIPOfUser,
} from '../data/sql/User.js';
import {
  getDefaultChannel, isFactionChannel,
} from '../data/sql/Channel.js';
import ChatMessageBuffer from './ChatMessageBuffer.js';
import socketEvents from '../socket/socketEvents.js';
import { ban, unban } from './ban.js';
import {
  mutec, unmutec,
  unmutecAll, listMutec,
  isCountryMuted,
} from '../data/redis/chat.js';
import { escapeMd } from './utils.js';
import mapFlag from '../utils/flagMapping.js';
import ttags from '../middleware/ttag.js';
import { getVoidStatusMessage } from './VoidStatus.js';

import { USE_MAILER, VIP_ENABLED } from './config.js';
import {
  CHAT_CHANNELS,
  EVENT_USER_NAME,
  INFO_USER_NAME,
  APISOCKET_USER_NAME,
  USERLVL,
  CHANNEL_TYPES,
} from './constants.js';

function getUserFromMd(mdUserLink) {
  const mdUser = mdUserLink.trim().replace(/^@/, '');
  const idMatch = /^(?:\[[^\]]+\]\((\d+)\)|.+\((\d+)\))$/.exec(mdUser);
  return idMatch ? (idMatch[1] || idMatch[2]) : mdUser;
}

function parseMuteDuration(value) {
  const match = value.match(/^(\d+(?:\.\d+)?)([dhms])$/i);
  if (match) {
    const unitMultipliers = {
      d: 24 * 60 * 60,
      h: 60 * 60,
      m: 60,
      s: 1,
    };
    return Number(match[1]) * unitMultipliers[match[2].toLowerCase()];
  }
  if (/^\d+(?:\.\d+)?$/.test(value)) {
    return Number(value) * 60;
  }
  return null;
}

function formatMuteDuration(durationSeconds) {
  if (durationSeconds % 86400 === 0) {
    return `${durationSeconds / 86400}d`;
  }
  if (durationSeconds % 3600 === 0) {
    return `${durationSeconds / 3600}h`;
  }
  if (durationSeconds % 60 === 0) {
    return `${durationSeconds / 60}min`;
  }
  return `${durationSeconds}s`;
}

export class ChatProvider {
  constructor() {
    /*
     * array of default channels (NOT including language channels)
     */
    this.defaultChannels = [];
    /*
     * map of lang channels to lang code
     */
    this.langChannels = new Map();
    /*
     * map of all public channels (default channel + lang channels) to id
     */
    this.publicChannels = new Map();
    /*
     * ids of default channels
     */
    this.defaultChannelIds = new Set();
    this.enChannelId = 0;
    this.intChannelId = 0;
    this.infoUserId = 1;
    this.eventUserId = 1;
    this.apiSocketUserId = 1;
    this.caseCheck = /^[A-Z !.]*$/;
    this.cyrillic = /[\u0436-\u043B]'/;
    // unused as of 2026-03-03
    this.substitutes = [];
    this.chatMessageBuffer = new ChatMessageBuffer(socketEvents);

    /**
     * when a chat message gets sent by a user on this shard
     * @param user user object
     * @param ip ip object
     * @param message text message
     * @param channelId channel id
     * @param lang language code
     * @param ttag ttag instance
     */
    socketEvents.on('recvChatMessage', async (
      user, ip, message, channelId, lang, ttag,
    ) => {
      const errorMsg = await this.sendMessage(
        user, ip, message, channelId, lang, ttag,
      );
      if (errorMsg) {
        socketEvents.broadcastSUChatMessage(
          user.id,
          'info',
          errorMsg,
          channelId,
          this.infoUserId,
          'il',
        );
      }
    });
  }

  async initialize() {
    // find or create default channels
    for (let i = 0; i < CHAT_CHANNELS.length; i += 1) {
      const { name } = CHAT_CHANNELS[i];
      // eslint-disable-next-line no-await-in-loop
      const channel = await getDefaultChannel(name);
      const { id, lastTs } = channel;
      if (name === 'en') {
        this.enChannelId = id;
      } else if (name === 'int') {
        this.intChannelId = id;
      }
      const channelArray = [id, name, lastTs, null, true, null];
      this.defaultChannels.push(channelArray);
      this.publicChannels.set(id, channelArray);
      this.defaultChannelIds.add(id);
    }
    // find or create non-english lang channels
    const langs = Object.keys(ttags);
    for (let i = 0; i < langs.length; i += 1) {
      const name = langs[i];
      if (name === 'default') {
        continue;
      }
      // eslint-disable-next-line no-await-in-loop
      const channel = await getDefaultChannel(name);
      const { id, lastTs } = channel;
      const channelArray = [id, name, lastTs, null, true, null];
      this.langChannels.set(name, channelArray);
      this.publicChannels.set(id, channelArray);
    }
    // find or create default users
    this.infoUserId = await getDummyUser(INFO_USER_NAME);
    this.eventUserId = await getDummyUser(EVENT_USER_NAME);
    this.apiSocketUserId = await getDummyUser(APISOCKET_USER_NAME);
  }

  /**
   * return all the public channels someone has access to, given a language
   * code
   * @return [
   *   [cid, name, lastTs, null (lastReadTs), true (muted), null (avatarId)],
   * ...]
   */
  getAccessiblePublicChannels(lang) {
    const ret = [...this.defaultChannels];
    if (lang && lang !== 'en') {
      const langChannel = this.langChannels.get(lang);
      if (langChannel) {
        ret.push(langChannel);
      }
    }
    return ret;
  }

  /**
   * get all public channels with names
   * @return [[cid, name], ...]
   */
  getPublicChannels() {
    return [...this.publicChannels.values()].map(([cid, name]) => [cid, name]);
  }

  /**
   * check if chanenl is public
   * @param channelid
   * @return boolean
   */
  isPublicChannel(cid) {
    return this.publicChannels.has(cid);
  }


  /**
   * filter private channels from channel list
   * @param channelIds list of channel ids
   * @return challelIds list of channel ids, but without public channels
   */
  filterPublicChannels(channelIds) {
    return channelIds.filter((cid) => !this.publicChannels.has(cid));
  }

  getHistory(cid, limit = 30) {
    return this.chatMessageBuffer.getMessages(cid, limit);
  }

  static isLikelyEnglishMessage(message) {
    const trimmed = message.trim();
    if (!trimmed || trimmed.length < 4) {
      return false;
    }
    const hasCyrillic = /[\u0400-\u04FF]/.test(trimmed);
    const englishWords = (trimmed.match(/\b[a-z]{3,}\b/gi) || []).length;
    const asciiRatio = (trimmed.match(/[a-z]/gi) || []).length / trimmed.length;
    return !hasCyrillic && englishWords >= 2 && asciiRatio >= 0.45;
  }

  async punishLanguageMismatch(user, channelId, message, ttag) {
    const { t } = ttag;
    if (await isFactionChannel(channelId)) {
      return false;
    }
    if (channelId === this.enChannelId || channelId === this.intChannelId
      || !ChatProvider.isLikelyEnglishMessage(message)
    ) {
      return false;
    }
    const lastWarning = user.languageWarningAt || 0;
    const now = Date.now();
    if (now - lastWarning < 10000) {
      user.languageWarningAt = 0;
      await this.mute(user.id, { duration: 60, printChannel: channelId });
      return true;
    }
    user.languageWarningAt = now;
    throw new Error(t`Please keep this channel language consistent.`);
  }

  async punishVoidSpam(user, message, channelId, ttag) {
    const { t } = ttag;
    const normalized = message.trim().toLowerCase();
    const matchesVoidCommand = [
      '!void', '/void', '!whenvoid', '/whenvoid', 'when void', '!when void',
    ].includes(normalized);
    if (!matchesVoidCommand) {
      return false;
    }
    const key = 'chat-void-spam';
    const now = Date.now();
    const timestamps = user[key] || [];
    const recent = timestamps.filter((ts) => now - ts <= 10000);
    recent.push(now);
    user[key] = recent.slice(-3);
    if (recent.length >= 3) {
      await this.mute(user.id, { duration: 20, printChannel: channelId });
      return true;
    }
    if (recent.length === 2) {
      throw new Error(
        t`/void and /whenvoid cooldown is 10 seconds. Please do not spam.`,
      );
    }
    return false;
  }

  async adminCommands(message, channelId, user) {
    // admin commands
    const cmdArr = message.split(' ');
    const cmd = cmdArr[0].substring(1);
    const args = cmdArr.slice(1);
    const initiator = `@[${escapeMd(user.name)}](${user.id})`;

    try {
      switch (cmd) {
        case 'mute': {
          if (!args.length) {
            return 'Usage: /mute <user, ping, or id> [duration: 1h, 15m, 30s]';
          }
          const parsedDuration = parseMuteDuration(args[args.length - 1]);
          const durationProvided = parsedDuration !== null;
          const targetArgs = durationProvided ? args.slice(0, -1) : args;
          if (!targetArgs.length) {
            return 'Usage: /mute <user, ping, or id> [duration: 1h, 15m, 30s]';
          }
          if (!durationProvided && /^\d+(?:\.\d+)?[a-z]+$/i.test(args.at(-1))) {
            return 'Invalid mute duration. Use d, h, m, or s (for example 1h, 15m, 30s).';
          }
          if (durationProvided
            && (!Number.isFinite(parsedDuration) || parsedDuration <= 0)
          ) {
            return 'Mute duration must be greater than zero.';
          }
          return this.mute(
            getUserFromMd(targetArgs.join(' ')),
            {
              printChannel: channelId,
              initiator,
              durationSeconds: durationProvided ? parsedDuration : null,
              muid: user.id,
            },
          );
        }

        case 'unmute':
          return this.unmute(
            getUserFromMd(args.join(' ')),
            {
              printChannel: channelId,
              initiator,
              muid: user.id,
            },
          );

        case 'purge':
          return this.purge(
            getUserFromMd(args.join(' ')),
            {
              printChannel: channelId,
              initiator,
              muid: user.id,
            },
          );

        case 'mutec': {
          if (args[0]) {
            const cc = args[0].toLowerCase();
            const ret = await mutec(channelId, cc);
            if (ret === null) {
              return 'No legit country defined';
            }
            if (!ret) {
              return `Country ${cc} is already muted`;
            }
            if (ret) {
              await this.broadcastChatMessage(
                'info',
                // eslint-disable-next-line max-len
                `Country ${cc} has been muted from this channel by ${initiator}`,
                channelId,
                this.infoUserId,
              );
            }
            return null;
          }
          return 'No country defined for mutec';
        }

        case 'unmutec': {
          if (args[0]) {
            const cc = args[0].toLowerCase();
            const ret = await unmutec(channelId, cc);
            if (ret === null) {
              return 'No legit country defined';
            }
            if (!ret) {
              return `Country ${cc} is not muted`;
            }
            await this.broadcastChatMessage(
              'info',
              // eslint-disable-next-line max-len
              `Country ${cc} has been unmuted from this channel by ${initiator}`,
              channelId,
              this.infoUserId,
            );
            return null;
          }
          const ret = await unmutecAll(channelId);
          if (ret) {
            await this.broadcastChatMessage(
              'info',
              `All countries unmuted from this channel by ${initiator}`,
              channelId,
              this.infoUserId,
            );
            return null;
          }
          return 'No country is currently muted from this channel';
        }

        case 'listmc': {
          const ccArr = await listMutec(channelId);
          if (ccArr.length) {
            return `Muted countries: ${ccArr}`;
          }
          return 'No country is currently muted from this channel';
        }

        default:
          return `Couldn't parse command ${cmd}`;
      }
    } catch (error) {
      console.error(`Error on Chat Mod command ${error.message}`);
      return 'Error on parsing command';
    }
  }

  /**
   * user sending a chat message
   * @param user User object
   * @param ip ip object
   * @param message string of message
   * @param channelId integer of channel
   * @param lang language code
   * @param ttag ttag instance for localized errors
   * @return error message if unsuccessful, otherwise null
   */
  async sendMessage(user, ip, message, channelId, lang, ttag) {
    const { id } = user;
    const { t } = ttag;
    const {
      name: baseName, avatarId, nicknameColor, nicknameGradient, avatarGlow,
    } = user.nameData;

    if (user.autoSpamMutedUntil > Date.now()) {
      return t`You are muted for another 15 minutes for spamming chat.`;
    }

    if (!user.rateLimiter) {
      user.rateLimiter = new RateLimiter(20, 15, true);
    }
    const waitLeft = user.rateLimiter.tick();
    if (waitLeft) {
      if (user.userlvl < USERLVL.CHATMOD) {
        const now = Date.now();
        const attempts = (user.chatRateLimitAttempts || [])
          .filter((timestamp) => now - timestamp < 15000);
        attempts.push(now);
        user.chatRateLimitAttempts = attempts;
        if (attempts.length >= 5
          && (this.publicChannels.has(channelId) || user?.hasChannel(channelId))
        ) {
          user.chatRateLimitAttempts = [];
          const muteError = await this.mute(
            user.id,
            { duration: 15, printChannel: channelId },
          );
          if (muteError) {
            return t`Chat spam detected, but the automatic mute failed.`;
          }
          user.autoSpamMutedUntil = now + (15 * 60 * 1000);
          return t`You have been muted for 15 minutes for spamming chat.`;
        }
      }
      const waitTime = Math.floor(waitLeft / 1000);
      // eslint-disable-next-line max-len
      return t`You are sending messages too fast, you have to wait ${waitTime}s :(`;
    }

    if (!this.publicChannels.has(channelId) && !user?.hasChannel(channelId)) {
      return t`You don\'t have access to this channel`;
    }

    try {
      const voidBlocked = await this.punishVoidSpam(
        user, message, channelId, ttag,
      );
      if (voidBlocked) {
        return null;
      }
    } catch (error) {
      return error.message;
    }

    const allowance = await ip.getAllowance();
    const { country } = ip;

    if (user.userlvl < USERLVL.CHATMOD) {
      if (await isCountryMuted(country, channelId)) {
        return t`Your country is temporary muted from this chat channel`;
      }
    } else if (message.charAt(0) === '/') {
      return this.adminCommands(message, channelId, user);
    }

    let { isBanned, isMuted, isProxy } = allowance;
    if (!isBanned && !isMuted && !isProxy) {
      ({ isBanned, isMuted } = await user.getAllowance());
    }
    if (isProxy) {
      return t`You can not send chat messages while using a proxy`;
    }
    if (isBanned) {
      return t`Can not chat while being banned`;
    }
    if (isMuted) {
      if (isMuted === true) {
        // eslint-disable-next-line max-len
        return t`You are permanently muted, join our guilded to appeal the mute`;
      }
      const ttl = Math.ceil((isMuted - Date.now()) / 1000);
      if (ttl > 120) {
        const timeMin = Math.round(ttl / 60);
        return t`You are muted for another ${timeMin} minutes`;
      }
      return t`You are muted for another ${ttl} seconds`;
    }

    const chatCommand = message.trim().toLowerCase();
    if (channelId === this.enChannelId
      && !(await isFactionChannel(channelId))
      && /[\u0400-\u04FF\u0600-\u06FF\u3040-\u30FF\u3400-\u9FFF\uAC00-\uD7AF]/
        .test(message)
    ) {
      await this.mute(user.id, { duration: 60, printChannel: channelId });
      return t`Please use the chat channel for your language.`;
    }

    if (chatCommand === '!void' || chatCommand === '/void'
      || chatCommand === '!whenvoid' || chatCommand === '/whenvoid'
      || chatCommand === 'when void' || chatCommand === '!when void') {
      try {
        const statusMessage = await getVoidStatusMessage();
        await this.broadcastChatMessage(
          EVENT_USER_NAME,
          statusMessage,
          channelId,
          this.eventUserId,
        );
      } catch (error) {
        console.error(
          `Could not reply to Void status command: ${error.message}`,
        );
        return t`Could not retrieve the next Void time right now.`;
      }
      return null;
    }

    try {
      const langBlocked = await this.punishLanguageMismatch(
        user, channelId, message, ttag,
      );
      if (langBlocked) {
        return null;
      }
    } catch (error) {
      return error.message;
    }

    if (baseName.trim() === '') {
      return 'nope';
    }
    const [flagLegit, displayCountry] = mapFlag(
      user.userlvl, country, user.flagUnlocked,
    );

    if (USE_MAILER && user.userlvl < USERLVL.VERIFIED) {
      return t`Your mail has to be verified in order to chat`;
    }

    for (let i = 0; i < this.substitutes.length; i += 1) {
      const substitute = this.substitutes[i];
      message = message.replace(substitute.regexp, substitute.replace);
    }

    if (message.match(this.cyrillic) && channelId === this.enChannelId
      && !(await isFactionChannel(channelId))
    ) {
      return t`Please use int channel`;
    }

    if (user.lastMessage && user.lastMessage === message) {
      user.messageRepeat += 1;
      if (user.messageRepeat >= 4) {
        await this.mute(id, { duration: 15, printChannel: channelId });
        user.messageRepeat = 0;
        return t`Stop flooding.`;
      }
    } else {
      user.messageRepeat = 0;
      user.lastMessage = message;
    }

    console.info(
      `Received chat message ${message} from ${baseName} / ${ip.ipString}`,
    );
    try {
      const factionStyle = await getFactionChatStyleForUser(id);
      const name = factionStyle?.tag ? `[${factionStyle.tag}] ${baseName}` : baseName;
      await this.broadcastChatMessage(
        name,
        message,
        channelId,
        id,
        displayCountry,
        flagLegit,
        avatarId,
        true,
        VIP_ENABLED ? user.vipTier : 0,
        (VIP_ENABLED && user.vipTier >= 3) ? nicknameColor : null,
        (VIP_ENABLED && user.vipTier >= 3) ? nicknameGradient : null,
        (VIP_ENABLED && user.vipTier > 0) ? avatarGlow : null,
        factionStyle?.bannerUrl || null,
      );
    } catch (error) {
      switch (error.message) {
        case 'too_long':
          return t`You can\'t send a message this long :(`;
        case 'too_many_files':
          return t`You attached too many files`;
        case 'no_such_channel': {
          /*
           * channel is deleted, remove it from user,
           * assume its DM, because that is what we clear regularly,
           * the patch doesn't matter if its not
           */
          socketEvents.patchUserState(id, 'chat', {
            op: 'del',
            path: `channels.${CHANNEL_TYPES.DM}[0:${channelId}]`,
          });
          return null;
        }
        default:
          return 'Server Error';
      }
    }
    return null;
  }

  broadcastChatMessage(...args) {
    /*
     * update cache public channel lastTs
     */
    const publicChannel = this.publicChannels.get(args[2]);
    if (publicChannel) {
      publicChannel[2] = Date.now();
    }

    return this.chatMessageBuffer.broadcastChatMessage(...args);
  }

  async mute(nameOrId, opts) {
    const durationSeconds = opts.durationSeconds
      ?? (opts.duration ? opts.duration * 60 : null);
    const initiator = opts.initiator || null;
    const printChannel = opts.printChannel || null;
    const muid = opts.muid || null;

    const searchResult = await findIdByNameOrId(nameOrId);
    if (!searchResult) {
      return `Couldn't find user ${nameOrId}`;
    }
    const { name, id } = searchResult;
    const userPing = `@[${escapeMd(name)}](${id})`;
    const ipStrings = socketEvents.getIPsOfOnlineUser(id);
    const lastOnlineIPString = await getLastIPOfUser(id);
    if (lastOnlineIPString && !ipStrings.includes(lastOnlineIPString)) {
      ipStrings.push(lastOnlineIPString);
    }

    const banResult = await ban(
      ipStrings, id, null, true, false, 'mute', durationSeconds, muid,
    );
    if (!banResult[0].length && !banResult[1].length) {
      return 'Failed to mute user';
    }

    try {
      if (printChannel) {
        if (durationSeconds) {
          await this.broadcastChatMessage(
            'info',
            (initiator)
              ? `${userPing} has been muted for ${formatMuteDuration(durationSeconds)} by ${initiator}`
              : `${userPing} has been muted for ${formatMuteDuration(durationSeconds)}`,
            printChannel,
            this.infoUserId,
          );
        } else {
          await this.broadcastChatMessage(
            'info',
            (initiator)
              ? `${userPing} has been muted forever by ${initiator}`
              : `${userPing} has been muted forever`,
            printChannel,
            this.infoUserId,
          );
        }
      }
    } catch {
      // nothing
    }
    console.info(`${initiator} muted user ${userPing}`);
    return null;
  }

  async unmute(nameOrId, opts) {
    const initiator = opts.initiator || null;
    const printChannel = opts.printChannel || null;
    const muid = opts.muid || null;

    const searchResult = await findIdByNameOrId(nameOrId);
    if (!searchResult) {
      return `Couldn't find user ${nameOrId}`;
    }
    const { name, id } = searchResult;
    const userPing = `@[${escapeMd(name)}](${id})`;
    const ipStrings = socketEvents.getIPsOfOnlineUser(id);
    const lastOnlineIPString = await getLastIPOfUser(id);
    if (lastOnlineIPString && !ipStrings.includes(lastOnlineIPString)) {
      ipStrings.push(lastOnlineIPString);
    }

    const succ = await unban(ipStrings, id, null, null, true, false, muid);
    if (!succ[0].length && !succ[1].length) {
      return `User ${userPing} is not muted`;
    }
    if (printChannel) {
      try {
        await this.broadcastChatMessage(
          'info',
          (initiator)
            ? `${userPing} has been unmuted by ${initiator}`
            : `${userPing} has been unmuted`,
          printChannel,
          this.infoUserId,
        );
      } catch {
        // nothing
      }
    }
    console.info(`Unmuted user ${userPing}`);
    return null;
  }

  async purge(nameOrId, opts) {
    const initiator = opts.initiator || null;
    const printChannel = opts.printChannel || null;

    const searchResult = await findIdByNameOrId(nameOrId);
    if (!searchResult) {
      return `Couldn't find user ${nameOrId}`;
    }
    const { name, id } = searchResult;
    const userPing = `@[${escapeMd(name)}](${id})`;

    this.chatMessageBuffer.broadcastUserPublicChatMessageDeletion(id);
    if (printChannel) {
      try {
        await this.broadcastChatMessage(
          'info',
          (initiator)
            ? `Messages of ${userPing} purged by ${initiator}`
            : `Messages of ${userPing} purged`,
          printChannel,
          this.infoUserId,
        );
      } catch {
        // nothing
      }
    }
    console.info(`Purging public messages of user ${userPing}`);
    return null;
  }
}

export default new ChatProvider();
