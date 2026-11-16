/*
 * functions for admintools
 *
 */

/* eslint-disable no-await-in-loop */

import sharp from 'sharp';

import { validateCoorRange, validateUsername } from '../utils/validation.js';
import CanvasCleaner from './CanvasCleaner.js';
import socketEvents from '../socket/socketEvents.js';
import { forceCaptcha, resetAllCaptchas } from '../data/sql/Captcha.js';
import { rollCaptchaFonts } from './captchaserver.js';
import { getBanInfos } from '../data/sql/Ban.js';
import {
  getTPIDsOfUser, getTPIDHistoryOfUser, getTpidProviders,
} from '../data/sql/ThreePID.js';
import { syncModeratorRole } from './DiscordRoles.js';
import { ModtoolsLogger } from './logger.js';
import rpgEvent from './RpgEvent.js';
import {
  ban, unban, whitelist, unwhitelist, banMedia, unbanMedia,
} from './ban.js';
import { setState } from './SharedState.js';
import { censorIdentifier } from './utils.js';
import {
  MEDIA_BAN_REASONS, THREEPID_PROVIDERS, USERLVL,
} from './constants.js';
import {
  getIPInfos,
  getIPofIID,
  getIIDsOfIPs,
  getIPsOfIIDs,
  findAlts,
  getIPHistoryOfUser,
  getAccountIdsByIPs,
} from '../data/sql/IP.js';
import {
  findUserByIdOrName,
  getNamesToIds,
  markUserAccountsAsHacked,
  setUserProperty,
} from '../data/sql/User.js';
import {
  getIIDSummary,
  getIIDPixels,
  getSummaryFromArea,
  getPixelsFromArea,
  populateTable,
} from './parsePixelLog.js';
import canvases from './canvases.js';
import {
  imageABGR2Canvas,
  fillCanvasAreaWithColor,
  protectCanvasArea,
} from './Image.js';
import rollbackCanvasArea from './rollback.js';
import { getIPIntelOverShards } from '../utils/intel/index.js';
import { PROXYCHECK_LOG_ONLY } from './config.js';
import {
  hasProxyRisk, isConfirmedProxy,
} from '../utils/intel/risk.js';

/**
 * Execute admin text actions, text can be a list of ips or iids or anything
 * @param action what to do with the ips
 * @param text whatever
 * @param user admin user
 * @return text of success
 */
export async function executeTextAction(action, text, user) {
  if (action === 'announce' && text?.length > 6) {
    socketEvents.broadcastAnnouncement(text);
    return 'Sent announcement';
  }

  const inputValues = text.split('\n').map((l) => l.trim()).filter((l) => l);

  if (action === 'markusersashacked') {
    let out = '';
    const [emailSet, mailExists] = await markUserAccountsAsHacked(inputValues);
    emailSet.forEach((e) => {
      out += `${e} setmail\n`;
      socketEvents.reloadUser(e);
    });
    mailExists.forEach((e) => {
      out += `${e} set\n`;
      socketEvents.reloadUser(e);
    });
    return out;
  }

  let valueMap;
  if (action === 'iidtoip') {
    valueMap = await getIPsOfIIDs(inputValues);
  } else if (action === 'iptoiid') {
    valueMap = await getIIDsOfIPs(inputValues);
  } else {
    return `Failed to ${action}`;
  }

  let out = '';
  for (let i = 0; i < inputValues.length; i += 1) {
    const value = inputValues[i];
    const map = valueMap.get(value);
    if (map) {
      out += map;
    } else {
      out += value;
    }
    out += '\n';

    ModtoolsLogger.adminTextAction(user, action, value);
  }
  return out;
}

export async function executeQuickAction(action, user) {
  ModtoolsLogger.adminQuickAction(user, action);

  switch (action) {
    case 'summonbonusvoid':
      return rpgEvent.summonBonusVoid();
    case 'rollcaptchafonts': {
      const fonts = await rollCaptchaFonts();
      return `Rolled captcha fonts: ${fonts.join(',')}`;
    }
    case 'resetcaptchas': {
      await resetAllCaptchas();
      socketEvents.resetAllCaptchas();
      return 'Reset Captchas and JS Challenges!';
    }
    case 'enableverify': {
      await setState('needVerification', true);
      return 'Enabled Verification Requirement';
    }
    case 'disableverify': {
      await setState('needVerification', false);
      return 'Disabled Verification Requirement';
    }
    case 'enablemalware': {
      await setState('malwareCheck', true);
      return 'Enabled Verification Requirement';
    }
    case 'disablemalware': {
      await setState('malwareCheck', false);
      return 'Disabled Verification Requirement';
    }
    default:
      throw new Error('Unknown quick action!');
  }
}

/**
 * print informations of ban
 * @param ban Array of ban models
 * @return string with informations
 */
async function printBans(bans) {
  let out = '';

  let i = bans.length;
  while (i > 0) {
    i -= 1;
    const {
      buuid, reason, flags, expires, createdAt, muid, mname, users, tpids, ips,
    } = bans[i];
    let type = '';
    if (flags & 0x01) type = 'Ban';
    else if (flags & 0x02) {
      if (type) {
        type += ' & ';
      }
      type += 'Mute';
    }
    out += `${type}: ${buuid}\nReason: ${reason}\n`;
    if (expires) out += `Expires: ${expires.toLocaleString()}\n`;
    out += `Created: ${createdAt.toLocaleString()}\n`;
    if (muid) {
      out += `by: @[${mname}](${muid})\n`;
    }
    out += 'Affects: ';
    if (users?.length) out += `\nUsers: \n${users.map((u) => u.id).join('\n')}`;
    if (tpids?.length) out += `\n${tpids.length} TPIDS `;
    if (ips?.length) {
      const iids = await getIIDsOfIPs(ips.map((ib) => ib.ipString));
      out += `\nIIDs: \n${Array.from(iids.values()).join('\n')}`;
    }
    out += '\n';
    if (i > 0) {
      out += '\n';
    }
  }
  return out;
}

