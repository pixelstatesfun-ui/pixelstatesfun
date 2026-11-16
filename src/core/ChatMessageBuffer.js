/*
 * Buffer for chatMessages for the server
 * it just buffers the most recent 200 messages for each channel
 *
 */
import {
  storeMessage,
  getMessagesForChannel,
  deletePublicUserMessages,
} from '../data/sql/Message.js';
import pool from '../data/sql/mariadb.js';
import { getUserRanks } from '../data/redis/ranks.js';
import { getPixelRank } from './pixelRanks.js';
import { getFactionChatStyleForUser } from '../data/sql/User.js';

const MAX_BUFFER_TIME = 600000;
const registrationRankCache = new Map();
const pixelRankCache = new Map();
const factionBannerCache = new Map();

async function getFactionBannerUrl(uid) {
  const userId = Number(uid);
  const cached = factionBannerCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.bannerUrl;
  const factionStyle = await getFactionChatStyleForUser(userId);
  const bannerUrl = factionStyle?.bannerUrl || null;
  factionBannerCache.set(userId, {
    bannerUrl,
    expiresAt: Date.now() + 2_000,
  });
  if (factionBannerCache.size > 5_000) factionBannerCache.clear();
  return bannerUrl;
}

async function attachFactionBanners(messages) {
  return Promise.all(messages.map(async (message) => {
    if (message[15] !== undefined) return message;
    return [...message, await getFactionBannerUrl(message[3])];
  }));
}

async function getRegistrationRank(uid) {
  const userId = Number(uid);
  if (!Number.isSafeInteger(userId) || userId <= 0) return 0;
  if (registrationRankCache.has(userId)) return registrationRankCache.get(userId);
  try {
    const rows = await pool.query(
      'SELECT COUNT(*) AS rank FROM Users WHERE id <= ?',
      [userId],
    );
    const rank = Number(rows[0]?.rank || 0);
    if (rank > 0) registrationRankCache.set(userId, rank);
    return rank;
  } catch {
    return 0;
  }
}

async function attachRegistrationRanks(messages) {
  return Promise.all(messages.map(async (message) => {
    if (message[9] !== undefined) return message;
    const registrationRank = await getRegistrationRank(message[3]);
    return [...message, registrationRank];
  }));
}

async function getUserPixelRank(uid) {
  const userId = Number(uid);
  if (!Number.isSafeInteger(userId) || userId <= 0) return 0;
  const cached = pixelRankCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.rankId;
  const [totalPixels] = await getUserRanks(userId);
  const rankId = getPixelRank(totalPixels).id;
  pixelRankCache.set(userId, { rankId, expiresAt: Date.now() + 60_000 });
  if (pixelRankCache.size > 5_000) pixelRankCache.clear();
  return rankId;
}

async function attachPixelRanks(messages) {
  return Promise.all(messages.map(async (message) => {
    if (message[14] !== undefined) return message;
    return [...message, await getUserPixelRank(message[3])];
  }));
}

class ChatMessageBuffer {
  constructor(socketEvents) {
    this.buffer = new Map();
    this.timestamps = new Map();

    this.cleanBuffer = this.cleanBuffer.bind(this);
    this.cleanLoop = setInterval(this.cleanBuffer, 3 * 60 * 1000);
    this.addMessage = this.addMessage.bind(this);
    this.resetBuffers = this.resetBuffers.bind(this);
    this.socketEvents = socketEvents;
    socketEvents.on('chatMessage', this.addMessage);
    /*
     * reset buffers when public messages got deleted, since we do not know
     * which channels exactly got affected
     */
    socketEvents.on('deletePublicUserMessages', this.resetBuffers);
    /*
     * if messages from a channel got deleted, just reset this channel
     */
    socketEvents.on('deleteMessages', (cid) => this.buffer.delete(cid));
    socketEvents.on(
      'deleteUserChannelMessages', (uid, cid) => this.buffer.delete(cid),
    );
  }

  async getMessages(cid, limit = 30) {
    if (limit > 200) {
      let messages = await getMessagesForChannel(cid, limit);
      messages = await attachRegistrationRanks(messages);
      return attachFactionBanners(await attachPixelRanks(messages));
    }

    let messages = this.buffer.get(cid);
    if (!messages) {
      messages = await getMessagesForChannel(cid, limit);
      messages = await attachRegistrationRanks(messages);
      messages = await attachFactionBanners(await attachPixelRanks(messages));
      this.buffer.set(cid, messages);
    }
    this.timestamps.set(cid, Date.now());
    return messages.slice(-limit);
  }

  cleanBuffer() {
    const curTime = Date.now();
    const toDelete = [];
    this.timestamps.forEach((timestamp, cid) => {
      if (curTime > timestamp + MAX_BUFFER_TIME) {
        toDelete.push(cid);
      }
    });
    toDelete.forEach((cid) => {
      this.timestamps.delete(cid);
      this.buffer.delete(cid);
    });
  }

  resetBuffers() {
    this.buffer.clear();
    this.timestamps.clear();
  }

  async broadcastChatMessage(
    name,
    message,
    cid,
    uid,
    flag = 'xx',
    flagLegit = false,
    avatarId = null,
    sendapi = true,
    isPremium = false,
    nicknameColor = null,
    nicknameGradient = null,
    avatarGlow = null,
    factionBannerUrl = null,
  ) {
    const ts = Math.floor(Date.now() / 1000);
    // this may throw!
    const [msgId, attachments] = await storeMessage(message, cid, uid);
    const registrationRank = await getRegistrationRank(uid);
    const pixelRankId = await getUserPixelRank(uid);

    /*
     * goes through socket events and then comes
     * back at addMessage
     */
    this.socketEvents.broadcastChatMessage(
      name,
      message,
      cid,
      uid,
      flag,
      ts,
      msgId,
      flagLegit,
      avatarId,
      attachments,
      registrationRank,
      isPremium,
      sendapi,
      nicknameColor,
      nicknameGradient,
      avatarGlow,
      pixelRankId,
      factionBannerUrl,
    );
    return [ts, msgId, attachments];
  }

  async addMessage(
    name,
    message,
    cid,
    uid,
    flag,
    ts,
    msgId,
    flagLegit,
    avatarId,
    attachments,
    registrationRank = 0,
    isPremium = false,
    _sendapi = true,
    nicknameColor = null,
    nicknameGradient = null,
    avatarGlow = null,
    pixelRankId = 0,
    factionBannerUrl = null,
  ) {
    void _sendapi;
    const messages = this.buffer.get(cid);
    if (messages) {
      messages.push([
        name,
        message,
        flag,
        uid,
        ts,
        msgId,
        flagLegit,
        avatarId,
        attachments,
        registrationRank,
        isPremium,
        nicknameColor,
        nicknameGradient,
        avatarGlow,
        pixelRankId,
        factionBannerUrl,
      ]);
    }
  }

  /*
   * delete all messages of a user from public channels
   */
  async broadcastUserPublicChatMessageDeletion(uid, sendapi = true) {
    deletePublicUserMessages(uid);
    /*
     * goes through socket events and then comes
     * back to resetBuffers
     */
    this.socketEvents.broadcastUserPublicChatMessageDeletion(uid, sendapi);
  }
}

export default ChatMessageBuffer;