/**
 * Execute IID based actions
 * @param action what to do with the iid
 * @param iid already sanitized iid
 * @return text of success
 */
export async function executeIIDAction(
  action,
  iid,
  bid,
  iidOrUserIdOrName,
  /* list of either iid, bid or userid */
  identifiers,
  reason,
  /* duration in ms */
  time,
  username,
  modUser,
) {
  let duration;
  const identifierUuidList = [];
  const identifierUserIdList = [];

  switch (action) {
    case 'givecaptcha':
    case 'whitelist':
    case 'unwhitelist': {
      if (!iid) {
        return 'You must enter an IID';
      }
      break;
    }
    case 'baninfo': {
      if (!bid) {
        return 'You must enter an BID';
      }
      break;
    }
    case 'searchalts': {
      duration = parseInt(time, 10);
      if (Number.isNaN(duration) || (duration <= 0)) {
        duration = null;
      }
      // duration in days
      duration = Math.ceil(duration / (1000 * 3600 * 24));
      // fall through
    }
    case 'status': {
      if (!iidOrUserIdOrName) {
        return 'You must enter an IID or UserId or Name';
      }
      break;
    }
    case 'checkFlag': {
      iidOrUserIdOrName = iidOrUserIdOrName?.trim();
      if (!iidOrUserIdOrName || iidOrUserIdOrName.length > 100
        || /[\r\n]/.test(iidOrUserIdOrName)
      ) {
        return 'You must enter an IID, UserId or Name';
      }
      break;
    }
    case 'checktwink': {
      iidOrUserIdOrName = iidOrUserIdOrName?.trim();
      if (!/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i
        .test(iidOrUserIdOrName || '')
      ) {
        return 'You must enter a valid IID';
      }
      break;
    }
    case 'checkIID': {
      iidOrUserIdOrName = iidOrUserIdOrName?.trim();
      if (!/^[1-9]\d*$/.test(iidOrUserIdOrName || '')
        || !Number.isSafeInteger(Number(iidOrUserIdOrName))
      ) {
        return 'You must enter a valid User ID';
      }
      break;
    }
    case 'checkproxy': {
      iidOrUserIdOrName = iidOrUserIdOrName?.trim();
      const isIID = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i
        .test(iidOrUserIdOrName || '');
      const isUserId = /^[1-9]\d*$/.test(iidOrUserIdOrName || '')
        && Number.isSafeInteger(Number(iidOrUserIdOrName));
      if (!isIID && !isUserId) {
        return { error: 'Enter a valid IID or numeric User ID' };
      }
      break;
    }
    case 'changeusername': {
      if (!iidOrUserIdOrName) {
        return 'You must enter a UserId';
      }
      username = username?.trim();
      const err = validateUsername(username);
      if (err) {
        return err;
      }
      break;
    }
    case 'ban':
    case 'baniid': {
      // duration in seconds
      duration = Math.ceil(parseInt(time, 10) / 1000);
      if (Number.isNaN(duration) || (duration < 0)) {
        return 'No valid expiration time';
      }
      if (!reason?.trim()) {
        return 'You must enter a reason';
      }
      if (!identifiers) {
        return 'You must enter at least one identifier';
      }
      {
        const values = identifiers.split('\n').map((value) => value.trim())
          .filter(Boolean);
        if (!values.length) {
          return 'You must enter at least one IID';
        }
        if (values.some((value) => (
          !/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(value)
        ))) {
          return 'BANIID accepts valid IID values only';
        }
        identifierUuidList.push(...values);
      }
      break;
    }
    case 'banid': {
      duration = Math.ceil(parseInt(time, 10) / 1000);
      if (Number.isNaN(duration) || duration < 0) {
        return 'No valid expiration time';
      }
      if (!reason?.trim()) {
        return 'You must enter a reason';
      }
      if (!identifiers) {
        return 'You must enter at least one account ID';
      }
      {
        const values = identifiers.split('\n').map((value) => value.trim())
          .filter(Boolean);
        if (!values.length) {
          return 'You must enter at least one account ID';
        }
        if (values.some((value) => !/^[1-9]\d*$/.test(value)
          || !Number.isSafeInteger(Number(value)))) {
          return 'BANID accepts account IDs only';
        }
        identifierUserIdList.push(...values.map((value) => Number(value)));
      }
      break;
    }
    case 'unban': {
      if (!identifiers) {
        return 'You must enter at least one IID, User Id or BID';
      }
      identifiers.split('\n').forEach((i) => {
        i = i.trim();
        if (i.indexOf('-') !== -1) {
          identifierUuidList.push(i);
        } else {
          const userId = parseInt(i, 10);
          if (userId) {
            identifierUserIdList.push(userId);
          }
        }
      });
      break;
    }
    default:
      // nothing
  }

  let ipString;
  if (iid) {
    ipString = await getIPofIID(iid);
    if (!ipString) {
      return `Could not resolve ${iid}`;
    }
  }

  switch (action) {
    case 'checkproxy': {
      let target;
      let ips;
      if (iidOrUserIdOrName.includes('-')) {
        const ip = await getIPofIID(iidOrUserIdOrName);
        if (!ip) {
          return { error: `Could not resolve ${iidOrUserIdOrName}` };
        }
        target = { iid: iidOrUserIdOrName };
        ips = [ip];
      } else {
        const user = await findUserByIdOrName(iidOrUserIdOrName);
        if (!user || String(user.id) !== iidOrUserIdOrName) {
          return { error: 'No such user ID found' };
        }
        target = { id: user.id, name: user.name };
        const history = await getIPHistoryOfUser(user.id);
        ips = [...new Set(history.map((entry) => entry.ip))];
      }
      if (!ips.length) {
        ModtoolsLogger.modViewAction(modUser, action, iidOrUserIdOrName);
        return {
          type: action,
          target,
          providerEnabled: true,
          entries: [],
        };
      }
      const [ipInfos, intelResults] = await Promise.all([
        getIPInfos(ips),
        Promise.all(ips.map((ip) => getIPIntelOverShards(ip, true, true))),
      ]);
      const entries = ips.map((ip, index) => {
        const [whoisData, data] = intelResults[index];
        const ipInfo = ipInfos.get(ip);
        const hasResult = !!(data?.ipqs?.found || Number(data?.isProxy) > 0
          || data?.providerVotes?.answered
          || (!data?.ipqs && (
            data?.type
            || (data?.risk !== null && data?.risk !== undefined)
            || (data?.confidence !== null
              && data?.confidence !== undefined)
          )));
        return {
          iid: ipInfo?.iid || null,
          country: whoisData?.country && whoisData.country !== 'xx'
            ? whoisData.country
            : ipInfo?.country && ipInfo.country !== 'xx'
              ? ipInfo.country : data?.ipqs?.country || 'xx',
          ip,
          proxy: isConfirmedProxy(data) && !PROXYCHECK_LOG_ONLY,
          wouldBlock: isConfirmedProxy(data),
          proxyLogOnly: PROXYCHECK_LOG_ONLY,
          needsProxyCaptcha: data?.proxyVerdict === 'uncertain'
            || (hasProxyRisk(data?.risk)
            && !isConfirmedProxy(data)),
          proxyVerdict: data?.proxyVerdict || 'unknown',
          providerVotes: data?.providerVotes || { sources: [] },
          hasResult,
          source: data?.source || (hasResult
            ? 'Three-provider reputation check' : null),
          type: data?.type || null,
          provider: data?.operator || whoisData?.org || null,
          organization: whoisData?.org || data?.ipqs?.organization || null,
          asn: whoisData?.asn || data?.ipqs?.asn || null,
          city: data?.city || data?.ipqs?.city || null,
          region: data?.ipqs?.region || null,
          risk: data?.risk ?? null,
          confidence: data?.confidence ?? null,
          expiresTs: data?.expiresTs || null,
          isWhitelisted: !!ipInfo?.isWhitelisted,
          ipqs: data?.ipqs || { found: false },
        };
      });
      ModtoolsLogger.modViewAction(modUser, action, iidOrUserIdOrName);
      return {
        type: action,
        target,
        providerEnabled: true,
        entries,
      };
    }
    case 'checkIID': {
      const user = await findUserByIdOrName(iidOrUserIdOrName);
      if (!user || String(user.id) !== iidOrUserIdOrName) {
        return { error: 'No such user ID found' };
      }
      const history = await getIPHistoryOfUser(user.id);
      const entriesByIP = new Map();
      history.forEach((entry) => {
        const existing = entriesByIP.get(entry.ip);
        if (!existing
          || new Date(entry.lastSeen) > new Date(existing.lastSeen)
        ) {
          entriesByIP.set(entry.ip, entry);
        }
      });
      const entries = [...entriesByIP.values()].map((entry) => ({
        country: entry.country,
        ip: entry.ip,
        iid: entry.iid,
      }));
      ModtoolsLogger.modViewAction(modUser, action, user.id);
      return {
        type: 'checkIID',
        target: { id: user.id, name: user.name },
        entries,
      };
    }
    case 'checktwink': {
      const ip = await getIPofIID(iidOrUserIdOrName);
      if (!ip) {
        return { error: `Could not resolve ${iidOrUserIdOrName}` };
      }
      const [iids] = await findAlts(null, ip);
      const ipsByIID = await getIPsOfIIDs(iids.slice(0, 299));
      const ips = [...new Set([ip, ...ipsByIID.values()])];
      const [ipInfos, accountIdsByIP] = await Promise.all([
        getIPInfos(ips),
        getAccountIdsByIPs(ips),
      ]);
      ModtoolsLogger.modViewAction(modUser, action, iidOrUserIdOrName);
      return {
        type: 'checktwink',
        target: { iid: iidOrUserIdOrName },
        entries: ips.map((entryIP) => ({
          country: ipInfos.get(entryIP)?.country || 'xx',
          ip: entryIP,
          accountIds: accountIdsByIP.get(entryIP) || [],
        })),
      };
    }
    case 'checkFlag': {
      let target;
      let entries;
      if (iidOrUserIdOrName.includes('-')) {
        const ip = await getIPofIID(iidOrUserIdOrName);
        if (!ip) {
          return `Could not resolve ${iidOrUserIdOrName}`;
        }
        const ipInfo = await getIPInfos(ip);
        const info = ipInfo.get(ip);
        entries = info ? [{
          ...info,
          ip,
          lastSeen: null,
        }] : [];
        target = { iid: iidOrUserIdOrName };
      } else {
        const user = await findUserByIdOrName(iidOrUserIdOrName);
        if (!user) {
          return 'No such user found';
        }
        target = { id: user.id, name: user.name };
        entries = await getIPHistoryOfUser(user.id);
      }

      const hostingPattern = new RegExp([
        'vpn', 'proxy', 'hosting', 'cloud', 'server', 'datacenter',
        'data center', 'tor', 'vps', 'virtual', 'colo', 'amazon', 'aws',
        'google cloud', 'microsoft azure', 'digitalocean', 'ovh',
        'hetzner', 'linode', 'vultr',
      ].join('|'), 'i');
      const results = entries.map((entry) => {
        const provider = [entry.org, entry.descr, entry.type]
          .filter(Boolean)
          .join(' ');
        const knownProxy = Number(entry.isProxy) > 0;
        const heuristicProxy = !knownProxy && hostingPattern.test(provider);
        let proxySource = 'No proxy signal';
        if (knownProxy) {
          proxySource = 'Stored proxy intelligence';
        } else if (heuristicProxy) {
          proxySource = 'Hosting/network heuristic';
        }
        return {
          ip: entry.ip,
          iid: entry.iid,
          lastSeen: entry.lastSeen,
          country: entry.country || 'xx',
          proxy: knownProxy || heuristicProxy,
          proxySource,
          proxyType: entry.type || null,
          proxyOperator: entry.operator || null,
          proxyRisk: entry.risk ?? null,
          proxyConfidence: entry.confidence ?? null,
          organization: entry.org || entry.descr || null,
          asn: entry.asn ?? null,
          isWhitelisted: !!entry.isWhitelisted,
        };
      });
      ModtoolsLogger.modViewAction(modUser, action, iidOrUserIdOrName);
      return { target, entries: results };
    }
    case 'status': {
      let ipInfo;
      let banInfos;
      let out;
      if (iidOrUserIdOrName.indexOf('-') !== -1) {
        /* IID */
        ipInfo = await getIPInfos(null, iidOrUserIdOrName);
      } else if (iidOrUserIdOrName.indexOf('.') !== -1) {
        /* IP */
        ipInfo = await getIPInfos(iidOrUserIdOrName, null);
      }

      /* getIPInfos always returns Array */
      if (ipInfo) {
        if (!ipInfo.size) {
          return 'No such IID found';
        }
        /* there is only one value, get it */
        ipInfo = ipInfo.values().next().value;

        const {
          country, cidr, org,
          descr, asn, type, isProxy, isWhitelisted,
        } = ipInfo;
        // eslint-disable-next-line max-len
        out = `IP: ${iidOrUserIdOrName}\nCountry: ${country}\nCIDR: ${cidr}\norg: ${org}\ndesc: ${descr}\nasn: ${asn}\nType: ${type}\nisProxy: ${isProxy}\nisWhitelisted: ${isWhitelisted}\n`;
        banInfos = await getBanInfos(null, null, ipInfo.iid, null);
      } else {
        /* UserID */
        const user = await findUserByIdOrName(iidOrUserIdOrName);
        if (!user) {
          return 'No such user found';
        }
        // eslint-disable-next-line max-len
        out = `ID: ${user.id}\nName: ${user.name}\nUsername: ${user.username}\nUserlvl: ${user.userlvl}\nFlags: ${user.flags}\n`;
        banInfos = await getBanInfos(null, user.id, null, null);

        let tpids = await getTPIDsOfUser(user.id);
        if (tpids.length) {
          out += '\nTPIDs:\n';
        }
        tpids.forEach(({ provider, tpid, verified }) => {
          // eslint-disable-next-line max-len
          out += `\nProvider: ${provider}\nTPID: ${censorIdentifier(tpid)}\nVerified: ${!!verified}\n`;
        });

        tpids = await getTPIDHistoryOfUser(user.id);
        if (tpids.length) {
          out += '\nTPID History:\n';
        }
        tpids.forEach(({ provider, tpid, verified, lastSeen }) => {
          // eslint-disable-next-line max-len
          out += `\nProvider: ${provider}\nTPID: ${censorIdentifier(tpid)}\nVerified: ${!!verified}\nDeleted at: ${lastSeen.toLocaleString()}\n`;
        });
      }
      if (banInfos?.length) {
        out += '\n';
        out += await printBans(banInfos);
      }
      ModtoolsLogger.modViewAction(modUser, action, iidOrUserIdOrName);
      return out;
    }
    case 'listonline': {
      const { onlineIPUsers } = socketEvents;
      const ips = Object.keys(onlineIPUsers);
      const [ipToIdMap, idToNameMap] = await Promise.all([
        getIIDsOfIPs(ips),
        getNamesToIds([...new Set(
          Object.values(onlineIPUsers).flat().map(Number),
        )]),
      ]);
      ModtoolsLogger.modViewAction(modUser, action);
      return Object.entries(onlineIPUsers).flatMap(([ip, uidList]) => (
        uidList.map((uid) => ({
          iid: ipToIdMap.get(ip) || 'N/A',
          id: Number(uid),
          nickname: idToNameMap.get(Number(uid)) || 'N/A',
        }))
      )).sort((a, b) => a.id - b.id);
    }
    case 'searchalts': {
      let userId;
      if (iidOrUserIdOrName.indexOf('-') !== -1) {
        /* IID */
        ipString = await getIPofIID(iidOrUserIdOrName);
      } else {
        /* user id or name */
        userId = parseInt(iidOrUserIdOrName, 10);
        if (Number.isNaN(userId)) {
          const user = await findUserByIdOrName(iidOrUserIdOrName);
          if (user) {
            userId = user.id;
          } else {
            userId = null;
          }
        }
      }
      const [iids, userIds] = await findAlts(userId, ipString, duration);
      ModtoolsLogger.modViewAction(modUser, action, iidOrUserIdOrName);
      return {
        type: 'searchalts',
        target: { name: String(iidOrUserIdOrName) },
        entries: [
          ...userIds.map((id) => ({ kind: 'account', identifier: String(id) })),
          ...iids.map((value) => ({ kind: 'iid', identifier: value })),
        ],
      };
    }
    case 'baninfo': {
      const banInfos = await getBanInfos(null, null, null, bid);
      if (!banInfos?.length) {
        return 'No such ban found';
      }
      ModtoolsLogger.modViewAction(modUser, action, bid);
      return printBans(banInfos);
    }
    case 'givecaptcha': {
      await forceCaptcha(ipString);
      socketEvents.reloadIP(ipString, true);
      ModtoolsLogger.modIIDAction(modUser, action, iid);
      return `Forced captcha on ${iid}`;
    }
    case 'changeusername': {
      const [curUser, targetUser] = await Promise.all([
        findUserByIdOrName(username), findUserByIdOrName(iidOrUserIdOrName),
      ]);
      if (!targetUser) {
        return `No user ${iidOrUserIdOrName} found`;
      }
      let out = '';
      if (curUser?.username === username) {
        await setUserProperty(curUser.id, 'username', `pp_${curUser.id}`);
        socketEvents.reloadUser(curUser.id);
        out += `Changed ${curUser.username} to pp_${curUser.id} and `;
      }
      const succ = await setUserProperty(targetUser.id, 'username', username);
      if (!succ) {
        // eslint-disable-next-line max-len
        return `${out}Couldn't change ${targetUser.username}, ${username} probably already exists.`;
      }
      socketEvents.reloadUser(targetUser.id);
      ModtoolsLogger.modIIDAction(modUser, action, targetUser.id, username);
      return `${out}Changed username of ${targetUser.username} to ${username}`;
    }
    case 'ban':
    case 'baniid': {
      const userIds = null;
      const iids = identifierUuidList;
      const [bannedIpStrings, bannedUserIds] = await ban(
        null, userIds, iids, false, true, reason, duration || null, modUser.id,
      );
      if (bannedIpStrings.length || bannedUserIds.length) {
        // eslint-disable-next-line max-len
        return `Successfully banned ${bannedUserIds.length} users and ${bannedIpStrings.length} IPs`;
      }
      return 'Could not ban user';
    }
    case 'banid': {
      const [bannedIpStrings, bannedUserIds] = await ban(
        null, identifierUserIdList, null, false, true, reason, duration || null,
        modUser.id,
      );
      if (bannedIpStrings.length || bannedUserIds.length) {
        // eslint-disable-next-line max-len
        return `Successfully banned ${bannedUserIds.length} users and ${bannedIpStrings.length} IPs`;
      }
      return 'Could not ban user';
    }
    case 'unban': {
      const [unbannedIpStrings, unbannedUserIds] = await unban(
        null, identifierUserIdList, identifierUuidList, identifierUuidList,
        true, true, modUser.id,
      );
      let ret = '';
      if (unbannedIpStrings.length) {
        const iids = await getIIDsOfIPs(unbannedIpStrings);
        ret += `Unbanned IIDs: \n${Array.from(iids.values()).join('\n')}`;
      }
      if (unbannedUserIds.length) {
        if (ret) ret += '\n';
        ret += `Unbanned UserIds: \n${unbannedUserIds.join('\n')}`;
      }
      if (ret) {
        return ret;
      }
      return 'No applying Ban found';
    }
    case 'whitelist': {
      const ret = await whitelist(ipString);
      if (ret) {
        return 'Successfully whitelisted user';
      }
      return 'User is already whitelisted';
    }
    case 'unwhitelist': {
      const ret = await unwhitelist(ipString);
      if (ret) {
        return 'Successfully removed user from whitelist';
      }
      return 'User is not on whitelist';
    }
    default:
      return `Failed to ${action}`;
  }
}

/**
 * execute media specific action
 * @param action what to do
 * @param mediaId
 */
export async function executeMediaAction(
  action, mediaIdOrMbid, reason, user,
) {
  switch (action) {
    case 'ban': {
      if (!mediaIdOrMbid) {
        throw new Error('No mediaId defined');
      }
      reason = MEDIA_BAN_REASONS[reason?.toUpperCase()];
      if (!reason) {
        throw new Error('No valid reason given');
      }
      const result = await banMedia(mediaIdOrMbid, reason, user.id);
      if (!result) {
        throw new Error('Could not ban media');
      }
      ModtoolsLogger.banMedia(user, mediaIdOrMbid, reason);
      // eslint-disable-next-line max-len
      return `Successfully banned media, affected:\n${result[0]} users\n${result[1]} IPs\n ${result[2]} channels`;
    }
    case 'unban': {
      if (!mediaIdOrMbid) {
        throw new Error('No Media BID defined');
      }
      const success = await unbanMedia(mediaIdOrMbid);
      if (!success) {
        throw new Error('Could not unban media');
      }
      ModtoolsLogger.unbanMedia(user, mediaIdOrMbid);
      return 'Successfully unbaned media';
    }
    default:
      throw new Error(`Failed to ${action} media`);
  }
}

/**
 * Execute Image based actions (upload, protect, etc.)
 * @param action what to do with the image
 * @param file imagefile
 * @param coords coord sin X_Y format
 * @param canvasid numerical canvas id as string
 * @param user mod user
 * @return [ret, msg] http status code and message
 */
export async function executeImageAction(
  action,
  buffer,
  coords,
  canvasid,
  user,
) {
  if (!coords) {
    return [403, 'Coordinates not defined'];
  }
  if (!canvasid) {
    return [403, 'canvasid not defined'];
  }
  if (!buffer) {
    return [403, 'No file given'];
  }

  const splitCoords = coords.trim().split('_');
  if (splitCoords.length !== 2) {
    return [403, 'Invalid Coordinate Format'];
  }
  const [x, y] = splitCoords.map((z) => Math.floor(Number(z)));

  const canvas = canvases[canvasid];

  let error = null;
  if (Number.isNaN(x)) {
    error = 'x is not a valid number';
  } else if (Number.isNaN(y)) {
    error = 'y is not a valid number';
  } else if (!action) {
    error = 'No imageaction given';
  } else if (!canvas) {
    error = 'Invalid canvas selected';
  } else if (canvas.v) {
    error = 'Can not upload Image to 3D canvas';
  }
  if (error !== null) {
    return [403, error];
  }

  const canvasMaxXY = canvas.size / 2;
  const canvasMinXY = -canvasMaxXY;
  if (x < canvasMinXY || y < canvasMinXY
    || x >= canvasMaxXY || y >= canvasMaxXY) {
    return [403, 'Coordinates are outside of canvas'];
  }

  const protect = (action === 'protect');
  const wipe = (action === 'wipe');
  if (!['build', 'protect', 'wipe'].includes(action)) {
    return [403, 'Invalid image action'];
  }

  let image;
  try {
    image = await sharp(buffer)
      .toColourspace('srgb')
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
  } catch (imageError) {
    return [400, `Can not read image file: ${imageError.message}`];
  }

  const { data, info } = image;
  const pxlCount = await imageABGR2Canvas(
    canvasid,
    x, y,
    data,
    info.width, info.height,
    wipe, protect,
  );

  await ModtoolsLogger.uploadImage(
    user, canvas.ident, x, y, info.width, info.height, action, pxlCount,
  );
  return [
    200,
    `Successfully applied ${action} image with ${pxlCount} pixels at ${x}/${y}`,
  ];
}

/*
 * register responses on socket for Watch Actions
 */
socketEvents.onReq('watch', (action, ...args) => {
  try {
    if (action === 'getIIDSummary') {
      return getIIDSummary(...args);
    } if (action === 'getIIDPixels') {
      return getIIDPixels(...args);
    } if (action === 'getSummaryFromArea') {
      return getSummaryFromArea(...args);
    } if (action === 'getPixelsFromArea') {
      return getPixelsFromArea(...args);
    }
  } catch {
    // silently fail when file couldn't be parsed
  }
  return null;
});

/*
 * Check who placed on a canvas area
 * @param action if every pixel or summary should be returned
 * @param ulcoor coords of upper-left corner in X_Y format
 * @param brcoor coords of bottom-right corner in X_Y format
 * @param canvasid numerical canvas id as string
 * @return Object with {info, cols, rows}
 */
export async function executeWatchAction(
  action,
  ulcoor,
  brcoor,
  time,
  iid,
  canvasid,
  clr,
  maxrows,
  maxentities,
) {
  if (!canvasid) {
    return { info: 'canvasid not defined' };
  }

  maxentities = parseInt(maxentities, 10);
  if (!maxentities || maxentities < 1) {
    maxentities = 25;
  } else if (maxentities > 200) {
    maxentities = 200;
  }

  maxrows = parseInt(maxrows, 10);
  if (!maxrows || maxrows < 1) {
    maxrows = 300;
  } else if (maxrows > 10000) {
    maxrows = 10000;
  }

  clr = parseInt(clr, 10);
  if (Number.isNaN(clr)) {
    clr = null;
  }

  const ts = parseInt(time, 10);
  const canvas = canvases[canvasid];
  let error = null;
  if (!canvas) {
    error = 'Invalid canvas selected';
  } else if (!action) {
    error = 'No cleanaction given';
  } else if (Number.isNaN(ts)) {
    error = 'Invalid time given';
  }
  if (error) {
    return { info: error };
  }

  let ret;
  if (!ulcoor && !brcoor && iid) {
    if (action === 'summary') {
      ret = await socketEvents.reqAll(
        'watch',
        'getIIDSummary',
        iid,
        time,
      );
    }
    if (action === 'all') {
      ret = await socketEvents.reqAll(
        'watch',
        'getIIDPixels',
        iid,
        time,
        maxrows,
      );
    }
    if (typeof ret === 'string') {
      return { info: ret };
    }
    if (typeof ret !== 'undefined') {
      return ret;
    }
  }

  const parseCoords = validateCoorRange(ulcoor, brcoor, canvas.size);
  if (typeof parseCoords === 'string') {
    return { info: parseCoords };
  }
  const [x, y, u, v] = parseCoords;

  if (action === 'summary') {
    ret = await socketEvents.reqAll(
      'watch',
      'getSummaryFromArea',
      canvasid,
      clr,
      x, y, u, v,
      time,
      iid,
      maxentities,
    );
  }
  if (action === 'all') {
    ret = await socketEvents.reqAll(
      'watch',
      'getPixelsFromArea',
      canvasid,
      clr,
      x, y, u, v,
      time,
      iid,
      maxrows,
      maxentities,
    );
  }
  if (typeof ret === 'string') {
    return { info: ret };
  }
  if (typeof ret !== 'undefined') {
    await populateTable(ret);
    return ret;
  }
  return { info: 'Invalid action given' };
}

/**
 * Execute actions for cleaning/filtering canvas
 * @param action what to do
 * @param ulcoor coords of upper-left corner in X_Y format
 * @param brcoor coords of bottom-right corner in X_Y format
 * @param canvasid numerical canvas id as string
 * @param user mod user
 * @return [ret, msg] http status code and message
 */
export async function executeCleanerAction(
  action,
  ulcoor,
  brcoor,
  canvasid,
  user,
  templateColors = '',
) {
  if (!canvasid) {
    return [403, 'canvasid not defined'];
  }
  const canvas = canvases[canvasid];
  let error = null;
  if (!canvas) {
    error = 'Invalid canvas selected';
  } else if (!action) {
    error = 'No cleanaction given';
  }
  if (error) {
    return [403, error];
  }

  const parseCoords = validateCoorRange(ulcoor, brcoor, canvas.size);
  if (typeof parseCoords === 'string') {
    return [403, parseCoords];
  }
  const [x, y, u, v] = parseCoords;
  let templateMask = null;
  if (action === 'template') {
    const expectedLength = (u - x + 1) * (v - y + 1);
    if (expectedLength > 100000 || typeof templateColors !== 'string'
      || templateColors.length > 140000
      || !/^[A-Za-z0-9+/]+={0,2}$/.test(templateColors)
    ) {
      return [403, 'Invalid template color mask'];
    }
    templateMask = Buffer.from(templateColors, 'base64');
    if (templateMask.length !== expectedLength
      || !templateMask.some((color) => color > 0)
      || templateMask.some((color) => color > 64)
    ) {
      return [403, 'Invalid template color mask'];
    }
  } else if (templateColors) {
    return [403, 'Template colors are only valid for template cleanup'];
  }

  error = CanvasCleaner.set(
    canvasid, x, y, u, v, action, 0, templateMask,
  );
  if (error) {
    return [403, error];
  }
  ModtoolsLogger.setCanvasCleaner(
    user, canvas.ident, x, y, u - x + 1, v - y + 1, action,
  );
  // eslint-disable-next-line max-len
  const report = `set Canvas Cleaner to *"${action}"* from #${canvas.ident},${x},${y} to #${canvas.ident},${u},${v}`;
  return [200, report];
}

/**
 * Execute actions for protecting areas
 * @param action what to do
 * @param ulcoor coords of upper-left corner in X_Y format
 * @param brcoor coords of bottom-right corner in X_Y format
 * @param canvasid numerical canvas id as string
 * @param user mod user
 * @return [ret, msg] http status code and message
 */
export async function executeProtAction(
  action,
  ulcoor,
  brcoor,
  canvasid,
  user,
) {
  if (!canvasid) {
    return [403, 'canvasid not defined'];
  }
  const canvas = canvases[canvasid];
  let error = null;
  if (!canvas) {
    error = 'Invalid canvas selected';
  } else if (!action) {
    error = 'No imageaction given';
  } else if (action !== 'protect' && action !== 'unprotect') {
    error = 'Invalid action (must be protect or unprotect)';
  }
  if (error !== null) {
    return [403, error];
  }

  const parseCoords = validateCoorRange(ulcoor, brcoor, canvas.size);
  if (typeof parseCoords === 'string') {
    return [403, parseCoords];
  }
  const [x, y, u, v] = parseCoords;

  const width = u - x + 1;
  const height = v - y + 1;
  if (width * height > 10000000) {
    return [403, 'Can not set protection to more than 10m pixels at once'];
  }
  const protect = action === 'protect';
  const pxlCount = await protectCanvasArea(
    canvasid,
    x,
    y,
    width,
    height,
    protect,
  );
  if (protect) {
    ModtoolsLogger.protect(
      user, canvas.ident, x, y, width, height, pxlCount,
    );
  } else {
    ModtoolsLogger.unprotect(
      user, canvas.ident, x, y, width, height, pxlCount,
    );
  }
  return [
    200,
    (protect)
    // eslint-disable-next-line max-len
      ? `Successfully protected ${width}x${height} area at #${canvas.ident},${x},${y} with ${pxlCount}pxls (${ulcoor} - ${brcoor})`
    // eslint-disable-next-line max-len
      : `Successfully unprotected ${width}x${height} area at #${canvas.ident},${x},${y} with ${pxlCount}pxls (${ulcoor} - ${brcoor})`,
  ];
}

export async function executePasteColorAction(
  ulcoor,
  brcoor,
  colorIndex,
  canvasid,
  user,
) {
  if (!canvasid) {
    return [403, 'canvasid not defined'];
  }
  const canvas = canvases[canvasid];
  if (!canvas) {
    return [403, 'Invalid canvas selected'];
  }
  if (canvas.v) {
    return [403, 'Can not fill color on a 3D canvas'];
  }

  const parsedColorIndex = Number(colorIndex);
  if (!/^\d+$/.test(String(colorIndex))
    || !Number.isInteger(parsedColorIndex)
    || parsedColorIndex <= 0
    || parsedColorIndex >= canvas.colors.length
  ) {
    return [403, 'Invalid palette color'];
  }

  const parseCoords = validateCoorRange(ulcoor, brcoor, canvas.size);
  if (typeof parseCoords === 'string') {
    return [403, parseCoords];
  }
  const [x, y, u, v] = parseCoords;
  const width = u - x + 1;
  const height = v - y + 1;
  if (width * height > 10000000) {
    return [403, 'Can not paste color into more than 10m pixels at once'];
  }

  const pixelsChanged = await fillCanvasAreaWithColor(
    canvasid,
    x,
    y,
    width,
    height,
    parsedColorIndex,
  );
  await ModtoolsLogger.uploadImage(
    user,
    canvas.ident,
    x,
    y,
    width,
    height,
    `set color to palette index ${parsedColorIndex}`,
    pixelsChanged,
  );
  return [
    200,
    `Filled ${width}x${height} area with palette color ${parsedColorIndex}; `
    + `changed ${pixelsChanged} pixels.`,
  ];
}

/**
 * Execute rollback
 * @param date in format YYYYMMdd
 * @param time in format hhmm
 * @param ulcoor coords of upper-left corner in X_Y format
 * @param brcoor coords of bottom-right corner in X_Y format
 * @param canvasid numerical canvas id as string
 * @param user mod user
 * @return [ret, msg] http status code and message
 */
export async function executeRollback(
  date,
  time,
  ulcoor,
  brcoor,
  canvasid,
  user,
) {
  if (!canvasid) {
    return [403, 'canvasid not defined'];
  }
  const canvas = canvases[canvasid];
  let error = null;
  if (!canvas) {
    error = 'Invalid canvas selected';
  } else if (!date) {
    error = 'No date given';
  } else if (!time) {
    error = 'No time given';
  } else if (Number.isNaN(Number(date)) || date.length !== 8) {
    error = 'Invalid date';
  } else if (Number.isNaN(Number(time)) || time.length !== 4) {
    error = 'Invalid time';
  }
  if (error !== null) {
    return [403, error];
  }

  const parseCoords = validateCoorRange(ulcoor, brcoor, canvas.size);
  if (typeof parseCoords === 'string') {
    return [403, parseCoords];
  }
  const [x, y, u, v] = parseCoords;

  const width = u - x + 1;
  const height = v - y + 1;
  if (user.userlvl < USERLVL.ADMIN && width * height > 1000000) {
    return [403, 'Can not rollback more than 1m pixels at once'];
  }

  const pxlCount = await rollbackCanvasArea(
    canvasid,
    x,
    y,
    width,
    height,
    date,
    time,
  );
  ModtoolsLogger.rollback(
    user, canvas.ident, x, y, width, height, date, time, pxlCount,
  );
  return [
    200,
    // eslint-disable-next-line max-len
    `Successfully rolled back to ${date} for ${width}x${height} area at #${canvas.ident},${x},${y} with ${pxlCount}pxls (${ulcoor} - ${brcoor})`,
  ];
}

/**
 * demoe a user of a certain userlvl
 * @param userId
 */
export async function demoteUser(userId) {
  userId = parseInt(userId, 10);
  if (Number.isNaN(userId)) {
    throw new Error('Invalid userId');
  }
  const success = await setUserProperty(userId, 'userlvl', USERLVL.VERIFIED);
  if (success) {
    const roleSync = await syncModeratorRole(userId, USERLVL.VERIFIED);
    socketEvents.reloadUser(userId);
    const syncWarning = roleSync.success
      ? '' : ` Discord role warning: ${roleSync.reason}.`;
    return `All moderation rights removed from user with the id ${userId}.${syncWarning}`;
  }
  throw new Error('Couldn\'t remove moderation rights from user');
}

/**
 * promote a user to a certain userlvl
 * @param name name or id of user
 * @param userlvl wanted level
 */
export async function promoteUser(name, userlvl) {
  if (!name) {
    throw new Error('No username given');
  }
  if (![USERLVL.CHATMOD, USERLVL.CLEANER, USERLVL.JANNY,
    USERLVL.TRIALMOD, USERLVL.MOD].includes(userlvl)) {
    throw new Error('Invalid moderator role');
  }
  const user = await findUserByIdOrName(name);
  if (!user?.id) {
    throw new Error(`User ${name} not found`);
  }
  const { id } = user;
  const linkedProviders = await getTpidProviders(
    id, [THREEPID_PROVIDERS.DISCORD],
  );
  if (!linkedProviders.has(THREEPID_PROVIDERS.DISCORD)) {
    throw new Error('Link Discord before assigning a moderator role');
  }
  const success = await setUserProperty(id, 'userlvl', userlvl);
  if (success) {
    const roleSync = await syncModeratorRole(id, userlvl);
    socketEvents.reloadUser(id);
    return [
      id,
      user.name,
      roleSync.success ? null : `Discord role warning: ${roleSync.reason}.`,
    ];
  }
  throw new Error('Couldn\'t make user Mod');
}
