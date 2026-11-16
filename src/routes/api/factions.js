import express from 'express';
import path from 'path';
import { mkdir, readFile, rename, unlink, writeFile } from 'fs/promises';
import { randomUUID } from 'crypto';
import Busboy from 'busboy';
import sharp from 'sharp';

import pool from '../../data/sql/mariadb.js';
import { getMediaType } from '../../data/sql/Media.js';
import redis from '../../data/redis/client.js';
import { FACTION_NAPS_ENABLED, WarEnable } from '../../core/config.js';
import {
  getAllFactionRanks, getFactionRanks, getUserRanks,
} from '../../data/redis/ranks.js';
import {
  CHANNEL_TYPES, FACTION_FLAGS, USER_FACTION_FLAGS, USERLVL,
} from '../../core/constants.js';
import {
  getFactionPixelContributors,
  populateFactionRankEntities,
} from '../../data/sql/Faction.js';
import socketEvents from '../../socket/socketEvents.js';
import {
  FACTION_ALLIANCES_DIR, FACTION_FLAGS_DIR, FACTION_TEMPLATES_DIR,
} from '../../utils/factionFiles.js';
import {
  getFactionTerritory,
  invalidateUserFactionCache,
  notifyFactionNapUpdate,
  notifyNapBroken,
  updateFactionTerritory,
} from '../../core/factionTerritory.js';

const router = express.Router();
const getFactionRankingEntities = async () => (
  populateFactionRankEntities(await getAllFactionRanks())
);
const ROLE_ORDER = ['member', 'officer', 'deputy', 'leader', 'owner'];
const ROLE_LEVEL = { member: 0, officer: 25, deputy: 50, leader: 80, owner: 100 };
const PERMISSIONS = {
  member: [],
  officer: ['manageApplications'],
  deputy: ['manageApplications', 'manageInvites', 'manageMembers', 'manageTemplateAdds'],
  leader: [
    'manageFaction', 'manageApplications', 'manageInvites', 'manageMembers',
    'manageRanks', 'manageTemplates', 'manageTemplateAdds', 'manageConfigs',
    'manageCoordination', 'manageNaps',
  ],
  owner: [
    'manageFaction', 'manageApplications', 'manageInvites', 'manageMembers',
    'manageRanks', 'manageTemplates', 'manageTemplateAdds', 'manageConfigs',
    'manageCoordination', 'manageNaps', 'drawCoordination',
  ],
};
const PERMISSION_NAMES = [
  'manageFaction', 'manageFactionAppearance', 'manageApplications', 'manageInvites', 'manageMembers',
  'manageRanks', 'manageTemplates', 'manageTemplateAdds', 'manageConfigs',
  'manageCoordination', 'manageNaps', 'drawCoordination',
];

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function failIf(condition, status, message) {
  if (condition) throw httpError(status, message);
}

function ensureAuthenticated(req, res, next) {
  if (!req.user) {
    next(httpError(401, 'You must be logged in to perform this action.'));
    return;
  }
  next();
}

function parseId(value, field = 'id') {
  const id = Number(value);
  failIf(!Number.isSafeInteger(id) || id <= 0, 400, 'Invalid identifier: ' + field + '.');
  return id;
}

function parseOptionalInt(value, field, min, max) {
  const number = Number(value);
  failIf(!Number.isSafeInteger(number) || number < min || number > max, 400, 'Invalid value: ' + field + '.');
  return number;
}

function parseCanvasId(value) {
  const id = Number(value);
  failIf(!Number.isSafeInteger(id) || id < 0, 400, 'Invalid canvas identifier.');
  return id;
}

function validateString(value, field, min, max) {
  failIf(typeof value !== 'string', 400, 'Field "' + field + '" must be a string.');
  const normalized = value.trim();
  const length = Array.from(normalized).length;
  failIf(length < min || length > max, 400, 'Field "' + field + '" must be between ' + min + ' and ' + max + ' characters.');
  return normalized;
}

function validateNapTerms(value) {
  const allowedTypes = new Set([
    'abandon_territory',
    'cease_activity',
    'sever_ally',
    'surrender_restrictions',
  ]);
  failIf(!Array.isArray(value) || value.length < 1 || value.length > 10, 400, 'NAP terms must contain 1 to 10 clauses.');
  return value.map((term) => {
    failIf(!term || typeof term !== 'object' || Array.isArray(term), 400, 'Invalid NAP term.');
    failIf(!allowedTypes.has(term.type), 400, 'Unsupported NAP term type.');
    if (term.type === 'abandon_territory' || term.type === 'cease_activity') {
      return {
        type: term.type,
        templateId: parseId(term.templateId, 'templateId'),
        description: validateString(term.description, 'description', 1, 300),
      };
    }
    if (term.type === 'sever_ally') {
      return {
        type: term.type,
        allyFactionId: parseId(term.allyFactionId, 'allyFactionId'),
        description: validateString(term.description, 'description', 1, 300),
      };
    }
    return {
      type: term.type,
      restrictions: validateString(term.restrictions, 'restrictions', 1, 1000),
    };
  });
}

function validateAllianceTerms(value) {
  failIf(!Array.isArray(value) || value.length < 1 || value.length > 20, 400, 'Alliance terms must contain 1 to 20 clauses.');
  return value.map((term) => validateString(term, 'term', 1, 500));
}

function validateTag(value) {
  const tag = validateString(value, 'tag', 2, 3).toUpperCase();
  failIf(!/^[A-Z0-9]{2,3}$/.test(tag), 400, 'Tag must contain 2 to 3 uppercase Latin letters or numbers.');
  return tag;
}

function validateColor(value) {
  failIf(typeof value !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(value), 400, 'Color must be in #RRGGBB format.');
  return value.toLowerCase();
}

function parseCoordinationIds(value) {
  failIf(!Array.isArray(value) || value.length > 200, 400, 'Invalid coordinator list.');
  return [...new Set(value.map((id) => parseId(id, 'coordinationIds')))];
}

function sanitizeBBox(bbox) {
  if (!bbox || typeof bbox !== 'object') return null;
  const canvasId = parseCanvasId(bbox.canvasId ?? 0);
  const x1 = parseOptionalInt(bbox.x1 ?? 0, 'x1', -5000000, 5000000);
  const y1 = parseOptionalInt(bbox.y1 ?? 0, 'y1', -5000000, 5000000);
  const x2 = parseOptionalInt(bbox.x2 ?? 0, 'x2', -5000000, 5000000);
  const y2 = parseOptionalInt(bbox.y2 ?? 0, 'y2', -5000000, 5000000);
  return {
    canvasId,
    x1: Math.min(x1, x2),
    y1: Math.min(y1, y2),
    x2: Math.max(x1, x2),
    y2: Math.max(y1, y2),
  };
}

function validateTerritoryPayload(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.targetTerritory || raw.myTerritory) {
    const targetTerritory = sanitizeBBox(raw.targetTerritory);
    const myTerritory = sanitizeBBox(raw.myTerritory);
    if (!targetTerritory && !myTerritory) return null;
    return {
      canvasId: targetTerritory?.canvasId ?? myTerritory?.canvasId ?? 0,
      targetTerritory: targetTerritory || null,
      myTerritory: myTerritory || null,
    };
  }
  return sanitizeBBox(raw);
}

function clipToFactionTerritory(requested, factionTerritory) {
  if (!requested || !factionTerritory
    || Number(requested.canvasId) !== Number(factionTerritory.canvasId)
  ) {
    return null;
  }
  const clipped = {
    canvasId: Number(factionTerritory.canvasId),
    templateId: factionTerritory.templateId,
    x1: Math.max(requested.x1, factionTerritory.x1),
    y1: Math.max(requested.y1, factionTerritory.y1),
    x2: Math.min(requested.x2, factionTerritory.x2),
    y2: Math.min(requested.y2, factionTerritory.y2),
  };
  return clipped.x1 <= clipped.x2 && clipped.y1 <= clipped.y2
    ? clipped
    : null;
}

function formatTerritoryBBox(bbox) {
  return `canvas ${bbox.canvasId}, [${bbox.x1}, ${bbox.y1}]–[${bbox.x2}, ${bbox.y2}]`;
}

function requireNapsEnabled() {
  failIf(
    !FACTION_NAPS_ENABLED,
    503,
    'NAPs are disabled. Set FACTION_NAPS_ENABLED = yes and restart the server.',
  );
}

function requireWarsEnabled() {
  failIf(!WarEnable, 503, 'Alliances and wars are disabled by WarEnable.');
}

function getPermissions(role, customPermissions = null) {
  const allowed = new Set(PERMISSIONS[role] || []);
  const base = Object.fromEntries(PERMISSION_NAMES.map((name) => [name, allowed.has(name)]));
  if (customPermissions) {
    const custom = typeof customPermissions === 'string' ? parseJson(customPermissions, {}) : customPermissions;
    if (custom && typeof custom === 'object') {
      for (const [perm, val] of Object.entries(custom)) {
        if (PERMISSION_NAMES.includes(perm)) {
          base[perm] = Boolean(val);
        }
      }
    }
  }
  if (role === 'owner') {
    base.drawCoordination = true;
    base.manageFactionAppearance = true;
  }
  return base;
}

function requirePermission(membership, permission) {
  const perms = getPermissions(membership.role, membership.permissions);
  failIf(!perms[permission], 403, 'Insufficient permissions for this action.');
}

function requireFactionLeader(membership) {
  failIf(
    membership.role !== 'owner' && membership.role !== 'leader',
    403,
    'Only faction owners and leaders can manage diplomacy.',
  );
}

function patchChannelJoin(userId, channelId, channelName) {
  if (!channelId) return;
  const now = Date.now();
  socketEvents.patchUserState(userId, 'chat', {
    op: 'addnx',
    path: 'channels.' + CHANNEL_TYPES.FACTION + '[0:' + channelId + ']',
    value: [channelId, channelName, now, now, false, null],
  });
}

function patchChannelLeave(userIds, channelId) {
  if (!channelId || !userIds?.length) return;
  socketEvents.patchUserState(userIds, 'chat', {
    op: 'del',
    path: 'channels.' + CHANNEL_TYPES.FACTION + '[0:' + channelId + ']',
  });
}

async function transaction(callback) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const value = await callback(connection);
    await connection.commit();
    return value;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function getFactionMembership(userId, factionId, connection = pool) {
  const rows = await connection.query(
    'SELECT f.id, f.name AS slug, f.title, f.ownerId, f.cid AS channelId, '
    + 'f.memberCount, f.flags, f.openJoin, uf.`role`, uf.permissions '
    + 'FROM UserFactions uf INNER JOIN Factions f ON f.id = uf.fid '
    + 'WHERE uf.uid = ? AND uf.fid = ?' + (connection === pool ? '' : ' FOR UPDATE'),
    [userId, factionId],
  );
  if (!rows.length) return null;
  const membership = rows[0];
  if (Number(membership.ownerId) === Number(userId)) membership.role = 'owner';
  return membership;
}

async function requireMembership(userId, factionId, connection = pool) {
  const membership = await getFactionMembership(userId, factionId, connection);
  failIf(!membership, 403, 'You do not have access to this faction.');
  return membership;
}

async function writeAudit(connection, factionId, actorId, action, targetId = null, meta = null) {
  await connection.query(
    'INSERT INTO FactionAuditLogs (factionId, actorId, action, targetId, meta) VALUES (?, ?, ?, ?, ?)',
    [factionId, actorId, action, targetId, meta === null ? null : JSON.stringify(meta)],
  );
}

async function factionRoleId(connection, factionId, role) {
  const roleName = role[0].toUpperCase() + role.slice(1);
  await connection.query('SELECT id FROM Factions WHERE id = ? FOR UPDATE', [factionId]);
  const rows = await connection.query(
    'SELECT id FROM FactionRoles WHERE fid = ? AND name = ? ORDER BY id LIMIT 1',
    [factionId, roleName],
  );
  if (rows.length) return rows[0].id;
  const roleFlags = role === 'member' ? 3 : (role === 'owner' ? 1 : 0);
  const result = await connection.query(
    'INSERT INTO FactionRoles (uuid, fid, name, factionlvl, flags) VALUES (UUID_TO_BIN(?), ?, ?, ?, ?)',
    [randomUUID(), factionId, roleName, ROLE_LEVEL[role], roleFlags],
  );
  return result.insertId;
}

async function setLegacyFactionRole(connection, factionId, userId, role) {
  const roleId = await factionRoleId(connection, factionId, role);
  const oldRoles = await connection.query(
    'SELECT fr.id FROM UserFactionRoles ufr INNER JOIN FactionRoles fr ON fr.id = ufr.frid '
    + 'WHERE ufr.uid = ? AND fr.fid = ?',
    [userId, factionId],
  );
  const activeRoles = await connection.query(
    'SELECT p.activeRole FROM Profiles p INNER JOIN FactionRoles fr ON fr.id = p.activeRole '
    + 'WHERE p.uid = ? AND fr.fid = ? FOR UPDATE',
    [userId, factionId],
  );
  if (oldRoles.length) {
    const placeholders = oldRoles.map(() => '?').join(',');
    await connection.query(
      'UPDATE FactionRoles SET memberCount = GREATEST(memberCount - 1, 0) WHERE id IN (' + placeholders + ')',
      oldRoles.map((row) => row.id),
    );
  }
  await connection.query(
    'DELETE ufr FROM UserFactionRoles ufr INNER JOIN FactionRoles fr ON fr.id = ufr.frid '
    + 'WHERE ufr.uid = ? AND fr.fid = ?',
    [userId, factionId],
  );
  await connection.query('INSERT INTO UserFactionRoles (frid, uid) VALUES (?, ?)', [roleId, userId]);
  await connection.query('UPDATE FactionRoles SET memberCount = memberCount + 1 WHERE id = ?', [roleId]);
  if (activeRoles.length) {
    await connection.query('UPDATE Profiles SET activeRole = ? WHERE uid = ?', [roleId, userId]);
  }
  await connection.query(
    'INSERT INTO FactionMembers (factionId, userId, flags, joinedAt, memberRole, permissions) '
    + 'SELECT fid, uid, flags, joined, `role`, permissions FROM UserFactions '
    + 'WHERE fid = ? AND uid = ? ON DUPLICATE KEY UPDATE '
    + 'flags = VALUES(flags), joinedAt = VALUES(joinedAt), '
    + 'memberRole = VALUES(memberRole), permissions = VALUES(permissions)',
    [factionId, userId],
  );
}

async function addMember(connection, factionId, userId) {
  const users = await connection.query('SELECT id FROM Users WHERE id = ? FOR UPDATE', [userId]);
  failIf(!users.length, 404, 'Player not found.');
  const members = await connection.query('SELECT uid FROM UserFactions WHERE uid = ? FOR UPDATE', [userId]);
  failIf(members.length, 409, 'Player is already in a faction.');
  const factions = await connection.query('SELECT id, cid, ownerId FROM Factions WHERE id = ? FOR UPDATE', [factionId]);
  failIf(!factions.length, 404, 'Faction not found.');
  const [countRow] = await connection.query('SELECT COUNT(*) AS count FROM UserFactions WHERE fid = ?', [factionId]);
  const ownerRows = factions[0].ownerId
    ? await connection.query(
        'SELECT vipTier >= 2 AND (vipExpires IS NULL OR vipExpires > NOW()) AS premium '
        + 'FROM Users WHERE id = ?',
        [factions[0].ownerId],
      )
    : [];
  const limit = ownerRows[0]?.premium ? 200 : 50;
  failIf(Number(countRow.count) >= limit, 409, 'Faction member limit reached: ' + limit + '.');
  await connection.query('INSERT INTO UserFactions (uid, fid, `role`) VALUES (?, ?, ?)', [userId, factionId, 'member']);
  if (factions[0].cid) {
    await connection.query('INSERT IGNORE INTO UserChannels (uid, cid, lastRead) VALUES (?, ?, NOW())', [userId, factions[0].cid]);
  }
  const channelRows = factions[0].cid
    ? await connection.query('SELECT name FROM Channels WHERE id = ?', [factions[0].cid])
    : [];
  await setLegacyFactionRole(connection, factionId, userId, 'member');
  await connection.query('UPDATE Factions SET memberCount = memberCount + 1 WHERE id = ?', [factionId]);
  return { channelId: factions[0].cid, channelName: channelRows[0]?.name || '' };
}

async function removeMember(connection, factionId, userId) {
  const rows = await connection.query(
    'SELECT f.cid, c.name AS channelName FROM Factions f '
    + 'LEFT JOIN Channels c ON c.id = f.cid WHERE f.id = ? FOR UPDATE',
    [factionId],
  );
  failIf(!rows.length, 404, 'Faction not found.');
  const roleRows = await connection.query(
    'SELECT fr.id FROM UserFactionRoles ufr INNER JOIN FactionRoles fr ON fr.id = ufr.frid '
    + 'WHERE ufr.uid = ? AND fr.fid = ?',
    [userId, factionId],
  );
  await connection.query(
    'UPDATE Profiles SET activeRole = NULL WHERE uid = ? '
    + 'AND activeRole IN (SELECT id FROM FactionRoles WHERE fid = ?)',
    [userId, factionId],
  );
  if (roleRows.length) {
    const placeholders = roleRows.map(() => '?').join(',');
    await connection.query(
      'UPDATE FactionRoles SET memberCount = GREATEST(memberCount - 1, 0) WHERE id IN (' + placeholders + ')',
      roleRows.map((row) => row.id),
    );
  }
  await connection.query(
    'DELETE ufr FROM UserFactionRoles ufr INNER JOIN FactionRoles fr ON fr.id = ufr.frid '
    + 'WHERE ufr.uid = ? AND fr.fid = ?',
    [userId, factionId],
  );
  await connection.query('DELETE FROM UserFactions WHERE uid = ? AND fid = ?', [userId, factionId]);
  await connection.query(
    'DELETE FROM FactionMembers WHERE factionId = ? AND userId = ?',
    [factionId, userId],
  );
  if (rows[0].cid) {
    await connection.query('DELETE FROM UserChannels WHERE uid = ? AND cid = ?', [userId, rows[0].cid]);
  }
  await connection.query('UPDATE Factions SET memberCount = GREATEST(memberCount - 1, 0) WHERE id = ?', [factionId]);
  return { channelId: rows[0].cid, channelName: rows[0].channelName };
}

function parseJson(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

async function imageBufferFromBase64(value) {
  if (value === undefined || value === null) return null;
  failIf(typeof value !== 'string', 400, 'Flag must be a PNG, WebP or JPG image.');
  const match = value.match(/^data:image\/(png|webp|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/);
  failIf(!match, 400, 'Flag must be a PNG, WebP or JPG image.');
  const buffer = Buffer.from(match[2], 'base64');
  failIf(buffer.length === 0 || buffer.length > 2 * 1024 * 1024, 413, 'Flag size must not exceed 2 MB.');
  let metadata;
  try {
    metadata = await sharp(buffer, { limitInputPixels: 16 * 1024 * 1024 }).metadata();
  } catch {
    throw httpError(400, 'Failed to read flag file.');
  }
  const formats = { png: ['png'], webp: ['webp'], jpeg: ['jpeg', 'jpg'] };
  failIf(!formats[match[1]].includes(metadata.format), 400, 'File format does not match its content.');
  return sharp(buffer, { limitInputPixels: 16 * 1024 * 1024 })
    .rotate()
    .resize(64, 64, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 90 })
    .toBuffer();
}

function safeImageName(factionId) {
  return 'faction-' + factionId + '-' + randomUUID() + '.webp';
}

async function saveFlag(factionId, buffer) {
  if (!buffer) return null;
  await mkdir(FACTION_FLAGS_DIR, { recursive: true });
  const fileName = safeImageName(factionId);
  const target = path.join(FACTION_FLAGS_DIR, fileName);
  const temporary = target + '.' + randomUUID() + '.tmp';
  await writeFile(temporary, buffer, { flag: 'wx' });
  await rename(temporary, target);
  return { fileName, url: '/userdata/factionflags/' + fileName, target };
}

async function removeFileQuietly(filePath) {
  if (!filePath) return;
  try {
    await unlink(filePath);
  } catch {
    // Error clearing old file does not cancel the already saved action.
  }
}

async function getFactionDetails(factionId) {
  const rows = await pool.query(
    'SELECT f.id, f.tag, f.title AS name, f.description, f.color, f.flagUrl, f.rankCode, '
    + 'rankThreshold.title AS rankTitle, '
    + 'f.ownerId, f.memberCount, f.flags, f.openJoin, f.coordinationIds, '
    + 'f.createdAt, f.updatedAt, f.cid AS channelId, owner.name AS ownerName, '
    + 'CONCAT(ownerAvatar.shortId, \':\', ownerAvatar.extension) AS ownerAvatar, '
    + 'ownerProfile.customFlag AS ownerFlag, channel.name AS channelName, '
    + 'channel.type AS channelType, channel.lastMessage AS channelLastTs, '
    + 'CONCAT(factionAvatar.shortId, \':\', factionAvatar.extension) AS factionAvatar, '
    + 'CONCAT(factionBanner.shortId, \':\', factionBanner.extension) AS factionBanner '
    + 'FROM Factions f LEFT JOIN Users owner ON owner.id = f.ownerId '
    + 'LEFT JOIN Profiles ownerProfile ON ownerProfile.uid = owner.id '
    + 'LEFT JOIN Media ownerAvatar ON ownerAvatar.id = ownerProfile.avatar '
    + 'LEFT JOIN Channels channel ON channel.id = f.cid '
    + 'LEFT JOIN Media factionAvatar ON factionAvatar.id = f.avatar '
    + 'LEFT JOIN Media factionBanner ON factionBanner.id = f.banner '
    + 'LEFT JOIN FactionRankThresholds rankThreshold ON rankThreshold.rankCode = f.rankCode '
    + 'WHERE f.id = ?',
    [factionId],
  );
  return rows[0] || null;
}

function serializeFaction(row) {
  const flagUrl = row.flagUrl || null;
  return {
    id: row.id,
    tag: row.tag,
    name: row.name,
    description: row.description,
    color: row.color,
    flag: flagUrl || row.factionAvatar || null,
    flagUrl,
    avatarId: row.factionAvatar || null,
    bannerId: row.factionBanner || null,
    ownerId: row.ownerId,
    owner: row.ownerId ? {
      id: row.ownerId,
      name: row.ownerName,
      avatar: row.ownerAvatar || null,
      flag: row.ownerFlag || null,
    } : null,
    channel: row.channelId ? {
      id: row.channelId,
      name: row.channelName,
      type: row.channelType,
      lastTs: row.channelLastTs ? new Date(row.channelLastTs).getTime() : null,
    } : null,
    memberCount: Number(row.memberCount) || 0,
    rankCode: row.rankCode || 'chiefdom',
    rankTitle: row.rankTitle || 'Chiefdom',
    isPrivate: Boolean(row.flags & (1 << FACTION_FLAGS.PRIV)),
    openJoin: Boolean(row.openJoin),
    coordinationIds: parseJson(row.coordinationIds, []),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function getFactionForRequest(req, factionId) {
  const membership = await getFactionMembership(req.user.id, factionId);
  failIf(!membership, 403, 'You do not have access to this faction.');
  return membership;
}

async function getFactionStats(factionId) {
  const [[totalPixels, todayPixels], rows] = await Promise.all([
    getFactionRanks(factionId),
    pool.query(
      'SELECT totalPixels, IF(dailyPixelsDate = UTC_DATE(), dailyPixels, 0) AS todayPixels '
      + 'FROM Factions WHERE id = ?',
      [factionId],
    ),
  ]);
  const factionTotal = Number(totalPixels) || 0;
  const factionToday = Number(todayPixels) || 0;
  const storedTotal = Number(rows[0]?.totalPixels) || 0;
  const storedToday = Number(rows[0]?.todayPixels) || 0;
  const dailyTotal = factionToday || storedToday;

  if (!factionTotal && !storedTotal) {
    const members = await pool.query(
      'SELECT uid FROM UserFactions WHERE fid = ?',
      [factionId],
    );
    const memberRanks = await Promise.all(
      members.map(({ uid }) => getUserRanks(uid)),
    );
    const memberTotal = memberRanks.reduce(
      (sum, ranks) => sum + (Number(ranks[0]) || 0),
      0,
    );
    return {
      totalPixels: memberTotal,
      todayPixels: dailyTotal,
    };
  }

  return {
    totalPixels: factionTotal || storedTotal,
    todayPixels: dailyTotal,
  };
}

router.get('/mine', ensureAuthenticated, async (req, res) => {
  const rows = await pool.query(
    'SELECT f.id, f.tag, f.title AS name, f.flagUrl, '
    + 'CONCAT(a.shortId, \':\', a.extension) AS legacyFlag, f.ownerId '
    + 'FROM UserFactions uf INNER JOIN Factions f ON f.id = uf.fid '
    + 'LEFT JOIN Media a ON a.id = f.avatar WHERE uf.uid = ? ORDER BY uf.joined',
    [req.user.id],
  );
  res.json({
    factions: rows.map((row) => ({
      id: row.id,
      name: row.name,
      tag: row.tag,
      flag: row.flagUrl || row.legacyFlag || null,
      flagUrl: row.flagUrl || null,
      ownerId: row.ownerId,
    })),
  });
});

router.get('/my', ensureAuthenticated, async (req, res) => {
  const factionId = parseId(req.query.factionId, 'factionId');
  const membership = await getFactionForRequest(req, factionId);
  const row = await getFactionDetails(factionId);
  failIf(!row, 404, 'Faction not found.');
  const [stats, countRows] = await Promise.all([
    getFactionStats(factionId),
    pool.query('SELECT COUNT(*) AS count FROM UserFactions WHERE fid = ?', [factionId]),
  ]);
  const faction = serializeFaction(row);
  faction.memberCount = Number(countRows[0].count);
  faction.totalPixels = stats.totalPixels;
  faction.todayPixels = stats.todayPixels;
  faction.role = membership.role;
  faction.permissions = getPermissions(
    membership.role, membership.permissions,
  );
  res.json({ faction });
});

router.get('/list', async (req, res) => {
  req.tickRateLimiter?.(1500);
  const limit = req.query.limit === undefined ? 50 : parseOptionalInt(req.query.limit, 'limit', 1, 50);
  const offset = req.query.offset === undefined ? 0 : parseOptionalInt(req.query.offset, 'offset', 0, 1000000);
  const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 64) : '';
  const openOnly = req.query.open === 'true' || req.query.open === '1';
  const escapedSearch = search.replace(/[%_\\]/g, '\\$&');
  const cacheKey = 'faction:list:v2:' + limit + ':' + offset + ':' + (openOnly ? 1 : 0) + ':' + escapedSearch.toLowerCase();
  if (!req.query.refresh) {
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        res.json(JSON.parse(cached));
        return;
      }
    } catch {
      // When cache is unavailable, read data from MariaDB.
    }
  }
  const rows = await pool.query(
    'SELECT f.id, f.tag, f.title AS name, f.description, f.flagUrl, f.ownerId, '
    + 'f.createdAt, f.flags, f.openJoin, f.memberCount, rt.title AS rankTitle, '
    + 'CONCAT(a.shortId, \':\', a.extension) AS legacyFlag '
    + 'FROM Factions f LEFT JOIN Media a ON a.id = f.avatar '
    + 'LEFT JOIN FactionRankThresholds rt ON rt.rankCode = f.rankCode '
    + 'WHERE (? = \'\' OR f.tag LIKE UPPER(?) OR f.title LIKE ?) '
    + 'AND (? = 0 OR (f.openJoin = 1 AND (f.flags & ?) = 0)) '
    + 'ORDER BY f.memberCount DESC, f.createdAt DESC LIMIT ? OFFSET ?',
    [
      search, '%' + escapedSearch + '%', '%' + escapedSearch + '%',
      openOnly ? 1 : 0, 1 << FACTION_FLAGS.PRIV, limit, offset,
    ],
  );
  const result = {
    factions: rows.map((row) => {
      const isPrivate = Boolean(row.flags & (1 << FACTION_FLAGS.PRIV));
      return {
        id: row.id,
        name: row.name,
        tag: row.tag,
        flag: row.flagUrl || row.legacyFlag || null,
        flagUrl: row.flagUrl || null,
        description: isPrivate ? '' : row.description,
        ownerId: row.ownerId,
        createdAt: row.createdAt,
        isPrivate,
        rankTitle: isPrivate ? null : row.rankTitle,
        openJoin: Boolean(row.openJoin),
        members: Number(row.memberCount) || 0,
      };
    }),
  };
  try {
    await redis.set(cacheKey, JSON.stringify(result), { EX: 60 });
  } catch {
    // Cache does not affect list availability.
  }
  res.json(result);
});

router.get('/:id/profile', async (req, res) => {
  const factionId = parseId(req.params.id, 'factionId');
  const row = await getFactionDetails(factionId);
  failIf(!row, 404, 'Faction not found.');
  const faction = serializeFaction(row);
  if (faction.isPrivate) {
    res.json({ faction: {
      id: faction.id,
      tag: faction.tag,
      name: faction.name,
      flag: faction.flag,
      flagUrl: faction.flagUrl,
      ownerId: faction.ownerId,
      isPrivate: true,
      createdAt: faction.createdAt,
      memberCount: faction.memberCount,
    } });
    return;
  }
  const members = await pool.query(
    'SELECT u.id, u.name, u.username, uf.`role`, p.customFlag AS flag, '
    + 'CONCAT(a.shortId, \':\', a.extension) AS avatar, f.tag AS memberTag '
    + 'FROM UserFactions uf INNER JOIN Users u ON u.id = uf.uid '
    + 'INNER JOIN Factions f ON f.id = uf.fid '
    + 'LEFT JOIN Profiles p ON p.uid = u.id LEFT JOIN Media a ON a.id = p.avatar '
    + 'WHERE uf.fid = ? AND (uf.flags & ?) = 0 '
    + 'ORDER BY FIELD(uf.`role`,\'owner\',\'leader\',\'deputy\',\'officer\',\'member\'), uf.joined',
    [factionId, 0x01 << USER_FACTION_FLAGS.HIDDEN],
  );
  faction.members = members.map((member) => ({
    id: member.id,
    name: member.name,
    username: member.username,
    avatar: member.avatar || null,
    flag: member.flag,
    memberTag: member.memberTag || null,
    role: member.role,
  }));
  const naps = FACTION_NAPS_ENABLED ? await pool.query(
    'SELECT n.id, n.status, n.createdAt, other.id AS otherId, other.tag AS otherTag, '
    + 'other.title AS otherName, other.flagUrl AS otherFlagUrl '
    + 'FROM FactionNaps n INNER JOIN Factions other ON other.id = '
    + 'CASE WHEN n.factionA = ? THEN n.factionB ELSE n.factionA END '
    + 'WHERE (n.factionA = ? OR n.factionB = ?) AND n.status = \'active\' '
    + 'ORDER BY n.createdAt DESC',
    [factionId, factionId, factionId],
  ) : [];
  faction.naps = naps.map((nap) => ({
    id: nap.id,
    status: nap.status,
    createdAt: nap.createdAt,
    otherFaction: {
      id: nap.otherId,
      tag: nap.otherTag,
      name: nap.otherName,
      flagUrl: nap.otherFlagUrl,
    },
  }));
  res.json({ faction });
});

router.get('/stats', async (req, res) => {
  req.tickRateLimiter?.(1000);
  const cacheKey = 'faction:stats:top';
  if (!req.query.refresh) {
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        res.json(JSON.parse(cached));
        return;
      }
    } catch {
      // Build statistics from current data.
    }
  }
  const top = (await getFactionRankingEntities())
    .filter((entity) => entity.totalPixels > 0)
    .sort((a, b) => b.totalPixels - a.totalPixels)
    .slice(0, 50);
  const result = { top };
  try {
    await redis.set(cacheKey, JSON.stringify(result), { EX: 30 });
  } catch {
    // Statistics cache is optional.
  }
  res.json(result);
});

router.get('/configs/active', ensureAuthenticated, async (req, res) => {
  const factionId = parseId(req.query.factionId, 'factionId');
  await getFactionForRequest(req, factionId);
  const rows = await pool.query(
    'SELECT id, factionId, templateUrl, canvasId, x, y, color, extra, isActive, createdAt '
    + 'FROM FactionConfigs WHERE factionId = ? AND isActive = 1 ORDER BY id DESC LIMIT 1',
    [factionId],
  );
  const config = rows[0] || null;
  if (config) config.extra = parseJson(config.extra, {});
  const factions = await pool.query('SELECT id, tag FROM Factions WHERE id = ?', [factionId]);
  res.json({ faction: factions[0], config });
});

router.get('/rankings', async (req, res) => {
  req.tickRateLimiter?.(1500);
  const all = await getFactionRankingEntities();
  const overall = all.filter((entity) => entity.totalPixels > 0)
    .sort((a, b) => b.totalPixels - a.totalPixels)
    .slice(0, 100);
  const daily = all.filter((entity) => entity.todayPixels > 0)
    .sort((a, b) => b.todayPixels - a.todayPixels)
    .slice(0, 100);
  res.json({ overall, daily });
});

router.get('/stats/members', ensureAuthenticated, async (req, res) => {
  req.tickRateLimiter?.(1000);
  const factionId = parseId(req.query.factionId, 'factionId');
  await getFactionForRequest(req, factionId);
  const members = await getFactionPixelContributors(factionId);
  res.json({
    daily: members.slice().sort((a, b) => b.todayPixels - a.todayPixels),
    total: members,
  });
});

router.get('/:id/templates', ensureAuthenticated, async (req, res) => {
  const factionId = parseId(req.params.id, 'factionId');
  await getFactionForRequest(req, factionId);
  const rows = await pool.query(
    'SELECT id, title, canvasId, x, y, width, height, templateData, isActive, createdAt '
    + 'FROM FactionTemplates WHERE factionId = ? ORDER BY createdAt DESC LIMIT 100',
    [factionId],
  );
  res.json({
    templates: rows.map((row) => ({
      ...row,
      templateData: parseJson(row.templateData, null),
    })),
  });
});

router.get('/:id/naps', ensureAuthenticated, async (req, res) => {
  const factionId = parseId(req.params.id, 'factionId');
  await getFactionForRequest(req, factionId);
  const rows = await pool.query(
    'SELECT n.id, n.factionA, n.factionB, n.status, n.requestedBy, n.templateId, '
    + 'n.terms, n.createdAt, n.decidedAt, a.tag AS tagA, a.title AS nameA, '
    + 'b.tag AS tagB, b.title AS nameB '
    + 'FROM FactionNaps n INNER JOIN Factions a ON a.id = n.factionA '
    + 'INNER JOIN Factions b ON b.id = n.factionB '
    + 'WHERE n.factionA = ? OR n.factionB = ? ORDER BY n.createdAt DESC LIMIT 100',
    [factionId, factionId],
  );
  res.json({
    naps: rows.map((row) => ({
      ...row,
      terms: parseJson(row.terms, []),
    })),
  });
});

function parseNapDate(value, field) {
  if (value == null || value === '') return null;
  failIf(typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value),
    400, 'Invalid ' + field + '.');
  const date = new Date(value + 'T00:00:00Z');
  failIf(!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value,
    400, 'Invalid ' + field + '.');
  if (field === 'endDate') date.setUTCHours(23, 59, 59, 999);
  return date;
}

async function getNapTerritories(factionId, otherFactionId, requested, connection) {
  const mine = await updateFactionTerritory(factionId, connection);
  const target = await updateFactionTerritory(otherFactionId, connection);
  failIf(!mine || !target, 400, 'Both factions must have an active template.');
  const myTerritory = requested?.myTerritory
    ? clipToFactionTerritory(requested.myTerritory, mine) : mine;
  const targetTerritory = requested?.targetTerritory
    ? clipToFactionTerritory(requested.targetTerritory, target) : target;
  failIf(!myTerritory || !targetTerritory, 400,
    'Selected territory must overlap its faction’s active template.');
  return { myTerritory, targetTerritory };
}

router.get('/naps/review', ensureAuthenticated, async (req, res) => {
  requireNapsEnabled();
  failIf(!(Number(req.user.userlvl) >= USERLVL.MOD), 403, 'Only game moderators can review NAP proposals.');
  const rows = await pool.query(
    'SELECT n.id, n.startDate, n.endDate, n.createdAt, n.terms, n.territory, '
    + 'a.tag AS tagA, a.title AS nameA, b.tag AS tagB, b.title AS nameB '
    + 'FROM FactionNaps n JOIN Factions a ON a.id = n.factionA '
    + 'JOIN Factions b ON b.id = n.factionB WHERE n.status = \'pending\' '
    + 'ORDER BY n.createdAt, n.id LIMIT 100',
  );
  res.json({ naps: rows.map((row) => ({
    ...row, terms: parseJson(row.terms, []), territory: parseJson(row.territory, null),
  })) });
});

async function proposeNap(req, res) {
  requireNapsEnabled();
  req.tickRateLimiter?.(3000);
  const factionId = parseId(req.params.id ?? req.body?.factionId, 'factionId');
  const membership = await getFactionForRequest(req, factionId);
  requirePermission(membership, 'manageNaps');
  let target = req.body?.targetFactionId ?? req.body?.otherFactionId;
  if (target == null && req.body?.otherTag) {
    const tag = validateTag(req.body.otherTag);
    const [row] = await pool.query('SELECT id FROM Factions WHERE tag = ?', [tag]);
    failIf(!row, 404, 'Target faction not found.');
    target = row.id;
  }
  const otherFactionId = parseId(target, 'targetFactionId');
  failIf(factionId === otherFactionId, 400, 'You cannot propose a pact with your own faction.');
  const startDate = parseNapDate(req.body?.startDate, 'startDate');
  const endDate = parseNapDate(req.body?.endDate, 'endDate');
  failIf(endDate && (endDate < Date.now() || (startDate && endDate < startDate)),
    400, 'Choose an end date after the start date that has not passed.');
  const requested = validateTerritoryPayload(req.body?.territory);
  failIf(requested && !requested.myTerritory && !requested.targetTerritory,
    400, 'Select a territory on one of the two faction templates.');

  const napId = await transaction(async (connection) => {
    const ids = [factionId, otherFactionId].sort((a, b) => a - b);
    const factions = await connection.query(
      'SELECT id FROM Factions WHERE id IN (?, ?) ORDER BY id FOR UPDATE', ids,
    );
    failIf(factions.length !== 2, 404, 'Target faction not found.');
    requirePermission(await requireMembership(req.user.id, factionId, connection), 'manageNaps');
    const territory = await getNapTerritories(factionId, otherFactionId, requested, connection);
    const templateId = territory.myTerritory.templateId;
    failIf(req.body?.templateId != null && parseId(req.body.templateId, 'templateId') !== templateId,
      400, 'Choose your active faction template.');
    const terms = validateNapTerms(req.body?.terms ?? [{
      type: 'cease_activity', templateId, description: 'Protect the agreed areas.',
    }]);
    const templateIds = [territory.myTerritory.templateId, territory.targetTerritory.templateId];
    failIf(terms.some((term) => term.templateId && !templateIds.includes(term.templateId)),
      400, 'NAP terms must reference an active template of the two factions.');
    const allyIds = [...new Set(terms.filter((term) => term.allyFactionId).map((term) => term.allyFactionId))];
    failIf(allyIds.some((id) => ids.includes(id)), 400, 'A severed ally must be a third faction.');
    if (allyIds.length) {
      const allies = await connection.query('SELECT id FROM Factions WHERE id IN (?)', [allyIds]);
      failIf(allies.length !== allyIds.length, 404, 'Referenced ally faction not found.');
    }
    const serializedTerms = JSON.stringify(terms);
    failIf(Array.from(serializedTerms).length > 2000, 400, 'NAP terms are too long.');
    const existing = await connection.query(
      'SELECT id FROM FactionNaps WHERE (status = \'pending\' OR '
      + '(status = \'active\' AND (endDate IS NULL OR endDate >= NOW()))) '
      + 'AND ((factionA = ? AND factionB = ?) OR (factionA = ? AND factionB = ?)) '
      + 'LIMIT 1 FOR UPDATE',
      [factionId, otherFactionId, otherFactionId, factionId],
    );
    failIf(existing.length, 409, 'A pending or active NAP already exists for these factions.');
    const result = await connection.query(
      'INSERT INTO FactionNaps (factionA, factionB, status, requestedBy, templateId, terms, territory, startDate, endDate) '
      + 'VALUES (?, ?, \'pending\', ?, ?, ?, ?, ?, ?)',
      [factionId, otherFactionId, req.user.id, templateId, serializedTerms,
        JSON.stringify(territory), startDate, endDate],
    );
    await connection.query(
      'INSERT INTO FactionDiplomacyLogs (factionA, factionB, napId, actorId, eventType, terms) '
      + 'VALUES (?, ?, ?, ?, \'nap_proposed\', ?)',
      [factionId, otherFactionId, result.insertId, req.user.id, serializedTerms],
    );
    await writeAudit(connection, factionId, req.user.id, 'nap.propose', result.insertId, { otherFactionId });
    return result.insertId;
  });
  await notifyFactionNapUpdate(factionId, otherFactionId, 'NAP proposal submitted for moderator review.');
  res.status(201).json({ success: true, napId });
}

router.post('/naps/propose', ensureAuthenticated, proposeNap);
router.post('/:id/naps/request', ensureAuthenticated, proposeNap);

router.post('/naps/:id/approve', ensureAuthenticated, async (req, res) => {
  requireNapsEnabled();
  req.tickRateLimiter?.(2000);
  failIf(
    !(Number(req.user.userlvl) >= USERLVL.MOD),
    403,
    'Only game moderators can approve NAP proposals.',
  );
  const napId = parseId(req.params.id, 'napId');
  const nap = await transaction(async (connection) => {
    const rows = await connection.query(
      'SELECT id, factionA, factionB, status, templateId, terms, territory, endDate FROM FactionNaps WHERE id = ? FOR UPDATE',
      [napId],
    );
    failIf(!rows.length || rows[0].status !== 'pending', 404, 'Pending NAP proposal not found.');
    const proposal = rows[0];
    const terms = validateNapTerms(parseJson(proposal.terms, null));
    failIf(proposal.endDate && new Date(proposal.endDate) < Date.now(),
      409, 'The proposed NAP has expired.');
    const requested = parseJson(proposal.territory, null);
    failIf(!requested?.myTerritory || !requested?.targetTerritory,
      409, 'The proposal is missing its protected areas. Submit a new proposal.');
    const territory = await getNapTerritories(proposal.factionA, proposal.factionB, requested, connection);
    const sameArea = (left, right) => ['templateId', 'canvasId', 'x1', 'y1', 'x2', 'y2']
      .every((key) => left[key] === right[key]);
    failIf(!sameArea(requested.myTerritory, territory.myTerritory)
      || !sameArea(requested.targetTerritory, territory.targetTerritory),
    409, 'An active template changed. Submit a new proposal.');
    await connection.query(
      'UPDATE FactionNaps SET status = \'active\', approvedByA = ?, approvedAtA = NOW(), '
      + 'startDate = COALESCE(startDate, NOW()), decidedAt = NOW() WHERE id = ? AND status = \'pending\'',
      [req.user.id, napId],
    );
    await connection.query(
      'INSERT INTO FactionDiplomacyLogs (factionA, factionB, napId, actorId, eventType, terms) '
      + 'VALUES (?, ?, ?, ?, \'nap_approved\', ?)',
      [proposal.factionA, proposal.factionB, napId, req.user.id, JSON.stringify(terms)],
    );
    await writeAudit(connection, proposal.factionA, req.user.id, 'nap.approve', napId, {
      otherFactionId: proposal.factionB,
    });
    return proposal;
  });
  await notifyFactionNapUpdate(nap.factionA, nap.factionB, 'NAP approved by a moderator.');
  res.json({ success: true });
});

router.post('/naps/:id/reject', ensureAuthenticated, async (req, res) => {
  requireNapsEnabled();
  req.tickRateLimiter?.(2000);
  failIf(
    !(Number(req.user.userlvl) >= USERLVL.MOD),
    403,
    'Only game moderators can reject NAP proposals.',
  );
  const napId = parseId(req.params.id, 'napId');
  const nap = await transaction(async (connection) => {
    const rows = await connection.query(
      'SELECT id, factionA, factionB, status, terms FROM FactionNaps WHERE id = ? FOR UPDATE',
      [napId],
    );
    failIf(!rows.length || rows[0].status !== 'pending', 404, 'Pending NAP proposal not found.');
    const proposal = rows[0];
    await connection.query(
      'UPDATE FactionNaps SET status = \'rejected\', approvedByA = ?, approvedAtA = NOW(), '
      + 'decidedAt = NOW() WHERE id = ? AND status = \'pending\'',
      [req.user.id, napId],
    );
    await connection.query(
      'INSERT INTO FactionDiplomacyLogs (factionA, factionB, napId, actorId, eventType, terms) '
      + 'VALUES (?, ?, ?, ?, \'nap_rejected\', ?)',
      [proposal.factionA, proposal.factionB, napId, req.user.id, proposal.terms],
    );
    await writeAudit(connection, proposal.factionA, req.user.id, 'nap.reject', napId, {
      otherFactionId: proposal.factionB,
    });
    return proposal;
  });
  await notifyFactionNapUpdate(nap.factionA, nap.factionB, 'NAP rejected by a moderator.');
  res.json({ success: true });
});

router.post('/alliances/create', ensureAuthenticated, async (req, res) => {
  requireWarsEnabled();
  req.tickRateLimiter?.(3000);
  const upload = await readAllianceMultipart(req);
  const factionId = parseId(upload.fields.factionId, 'factionId');
  const leaderMembership = await getFactionForRequest(req, factionId);
  requireFactionLeader(leaderMembership);
  const name = validateString(upload.fields.name, 'name', 2, 64);
  const terms = validateAllianceTerms(parseJson(upload.fields.terms, null));
  const allianceType = upload.fields.allianceType;
  failIf(
    !['alliance', 'coalition', 'union'].includes(allianceType),
    400,
    'Choose a valid alliance category.',
  );
  const targetFactionId = allianceType === 'coalition'
    ? parseId(upload.fields.targetFactionId, 'targetFactionId') : null;
  failIf(
    targetFactionId === factionId,
    400,
    'A coalition cannot target its own founding faction.',
  );
  failIf(!upload.avatar || !upload.banner, 400, 'Choose both an alliance avatar and banner.');
  const avatar = await convertAllianceImage(upload.avatar, 'avatar');
  const banner = await convertAllianceImage(upload.banner, 'banner');
  await mkdir(FACTION_ALLIANCES_DIR, { recursive: true });
  const avatarFileName = `alliance-${randomUUID()}-avatar.webp`;
  const bannerFileName = `alliance-${randomUUID()}-banner.webp`;
  const avatarPath = path.join(FACTION_ALLIANCES_DIR, avatarFileName);
  const bannerPath = path.join(FACTION_ALLIANCES_DIR, bannerFileName);
  try {
    await writeFile(avatarPath, avatar, { flag: 'wx' });
    await writeFile(bannerPath, banner, { flag: 'wx' });
    const allianceId = await transaction(async (connection) => {
      const membership = await requireMembership(req.user.id, factionId, connection);
      requireFactionLeader(membership);
      const factionIds = targetFactionId
        ? [factionId, targetFactionId].sort((a, b) => a - b) : [factionId];
      const factions = await connection.query(
        'SELECT id FROM Factions WHERE id IN (?) ORDER BY id FOR UPDATE',
        [factionIds],
      );
      failIf(
        factions.length !== factionIds.length,
        404,
        'Faction or coalition target not found.',
      );
      const existingMembership = await connection.query(
        'SELECT allianceId FROM FactionAllianceMembers WHERE factionId = ?',
        [factionId],
      );
      failIf(
        existingMembership.length,
        409,
        'This faction already belongs to an alliance or pact.',
      );
      const created = await connection.query(
        'INSERT INTO FactionAlliances '
        + '(name, terms, allianceType, targetFactionId, avatarFileName, '
        + 'bannerFileName, createdBy, founderFactionId) '
        + 'VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [
          name, JSON.stringify(terms), allianceType, targetFactionId,
          avatarFileName, bannerFileName, req.user.id, factionId,
        ],
      );
      await connection.query(
        'INSERT INTO FactionAllianceMembers (allianceId, factionId, joinedBy) VALUES (?, ?, ?)',
        [created.insertId, factionId, req.user.id],
      );
      await connection.query(
        'INSERT INTO FactionDiplomacyLogs (factionA, factionB, allianceId, actorId, eventType, terms) '
        + 'VALUES (?, ?, ?, ?, \'alliance_created\', ?)',
        [factionId, factionId, created.insertId, req.user.id, JSON.stringify(terms)],
      );
      await writeAudit(connection, factionId, req.user.id, 'alliance.create', created.insertId);
      return created.insertId;
    });
    res.status(201).json({ success: true, allianceId });
  } catch (error) {
    await removeFileQuietly(avatarPath);
    await removeFileQuietly(bannerPath);
    throw error;
  }
});

router.get('/alliances', async (req, res) => {
  requireWarsEnabled();
  const category = typeof req.query.category === 'string'
    && ['alliance', 'coalition', 'union'].includes(req.query.category)
    ? req.query.category : '';
  const rows = await pool.query(
    'SELECT a.id, a.name, a.terms, a.allianceType, a.targetFactionId, '
    + 'a.avatarFileName, a.bannerFileName, '
    + 'a.founderFactionId, '
    + '(SELECT COUNT(*) FROM FactionAllianceMembers am WHERE am.allianceId = a.id) AS memberCount '
    + 'FROM FactionAlliances a WHERE a.status = \'active\' '
    + 'AND (? = \'\' OR a.allianceType = ?) ORDER BY a.createdAt DESC LIMIT 100',
    [category, category],
  );
  const memberRows = rows.length ? await pool.query(
    'SELECT am.allianceId, f.id AS factionId, f.tag, f.title AS name '
    + 'FROM FactionAllianceMembers am INNER JOIN Factions f ON f.id = am.factionId '
    + 'WHERE am.allianceId IN (?) ORDER BY am.allianceId, f.tag',
    [rows.map((row) => row.id)],
  ) : [];
  const membersByAlliance = new Map();
  for (const member of memberRows) {
    const members = membersByAlliance.get(Number(member.allianceId)) || [];
    members.push({
      factionId: Number(member.factionId),
      tag: member.tag,
      name: member.name,
    });
    membersByAlliance.set(Number(member.allianceId), members);
  }
  res.json({
    alliances: rows.map((row) => ({
      ...row,
      terms: parseJson(row.terms, []),
      memberCount: Number(row.memberCount) || 0,
      members: membersByAlliance.get(Number(row.id)) || [],
    })),
  });
});

router.get('/wars/status', (req, res) => {
  res.json({ enabled: WarEnable });
});

router.get('/alliances/:id/image/:asset', async (req, res) => {
  requireWarsEnabled();
  req.tickRateLimiter?.(1000);
  const allianceId = parseId(req.params.id, 'allianceId');
  const assetColumn = req.params.asset === 'avatar'
    ? 'avatarFileName' : req.params.asset === 'banner' ? 'bannerFileName' : null;
  failIf(!assetColumn, 404, 'Alliance image not found.');
  const rows = await pool.query(
    `SELECT ${assetColumn} AS fileName FROM FactionAlliances `
    + 'WHERE id = ? AND status = \'active\'',
    [allianceId],
  );
  failIf(!rows.length || !rows[0].fileName, 404, 'Alliance image not found.');
  const fileName = path.basename(rows[0].fileName);
  const image = await readFile(path.join(FACTION_ALLIANCES_DIR, fileName));
  res.set({
    'Content-Type': 'image/webp',
    'Cache-Control': 'public, max-age=300',
    'X-Content-Type-Options': 'nosniff',
  });
  res.send(image);
});

router.get('/alliances/:id/stats', ensureAuthenticated, async (req, res) => {
  requireWarsEnabled();
  const allianceId = parseId(req.params.id, 'allianceId');
  const factionId = parseId(req.query.factionId, 'factionId');
  await getFactionForRequest(req, factionId);
  const alliances = await pool.query(
    'SELECT id, name FROM FactionAlliances WHERE id = ? AND status = \'active\'',
    [allianceId],
  );
  failIf(!alliances.length, 404, 'Active alliance not found.');
  const members = await pool.query(
    'SELECT f.id, f.tag, f.title AS name FROM FactionAllianceMembers am '
    + 'INNER JOIN Factions f ON f.id = am.factionId '
    + 'WHERE am.allianceId = ? ORDER BY f.tag',
    [allianceId],
  );
  failIf(
    !members.some((member) => Number(member.id) === Number(factionId)),
    403,
    'Only alliance members can view alliance statistics.',
  );
  const stats = await Promise.all(members.map(async (member) => {
    const factionStats = await getFactionStats(member.id);
    return {
      id: member.id,
      tag: member.tag,
      name: member.name,
      ...factionStats,
    };
  }));
  res.json({
    alliance: alliances[0],
    members: stats,
    totalPixels: stats.reduce((sum, member) => sum + member.totalPixels, 0),
    todayPixels: stats.reduce((sum, member) => sum + member.todayPixels, 0),
  });
});

async function lockActiveAlliance(connection, id) {
  const alliances = await connection.query(
    'SELECT id, founderFactionId, allianceType, targetFactionId, terms '
    + 'FROM FactionAlliances WHERE id = ? AND status = \'active\' FOR UPDATE',
    [id],
  );
  failIf(!alliances.length, 404, 'Active alliance not found.');
  return alliances[0];
}

async function ensureCanJoinAlliance(connection, alliance, factionId) {
  failIf(
    alliance.allianceType === 'coalition' && Number(alliance.targetFactionId) === factionId,
    409, 'The coalition target cannot join the coalition.',
  );
  // The faction row serializes joins and creation for a particular faction.
  const factions = await connection.query(
    'SELECT id FROM Factions WHERE id = ? FOR UPDATE', [factionId],
  );
  failIf(!factions.length, 404, 'Faction not found.');
  const memberships = await connection.query(
    'SELECT allianceId FROM FactionAllianceMembers WHERE factionId = ? FOR UPDATE',
    [factionId],
  );
  failIf(memberships.length, 409, 'This faction already belongs to an alliance or pact.');
  if (alliance.allianceType === 'alliance') {
    const members = await connection.query(
      'SELECT factionId FROM FactionAllianceMembers WHERE allianceId = ? LIMIT 2 FOR UPDATE',
      [alliance.id],
    );
    failIf(members.length >= 2, 409, 'A bilateral alliance already has two factions.');
  }
}

async function addAllianceMember(connection, alliance, factionId, actorId) {
  await connection.query(
    'INSERT INTO FactionAllianceMembers (allianceId, factionId, joinedBy) VALUES (?, ?, ?)',
    [alliance.id, factionId, actorId],
  );
  await connection.query(
    'INSERT INTO FactionDiplomacyLogs '
    + '(factionA, factionB, allianceId, actorId, eventType, terms) '
    + 'VALUES (?, ?, ?, ?, \'alliance_joined\', ?)',
    [alliance.founderFactionId, factionId, alliance.id, actorId, alliance.terms],
  );
  await connection.query(
    'DELETE FROM FactionAllianceInvites WHERE allianceId = ? AND factionId = ?',
    [alliance.id, factionId],
  );
  await connection.query(
    'DELETE FROM FactionAllianceRequests WHERE allianceId = ? AND factionId = ?',
    [alliance.id, factionId],
  );
}

router.get('/alliances/eligible-factions', ensureAuthenticated, async (req, res) => {
  requireWarsEnabled();
  const factions = await pool.query(
    'SELECT f.id, f.tag, f.title AS name FROM UserFactions uf '
    + 'INNER JOIN Factions f ON f.id = uf.fid WHERE uf.uid = ? '
    + 'AND (uf.role IN (\'owner\', \'leader\') OR f.ownerId = ?) ORDER BY f.tag',
    [req.user.id, req.user.id],
  );
  res.json({ factions });
});

router.get('/alliances/invites/mine', ensureAuthenticated, async (req, res) => {
  requireWarsEnabled();
  const factionId = parseId(req.query.factionId, 'factionId');
  requireFactionLeader(await getFactionForRequest(req, factionId));
  const invites = await pool.query(
    'SELECT i.allianceId, a.name AS allianceName, f.tag AS founderTag '
    + 'FROM FactionAllianceInvites i '
    + 'INNER JOIN FactionAlliances a ON a.id = i.allianceId AND a.status = \'active\' '
    + 'INNER JOIN Factions f ON f.id = a.founderFactionId '
    + 'WHERE i.factionId = ? ORDER BY i.createdAt DESC',
    [factionId],
  );
  res.json({ invites });
});

router.post('/alliances/:id/invite', ensureAuthenticated, async (req, res) => {
  requireWarsEnabled();
  req.tickRateLimiter?.(2000);
  const allianceId = parseId(req.params.id, 'allianceId');
  const factionId = parseId(req.body?.factionId, 'factionId');
  const targetId = parseId(req.body?.targetFactionId, 'targetFactionId');
  await transaction(async (connection) => {
    const alliance = await lockActiveAlliance(connection, allianceId);
    requireFactionLeader(await requireMembership(req.user.id, factionId, connection));
    failIf(factionId !== Number(alliance.founderFactionId), 403, 'Only the founding faction can send invitations.');
    await ensureCanJoinAlliance(connection, alliance, targetId);
    const result = await connection.query(
      'INSERT IGNORE INTO FactionAllianceInvites (allianceId, factionId, invitedBy) VALUES (?, ?, ?)',
      [allianceId, targetId, req.user.id],
    );
    if (result.affectedRows) {
      await writeAudit(connection, factionId, req.user.id, 'alliance.invite', allianceId, { targetFactionId: targetId });
    }
  });
  res.status(201).json({ success: true });
});

router.delete('/alliances/:id/invite', ensureAuthenticated, async (req, res) => {
  requireWarsEnabled();
  const allianceId = parseId(req.params.id, 'allianceId');
  const factionId = parseId(req.body?.factionId, 'factionId');
  await transaction(async (connection) => {
    await lockActiveAlliance(connection, allianceId);
    requireFactionLeader(await requireMembership(req.user.id, factionId, connection));
    const result = await connection.query(
      'DELETE FROM FactionAllianceInvites WHERE allianceId = ? AND factionId = ?',
      [allianceId, factionId],
    );
    failIf(!result.affectedRows, 404, 'Alliance invitation not found.');
    await writeAudit(connection, factionId, req.user.id, 'alliance.invite_decline', allianceId);
  });
  res.json({ success: true });
});

async function submitAllianceMembership(req, res) {
  requireWarsEnabled();
  req.tickRateLimiter?.(2000);
  const allianceId = parseId(req.params.id, 'allianceId');
  const factionId = parseId(req.body?.factionId, 'factionId');
  const acceptInvite = req.route.path.endsWith('/invite/accept');
  failIf(req.body?.acceptTerms !== true, 400, 'You must explicitly accept the alliance terms.');
  const joined = await transaction(async (connection) => {
    const alliance = await lockActiveAlliance(connection, allianceId);
    const membership = await requireMembership(req.user.id, factionId, connection);
    requireFactionLeader(membership);
    await ensureCanJoinAlliance(connection, alliance, factionId);
    if (acceptInvite) {
      const invites = await connection.query(
        'SELECT allianceId FROM FactionAllianceInvites WHERE allianceId = ? AND factionId = ? FOR UPDATE',
        [allianceId, factionId],
      );
      failIf(!invites.length, 404, 'Alliance invitation not found.');
      await addAllianceMember(connection, alliance, factionId, req.user.id);
      await writeAudit(connection, factionId, req.user.id, 'alliance.invite_accept', allianceId);
      return true;
    }
    const result = await connection.query(
      'INSERT INTO FactionAllianceRequests (allianceId, factionId, requestedBy) '
      + 'VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE requestedBy = VALUES(requestedBy)',
      [allianceId, factionId, req.user.id],
    );
    if (result.affectedRows) {
      await writeAudit(connection, factionId, req.user.id, 'alliance.request', allianceId);
    }
    return false;
  });
  res.status(joined ? 200 : 202).json({ success: true, pendingApproval: !joined });
}

router.post('/alliances/:id/join', ensureAuthenticated, submitAllianceMembership);
router.post('/alliances/:id/invite/accept', ensureAuthenticated, submitAllianceMembership);

router.get('/alliances/requests', ensureAuthenticated, async (req, res) => {
  requireWarsEnabled();
  const factionId = parseId(req.query.factionId, 'factionId');
  const membership = await getFactionForRequest(req, factionId);
  requireFactionLeader(membership);
  const requests = await pool.query(
    'SELECT r.allianceId, r.factionId, r.requestedBy, r.createdAt, '
    + 'a.name AS allianceName, a.allianceType, f.tag, f.title AS factionName, '
    + 'u.name AS requesterName FROM FactionAllianceRequests r '
    + 'INNER JOIN FactionAlliances a ON a.id = r.allianceId '
    + 'INNER JOIN Factions f ON f.id = r.factionId '
    + 'INNER JOIN Users u ON u.id = r.requestedBy '
    + 'WHERE a.founderFactionId = ? AND a.status = \'active\' '
    + 'ORDER BY r.createdAt ASC',
    [factionId],
  );
  res.json({ requests });
});

router.get('/alliances/requests/mine', ensureAuthenticated, async (req, res) => {
  requireWarsEnabled();
  const factionId = parseId(req.query.factionId, 'factionId');
  await getFactionForRequest(req, factionId);
  const requests = await pool.query(
    'SELECT r.allianceId, r.createdAt FROM FactionAllianceRequests r '
    + 'INNER JOIN FactionAlliances a ON a.id = r.allianceId '
    + 'WHERE r.factionId = ? AND a.status = \'active\'',
    [factionId],
  );
  res.json({ requests });
});

router.post(
  '/alliances/:id/requests/:factionId/:decision',
  ensureAuthenticated,
  async (req, res) => {
    requireWarsEnabled();
    const allianceId = parseId(req.params.id, 'allianceId');
    const applicantFactionId = parseId(req.params.factionId, 'factionId');
    const founderFactionId = parseId(req.body?.factionId, 'factionId');
    const decision = req.params.decision;
    failIf(!['approve', 'reject'].includes(decision), 400, 'Invalid request decision.');
    await transaction(async (connection) => {
      const alliance = await lockActiveAlliance(connection, allianceId);
      const founderMembership = await requireMembership(
        req.user.id,
        founderFactionId,
        connection,
      );
      requireFactionLeader(founderMembership);
      failIf(
        Number(alliance.founderFactionId) !== founderFactionId,
        403,
        'Only the founding faction can review membership requests.',
      );
      const requests = await connection.query(
        'SELECT requestedBy FROM FactionAllianceRequests '
        + 'WHERE allianceId = ? AND factionId = ? FOR UPDATE',
        [allianceId, applicantFactionId],
      );
      failIf(!requests.length, 404, 'Membership request not found.');
      if (decision === 'approve') {
        const applicant = await requireMembership(
          requests[0].requestedBy,
          applicantFactionId,
          connection,
        );
        requireFactionLeader(applicant);
        await ensureCanJoinAlliance(connection, alliance, applicantFactionId);
        await addAllianceMember(connection, alliance, applicantFactionId, req.user.id);
        await writeAudit(
          connection,
          founderFactionId,
          req.user.id,
          'alliance.approve',
          allianceId,
          { applicantFactionId },
        );
      } else {
        await writeAudit(
          connection,
          founderFactionId,
          req.user.id,
          'alliance.reject',
          allianceId,
          { applicantFactionId },
        );
        await connection.query(
          'DELETE FROM FactionAllianceRequests WHERE allianceId = ? AND factionId = ?',
          [allianceId, applicantFactionId],
        );
      }
    });
    res.json({ success: true });
  },
);

router.delete('/alliances/:id/leave', ensureAuthenticated, async (req, res) => {
  requireWarsEnabled();
  req.tickRateLimiter?.(2000);
  const allianceId = parseId(req.params.id, 'allianceId');
  const factionId = parseId(req.body?.factionId, 'factionId');
  await transaction(async (connection) => {
    const alliance = await lockActiveAlliance(connection, allianceId);
    const membership = await requireMembership(req.user.id, factionId, connection);
    requireFactionLeader(membership);
    const members = await connection.query(
      'SELECT factionId FROM FactionAllianceMembers WHERE allianceId = ? AND factionId = ? FOR UPDATE',
      [allianceId, factionId],
    );
    failIf(!members.length, 404, 'Faction is not part of this alliance.');
    if (Number(alliance.founderFactionId) === factionId) {
      await connection.query('UPDATE FactionAlliances SET status = \'disbanded\' WHERE id = ?', [allianceId]);
      await connection.query('DELETE FROM FactionAllianceMembers WHERE allianceId = ?', [allianceId]);
      await connection.query(
        'DELETE FROM FactionAllianceRequests WHERE allianceId = ?',
        [allianceId],
      );
      await connection.query(
        'DELETE FROM FactionAllianceInvites WHERE allianceId = ?',
        [allianceId],
      );
    } else {
      await connection.query(
        'DELETE FROM FactionAllianceMembers WHERE allianceId = ? AND factionId = ?',
        [allianceId, factionId],
      );
      await connection.query(
        'DELETE FROM FactionAllianceRequests WHERE allianceId = ? AND factionId = ?',
        [allianceId, factionId],
      );
    }
    await connection.query(
      'INSERT INTO FactionDiplomacyLogs (factionA, factionB, allianceId, actorId, eventType) '
      + 'VALUES (?, ?, ?, ?, \'alliance_left\')',
      [alliance.founderFactionId, factionId, allianceId, req.user.id],
    );
    await writeAudit(connection, factionId, req.user.id, 'alliance.leave', allianceId);
  });
  res.json({ success: true });
});

router.get('/:id/diplomacy', ensureAuthenticated, async (req, res) => {
  requireWarsEnabled();
  const factionId = parseId(req.params.id, 'factionId');
  await getFactionForRequest(req, factionId);
  const [events, alliances, wars] = await Promise.all([
    pool.query(
      'SELECT l.id, l.factionA, l.factionB, l.allianceId, l.napId, l.eventType, '
      + 'l.terms, l.createdAt, a.tag AS tagA, b.tag AS tagB '
      + 'FROM FactionDiplomacyLogs l INNER JOIN Factions a ON a.id = l.factionA '
      + 'INNER JOIN Factions b ON b.id = l.factionB '
      + 'WHERE l.factionA = ? OR l.factionB = ? ORDER BY l.createdAt DESC, l.id DESC LIMIT 100',
      [factionId, factionId],
    ),
    pool.query(
      'SELECT a.id, a.name, a.terms, a.allianceType, a.targetFactionId, '
      + 'a.founderFactionId, am.factionId, f.tag, f.title AS factionName '
      + 'FROM FactionAllianceMembers am INNER JOIN FactionAlliances a ON a.id = am.allianceId '
      + 'INNER JOIN Factions f ON f.id = am.factionId '
      + 'WHERE a.status = \'active\' AND am.allianceId IN ('
      + 'SELECT allianceId FROM FactionAllianceMembers WHERE factionId = ?) '
      + 'ORDER BY a.id, f.tag',
      [factionId],
    ),
    pool.query(
      'SELECT l.factionA, l.factionB, a.tag AS tagA, b.tag AS tagB, l.createdAt '
      + 'FROM FactionDiplomacyLogs l INNER JOIN Factions a ON a.id = l.factionA '
      + 'INNER JOIN Factions b ON b.id = l.factionB '
      + 'WHERE l.eventType = \'war_declared\' AND (l.factionA = ? OR l.factionB = ?) '
      + 'AND NOT EXISTS (SELECT newer.id FROM FactionDiplomacyLogs newer '
      + 'WHERE newer.eventType IN (\'war_declared\', \'peace_treaty\') '
      + 'AND ((newer.factionA = l.factionA AND newer.factionB = l.factionB) '
      + 'OR (newer.factionA = l.factionB AND newer.factionB = l.factionA)) '
      + 'AND newer.id > l.id) ORDER BY l.createdAt DESC',
      [factionId, factionId],
    ),
  ]);
  res.json({
    events: events.map((row) => ({ ...row, terms: parseJson(row.terms, null) })),
    alliances: alliances.map((row) => ({ ...row, terms: parseJson(row.terms, []) })),
    wars,
  });
});

router.post('/diplomacy/declare-war', ensureAuthenticated, async (req, res) => {
  requireWarsEnabled();
  const factionId = parseId(req.body?.factionId, 'factionId');
  const otherFactionId = parseId(req.body?.targetFactionId, 'targetFactionId');
  failIf(factionId === otherFactionId, 400, 'A faction cannot declare war on itself.');
  await transaction(async (connection) => {
    const membership = await requireMembership(req.user.id, factionId, connection);
    requireFactionLeader(membership);
    const factions = await connection.query(
      'SELECT id FROM Factions WHERE id IN (?, ?) ORDER BY id FOR UPDATE',
      [factionId, otherFactionId].sort((a, b) => a - b),
    );
    failIf(factions.length !== 2, 404, 'Target faction not found.');
    const sharedAlliance = await connection.query(
      'SELECT 1 FROM FactionAllianceMembers own '
      + 'INNER JOIN FactionAllianceMembers target ON target.allianceId = own.allianceId '
      + 'INNER JOIN FactionAlliances a ON a.id = own.allianceId AND a.status = \'active\' '
      + 'WHERE own.factionId = ? AND target.factionId = ? LIMIT 1',
      [factionId, otherFactionId],
    );
    failIf(sharedAlliance.length, 409, 'Factions in the same alliance cannot declare war on each other.');
    const coalition = await connection.query(
      'SELECT a.id FROM FactionAllianceMembers own '
      + 'INNER JOIN FactionAlliances a ON a.id = own.allianceId '
      + 'WHERE own.factionId = ? AND a.status = \'active\' '
      + 'AND a.allianceType = \'coalition\' AND a.targetFactionId = ? '
      + 'LIMIT 1 FOR UPDATE',
      [factionId, otherFactionId],
    );
    let participants = [factionId];
    if (coalition.length) {
      const coalitionMembers = await connection.query(
        'SELECT factionId FROM FactionAllianceMembers '
        + 'WHERE allianceId = ? ORDER BY factionId FOR UPDATE',
        [coalition[0].id],
      );
      participants = coalitionMembers.map((member) => Number(member.factionId));
    }
    const activeNap = await connection.query(
      'SELECT 1 FROM FactionNaps WHERE status = \'active\' '
      + 'AND (startDate IS NULL OR startDate <= NOW()) '
      + 'AND (endDate IS NULL OR endDate >= NOW()) '
      + 'AND ((factionA IN (?) AND factionB = ?) '
      + 'OR (factionB IN (?) AND factionA = ?)) LIMIT 1',
      [participants, otherFactionId, participants, otherFactionId],
    );
    failIf(activeNap.length, 409, 'An active non-aggression pact prevents this declaration of war.');
    let declared = 0;
    for (const participantId of participants) {
      // eslint-disable-next-line no-await-in-loop
      const latestStatus = await connection.query(
        'SELECT eventType FROM FactionDiplomacyLogs '
        + 'WHERE eventType IN (\'war_declared\', \'peace_treaty\') '
        + 'AND ((factionA = ? AND factionB = ?) '
        + 'OR (factionA = ? AND factionB = ?)) '
        + 'ORDER BY id DESC LIMIT 1 FOR UPDATE',
        [
          participantId, otherFactionId, otherFactionId, participantId,
        ],
      );
      if (latestStatus[0]?.eventType !== 'war_declared') {
        // eslint-disable-next-line no-await-in-loop
        await connection.query(
          'INSERT INTO FactionDiplomacyLogs (factionA, factionB, actorId, eventType) '
          + 'VALUES (?, ?, ?, \'war_declared\')',
          [participantId, otherFactionId, req.user.id],
        );
        declared += 1;
      }
    }
    failIf(!declared, 409, 'These factions are already at war.');
    await writeAudit(connection, factionId, req.user.id, 'diplomacy.war', otherFactionId);
  });
  res.status(201).json({ success: true });
});

router.post('/diplomacy/peace', ensureAuthenticated, async (req, res) => {
  requireWarsEnabled();
  const factionId = parseId(req.body?.factionId, 'factionId');
  const otherFactionId = parseId(req.body?.targetFactionId, 'targetFactionId');
  const terms = validateString(req.body?.terms, 'terms', 1, 2000);
  failIf(factionId === otherFactionId, 400, 'A faction cannot make peace with itself.');
  await transaction(async (connection) => {
    const membership = await requireMembership(req.user.id, factionId, connection);
    requireFactionLeader(membership);
    const factions = await connection.query(
      'SELECT id FROM Factions WHERE id IN (?, ?) ORDER BY id FOR UPDATE',
      [factionId, otherFactionId].sort((a, b) => a - b),
    );
    failIf(factions.length !== 2, 404, 'Target faction not found.');
    const currentWarStatus = await connection.query(
      'SELECT eventType FROM FactionDiplomacyLogs '
      + 'WHERE eventType IN (\'war_declared\', \'peace_treaty\') '
      + 'AND ((factionA = ? AND factionB = ?) OR (factionA = ? AND factionB = ?)) '
      + 'ORDER BY id DESC LIMIT 1 FOR UPDATE',
      [factionId, otherFactionId, otherFactionId, factionId],
    );
    failIf(currentWarStatus[0]?.eventType !== 'war_declared', 409, 'These factions are not currently at war.');
    await connection.query(
      'INSERT INTO FactionDiplomacyLogs (factionA, factionB, actorId, eventType, terms) '
      + 'VALUES (?, ?, ?, \'peace_treaty\', ?)',
      [factionId, otherFactionId, req.user.id, JSON.stringify({ terms })],
    );
    const coalition = await connection.query(
      'SELECT a.id FROM FactionAllianceMembers am '
      + 'INNER JOIN FactionAlliances a ON a.id = am.allianceId '
      + 'WHERE am.factionId = ? AND a.status = \'active\' '
      + 'AND a.allianceType = \'coalition\' AND a.targetFactionId = ? '
      + 'LIMIT 1 FOR UPDATE',
      [factionId, otherFactionId],
    );
    if (coalition.length) {
      const coalitionId = coalition[0].id;
      await connection.query(
        'DELETE FROM FactionAllianceMembers WHERE allianceId = ? AND factionId = ?',
        [coalitionId, factionId],
      );
      const members = await connection.query(
        'SELECT factionId FROM FactionAllianceMembers WHERE allianceId = ?',
        [coalitionId],
      );
      let anyMemberStillAtWar = false;
      for (const member of members) {
        // eslint-disable-next-line no-await-in-loop
        const memberStatus = await connection.query(
          'SELECT eventType FROM FactionDiplomacyLogs '
          + 'WHERE eventType IN (\'war_declared\', \'peace_treaty\') '
          + 'AND ((factionA = ? AND factionB = ?) '
          + 'OR (factionA = ? AND factionB = ?)) '
          + 'ORDER BY id DESC LIMIT 1',
          [
            member.factionId, otherFactionId,
            otherFactionId, member.factionId,
          ],
        );
        if (memberStatus[0]?.eventType === 'war_declared') {
          anyMemberStillAtWar = true;
          break;
        }
      }
      if (!anyMemberStillAtWar) {
        await connection.query(
          'UPDATE FactionAlliances SET status = \'disbanded\' WHERE id = ?',
          [coalitionId],
        );
        await connection.query(
          'DELETE FROM FactionAllianceMembers WHERE allianceId = ?',
          [coalitionId],
        );
        await connection.query(
          'DELETE FROM FactionAllianceRequests WHERE allianceId = ?',
          [coalitionId],
        );
      }
    }
    await writeAudit(connection, factionId, req.user.id, 'diplomacy.peace', otherFactionId, { terms });
  });
  res.status(201).json({ success: true });
});

router.get('/coordination/:id', ensureAuthenticated, async (req, res) => {
  const factionId = parseId(req.params.id, 'factionId');
  await getFactionForRequest(req, factionId);
  const canvasId = parseCanvasId(req.query.canvasId ?? 0);
  const [rows, factionRows] = await Promise.all([
    pool.query(
      'SELECT m.id, m.canvasId, m.authorId, u.name AS author, m.tool, m.color, '
      + 'm.width, m.opacity, m.points, m.createdAt FROM FactionCoordinationMarks m '
      + 'INNER JOIN Users u ON u.id = m.authorId '
      + 'WHERE m.factionId = ? AND m.canvasId = ? ORDER BY m.id DESC LIMIT 500',
      [factionId, canvasId],
    ),
    pool.query('SELECT ownerId FROM Factions WHERE id = ?', [factionId]),
  ]);
  const membership = await getFactionMembership(req.user.id, factionId);
  const permissions = getPermissions(membership.role, membership.permissions);
  res.json({
    canDraw: Number(factionRows[0]?.ownerId) === Number(req.user.id)
      || permissions.drawCoordination,
    marks: rows.reverse().map((row) => ({
      ...row,
      opacity: Number(row.opacity ?? 100),
      points: parseJson(row.points, []),
    })),
  });
});

router.patch('/coordination/:id/marks', ensureAuthenticated, async (req, res) => {
  req.tickRateLimiter?.(750);
  const factionId = parseId(req.params.id, 'factionId');
  const canvasId = parseCanvasId(req.body?.canvasId ?? 0);
  const changes = req.body?.changes;
  failIf(!Array.isArray(changes) || changes.length < 1 || changes.length > 50, 400, 'Invalid coordination changes.');

  const normalizedChanges = changes.map((change) => {
    const removeIds = change?.removeIds;
    const addMarks = change?.addMarks;
    failIf(!Array.isArray(removeIds) || !Array.isArray(addMarks)
      || removeIds.length > 100 || addMarks.length > 100, 400, 'Invalid coordination changes.');
    const normalizedIds = removeIds.map((id) => parseId(id, 'markId'));
    failIf(new Set(normalizedIds).size !== normalizedIds.length, 400, 'Duplicate coordination mark.');
    const normalizedMarks = addMarks.map((mark) => {
      const tool = mark?.tool === 'arrow' ? 'arrow' : mark?.tool;
      failIf(tool !== 'brush' && tool !== 'arrow', 400, 'Unknown coordination tool.');
      const points = mark?.points;
      failIf(!Array.isArray(points) || points.length < 2 || points.length > 400, 400, 'Invalid coordination path.');
      failIf(tool === 'arrow' && points.length !== 2, 400, 'An arrow needs exactly two points.');
      return {
        tool,
        color: validateColor(mark.color),
        width: parseOptionalInt(mark.width, 'width', 1, 32),
        opacity: parseOptionalInt(mark.opacity ?? 100, 'opacity', 0, 100),
        points: points.map((point) => {
          failIf(!Array.isArray(point) || point.length !== 2, 400, 'Invalid coordination point.');
          return [
            parseOptionalInt(point[0], 'x', -5000000, 5000000),
            parseOptionalInt(point[1], 'y', -5000000, 5000000),
          ];
        }),
      };
    });
    failIf(!normalizedIds.length && !normalizedMarks.length, 400, 'Empty coordination change.');
    return { removeIds: normalizedIds, addMarks: normalizedMarks };
  });
  const removeIds = normalizedChanges.flatMap((change) => change.removeIds);
  failIf(new Set(removeIds).size !== removeIds.length, 400, 'A coordination mark cannot be changed twice.');
  const addCount = normalizedChanges.reduce((total, change) => total + change.addMarks.length, 0);

  const groups = await transaction(async (connection) => {
    const membership = await requireMembership(req.user.id, factionId, connection);
    requirePermission(membership, 'drawCoordination');
    const existing = removeIds.length
      ? await connection.query(
          'SELECT id, authorId FROM FactionCoordinationMarks '
          + 'WHERE factionId = ? AND canvasId = ? AND id IN (?) FOR UPDATE',
          [factionId, canvasId, removeIds],
        )
      : [];
    failIf(existing.length !== removeIds.length, 404, 'Coordination mark not found.');
    const existingById = new Map(existing.map((mark) => [Number(mark.id), mark]));
    const countRows = await connection.query(
      'SELECT COUNT(*) AS count FROM FactionCoordinationMarks WHERE factionId = ? AND canvasId = ?',
      [factionId, canvasId],
    );
    failIf(Number(countRows[0].count) - removeIds.length + addCount > 500, 409, 'This canvas has reached the coordination mark limit.');
    if (removeIds.length) {
      await connection.query(
        'DELETE FROM FactionCoordinationMarks WHERE factionId = ? AND canvasId = ? AND id IN (?)',
        [factionId, canvasId, removeIds],
      );
    }

    const createdGroups = normalizedChanges.map((change, index) => {
      const source = change.removeIds.length ? existingById.get(change.removeIds[0]) : null;
      return {
        sourceId: change.removeIds[0] ?? index,
        marks: [],
        authorId: source ? source.authorId : req.user.id,
      };
    });
    const newMarks = normalizedChanges.flatMap((change, groupIndex) => (
      change.addMarks.map((mark) => ({ ...mark, groupIndex }))
    ));
    if (newMarks.length) {
      const placeholders = newMarks.map(() => '(?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
      const values = newMarks.flatMap((mark) => ([
        factionId,
        canvasId,
        createdGroups[mark.groupIndex].authorId,
        mark.tool,
        mark.color,
        mark.width,
        mark.opacity,
        JSON.stringify(mark.points),
      ]));
      const result = await connection.query(
        'INSERT INTO FactionCoordinationMarks '
        + '(factionId, canvasId, authorId, tool, color, width, opacity, points) '
        + `VALUES ${placeholders}`,
        values,
      );
      let markId = Number(result.insertId);
      newMarks.forEach((mark) => {
        const { groupIndex, ...createdMark } = mark;
        createdGroups[groupIndex].marks.push({
          ...createdMark,
          id: markId,
          canvasId,
        });
        markId += 1;
      });
    }
    createdGroups.forEach((group) => {
      delete group.authorId;
    });
    await writeAudit(connection, factionId, req.user.id, 'coordination.erase', null, {
      canvasId,
      removedMarkIds: removeIds,
      createdMarkCount: addCount,
    });
    return createdGroups;
  });
  res.json({ success: true, groups });
});

router.post('/coordination/:id', ensureAuthenticated, async (req, res) => {
  req.tickRateLimiter?.(750);
  const factionId = parseId(req.params.id, 'factionId');
  const canvasId = parseCanvasId(req.body?.canvasId ?? 0);
  const tool = req.body?.tool;
  failIf(tool !== 'brush' && tool !== 'arrow', 400, 'Unknown coordination tool.');
  const color = validateColor(req.body?.color);
  const width = parseOptionalInt(req.body?.width, 'width', 1, 32);
  const opacity = parseOptionalInt(req.body?.opacity ?? 100, 'opacity', 0, 100);
  const points = req.body?.points;
  failIf(!Array.isArray(points) || points.length < 2 || points.length > 400, 400, 'Invalid coordination path.');
  failIf(tool === 'arrow' && points.length !== 2, 400, 'An arrow needs exactly two points.');
  const normalizedPoints = points.map((point) => {
    failIf(!Array.isArray(point) || point.length !== 2, 400, 'Invalid coordination point.');
    return [
      parseOptionalInt(point[0], 'x', -5000000, 5000000),
      parseOptionalInt(point[1], 'y', -5000000, 5000000),
    ];
  });
  const markId = await transaction(async (connection) => {
    const membership = await requireMembership(req.user.id, factionId, connection);
    requirePermission(membership, 'drawCoordination');
    const rows = await connection.query(
      'SELECT COUNT(*) AS count FROM FactionCoordinationMarks WHERE factionId = ? AND canvasId = ?',
      [factionId, canvasId],
    );
    failIf(Number(rows[0].count) >= 500, 409, 'This canvas has reached the coordination mark limit. Clear old marks first.');
    const result = await connection.query(
      'INSERT INTO FactionCoordinationMarks '
      + '(factionId, canvasId, authorId, tool, color, width, opacity, points) '
      + 'VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [
        factionId, canvasId, req.user.id, tool, color, width, opacity,
        JSON.stringify(normalizedPoints),
      ],
    );
    await writeAudit(connection, factionId, req.user.id, 'coordination.draw', result.insertId, { canvasId, tool });
    return result.insertId;
  });
  res.status(201).json({ success: true, id: markId, opacity });
});

router.delete('/coordination/:id/marks/:markId', ensureAuthenticated, async (req, res) => {
  req.tickRateLimiter?.(750);
  const factionId = parseId(req.params.id, 'factionId');
  const markId = parseId(req.params.markId, 'markId');
  const canvasId = parseCanvasId(req.query.canvasId ?? 0);
  await transaction(async (connection) => {
    const membership = await requireMembership(req.user.id, factionId, connection);
    requirePermission(membership, 'drawCoordination');
    const result = await connection.query(
      'DELETE FROM FactionCoordinationMarks '
      + 'WHERE id = ? AND factionId = ? AND canvasId = ?',
      [markId, factionId, canvasId],
    );
    failIf(!result.affectedRows, 404, 'Coordination mark not found.');
    await writeAudit(connection, factionId, req.user.id, 'coordination.erase', markId, { canvasId });
  });
  res.json({ success: true });
});

router.delete('/coordination/:id', ensureAuthenticated, async (req, res) => {
  req.tickRateLimiter?.(2000);
  const factionId = parseId(req.params.id, 'factionId');
  const canvasId = parseCanvasId(req.query.canvasId ?? 0);
  await transaction(async (connection) => {
    const membership = await requireMembership(req.user.id, factionId, connection);
    requirePermission(membership, 'drawCoordination');
    await connection.query(
      'DELETE FROM FactionCoordinationMarks WHERE factionId = ? AND canvasId = ?',
      [factionId, canvasId],
    );
    await writeAudit(connection, factionId, req.user.id, 'coordination.clear', null, { canvasId });
  });
  res.json({ success: true });
});

router.get('/naps/status', (req, res) => {
  res.json({
    enabled: FACTION_NAPS_ENABLED,
    message: FACTION_NAPS_ENABLED
      ? 'NAP proposals are reviewed by game moderators.'
      : 'Set FACTION_NAPS_ENABLED = yes and restart the server to enable NAPs.',
  });
});

router.get('/naps/template-preview', ensureAuthenticated, async (req, res) => {
  requireNapsEnabled();
  req.tickRateLimiter?.(1000);
  const sourceFactionId = parseId(req.query.sourceFactionId, 'sourceFactionId');
  const targetTag = validateTag(req.query.targetTag);
  const membership = await getFactionForRequest(req, sourceFactionId);
  requirePermission(membership, 'manageNaps');
  const rows = await pool.query(
    'SELECT f.id, f.tag, t.canvasId, t.x, t.y, t.fileName, t.mimeType '
    + 'FROM Factions f '
    + 'INNER JOIN FactionConfigs c ON c.factionId = f.id AND c.isActive = 1 '
    + 'INNER JOIN FactionTemplates t ON t.factionId = f.id AND t.isActive = 1 '
    + 'AND c.templateUrl = CONCAT(\'/api/factions/templates/image?factionId=\', f.id, \'&templateId=\', t.id) '
    + 'WHERE UPPER(f.tag) = ? AND f.id <> ? ORDER BY c.id DESC LIMIT 1',
    [targetTag, sourceFactionId],
  );
  failIf(!rows.length, 404, 'Target faction or its active template was not found.');
  const target = rows[0];
  const image = await readFile(path.join(FACTION_TEMPLATES_DIR, path.basename(target.fileName)));
  res.set({
    'Content-Type': target.mimeType,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Template-Canvas-Id': String(target.canvasId),
    'X-Template-X': String(target.x),
    'X-Template-Y': String(target.y),
    'X-Template-Faction-Tag': target.tag,
  });
  res.send(image);
});

router.patch('/configs/active', ensureAuthenticated, async (req, res) => {
  req.tickRateLimiter?.(1500);
  const factionId = parseId(req.body?.factionId, 'factionId');
  const canvasId = parseCanvasId(req.body?.canvasId);
  const x = parseOptionalInt(req.body?.x, 'x', -10000000, 10000000);
  const y = parseOptionalInt(req.body?.y, 'y', -10000000, 10000000);
  const color = req.body?.color === undefined ? '#ffffff' : validateColor(req.body.color);
  const extra = req.body?.extra === undefined ? {} : req.body.extra;
  failIf(!extra || typeof extra !== 'object' || Array.isArray(extra), 400, 'Field extra must be an object.');
  failIf(Buffer.byteLength(JSON.stringify(extra), 'utf8') > 16000, 400, 'Template settings are too large.');
  let configId;
  await transaction(async (connection) => {
    const membership = await requireMembership(req.user.id, factionId, connection);
    requirePermission(membership, 'manageConfigs');
    const factions = await connection.query(
      'SELECT id FROM Factions WHERE id = ? FOR UPDATE',
      [factionId],
    );
    failIf(!factions.length, 404, 'Faction not found.');
    const active = await connection.query(
      'SELECT templateUrl FROM FactionConfigs WHERE factionId = ? AND isActive = 1 ORDER BY id DESC LIMIT 1 FOR UPDATE',
      [factionId],
    );
    await connection.query(
      'UPDATE FactionConfigs SET isActive = 0 WHERE factionId = ? AND isActive = 1',
      [factionId],
    );
    const inserted = await connection.query(
      'INSERT INTO FactionConfigs (factionId, templateUrl, canvasId, x, y, color, extra, isActive) '
      + 'VALUES (?, ?, ?, ?, ?, ?, ?, 1)',
      [factionId, active[0]?.templateUrl || null, canvasId, x, y, color, JSON.stringify(extra)],
    );
    await connection.query(
      'UPDATE FactionTemplates SET canvasId = ?, x = ?, y = ? '
      + 'WHERE factionId = ? AND isActive = 1',
      [canvasId, x, y, factionId],
    );
    configId = inserted.insertId;
    await writeAudit(connection, factionId, req.user.id, 'config.update', configId, { canvasId, x, y, color });
  });
  await updateFactionTerritory(factionId);
  const rows = await pool.query(
    'SELECT id, factionId, templateUrl, canvasId, x, y, color, extra, isActive, createdAt '
    + 'FROM FactionConfigs WHERE id = ?',
    [configId],
  );
  if (rows[0]) rows[0].extra = parseJson(rows[0].extra, {});
  res.json({ config: rows[0] || null });
});

async function getFactionMembers(factionId, includeStats = false) {
  const rows = await pool.query(
    'SELECT u.id, u.name, u.username, uf.`role`, uf.joined, uf.permissions, '
    + 'f.ownerId, p.customFlag AS flag, '
    + 'CONCAT(a.shortId, \':\', a.extension) AS avatar '
    + 'FROM UserFactions uf INNER JOIN Users u ON u.id = uf.uid '
    + 'INNER JOIN Factions f ON f.id = uf.fid '
    + 'LEFT JOIN Profiles p ON p.uid = u.id LEFT JOIN Media a ON a.id = p.avatar '
    + 'WHERE uf.fid = ? ORDER BY FIELD(uf.`role`,\'owner\',\'leader\',\'deputy\',\'officer\',\'member\'), uf.joined',
    [factionId],
  );
  return Promise.all(rows.map(async (member) => {
    let total;
    let today;
    if (includeStats) {
      [total, today] = await getUserRanks(member.id);
    }
    return {
      id: member.id,
      name: member.name,
      username: member.username,
      flag: member.flag,
      avatar: member.avatar,
      role: Number(member.id) === Number(member.ownerId)
        ? 'owner' : member.role,
      permissions: getPermissions(member.role, member.permissions),
      total,
      today,
      week: null,
      month: null,
    };
  }));
}

router.get('/my/member-stats', ensureAuthenticated, async (req, res) => {
  const factionId = parseId(req.query.factionId, 'factionId');
  await getFactionForRequest(req, factionId);
  res.json({ members: await getFactionMembers(factionId, true) });
});

router.get('/members', ensureAuthenticated, async (req, res) => {
  const factionId = parseId(req.query.factionId, 'factionId');
  await getFactionForRequest(req, factionId);
  res.json({ members: await getFactionMembers(factionId) });
});

router.get('/applications', ensureAuthenticated, async (req, res) => {
  const factionId = parseId(req.query.factionId, 'factionId');
  const membership = await getFactionForRequest(req, factionId);
  requirePermission(membership, 'manageApplications');
  const applications = await pool.query(
    'SELECT a.id, a.factionId, a.userId, u.name, u.username, a.message, a.status, a.createdAt '
    + 'FROM FactionApplications a INNER JOIN Users u ON u.id = a.userId '
    + 'WHERE a.factionId = ? AND a.status = \'pending\' ORDER BY a.createdAt ASC',
    [factionId],
  );
  res.json({ applications });
});

router.get('/:id', ensureAuthenticated, async (req, res) => {
  const factionId = parseId(req.params.id, 'factionId');
  const row = await getFactionDetails(factionId);
  failIf(!row, 404, 'Faction not found.');
  const faction = serializeFaction(row);
  const membership = await getFactionMembership(req.user.id, factionId);
  if (faction.isPrivate && !membership) {
    res.json({
      faction: {
        id: faction.id,
        tag: faction.tag,
        name: faction.name,
        flag: faction.flag,
        flagUrl: faction.flagUrl,
        ownerId: faction.ownerId,
        isPrivate: true,
        createdAt: faction.createdAt,
      },
    });
    return;
  }
  res.json({ faction });
});

router.get('/:id/territory', ensureAuthenticated, async (req, res) => {
  const factionId = parseId(req.params.id, 'factionId');
  const faction = await getFactionDetails(factionId);
  failIf(!faction, 404, 'Faction not found.');
  if (faction.flags & (1 << FACTION_FLAGS.PRIV)) {
    const membership = await getFactionMembership(req.user.id, factionId);
    failIf(!membership, 403, 'You do not have access to this faction.');
  }
  res.json(await getFactionTerritory(factionId));
});

router.get('/:id/naps/mine', ensureAuthenticated, async (req, res) => {
  const factionId = parseId(req.params.id, 'factionId');
  await getFactionForRequest(req, factionId);
  const naps = await pool.query(
    'SELECT n.id, n.factionA, n.factionB, n.requestedBy, n.terms, '
    + 'CASE WHEN n.factionB = ? THEN 1 ELSE 0 END AS incoming, '
    + 'other.id AS otherId, other.tag AS otherTag, other.title AS otherName, '
    + 'a.tag AS tagA, b.tag AS tagB, '
    + 'other.flagUrl AS otherFlagUrl, n.status, n.createdAt, n.decidedAt, '
    + 'n.startDate, n.endDate, n.territory, n.breakAApproved, n.breakBApproved '
    + 'FROM FactionNaps n INNER JOIN Factions other ON other.id = '
    + 'CASE WHEN n.factionA = ? THEN n.factionB ELSE n.factionA END '
    + 'INNER JOIN Factions a ON a.id = n.factionA '
    + 'INNER JOIN Factions b ON b.id = n.factionB '
    + 'WHERE n.factionA = ? OR n.factionB = ? ORDER BY n.createdAt DESC',
    [factionId, factionId, factionId, factionId],
  );
  res.json({
    naps: naps.map((nap) => ({
      id: nap.id,
      tagA: nap.tagA,
      tagB: nap.tagB,
      otherFaction: { id: nap.otherId, tag: nap.otherTag, name: nap.otherName, flagUrl: nap.otherFlagUrl },
      status: nap.status,
      incoming: Boolean(nap.incoming),
      requestedBy: nap.requestedBy,
      terms: parseJson(nap.terms, []),
      createdAt: nap.createdAt,
      decidedAt: nap.decidedAt,
      startDate: nap.startDate,
      endDate: nap.endDate,
      territory: parseJson(nap.territory, null),
      breakAApproved: Boolean(Number(nap.breakAApproved)),
      breakBApproved: Boolean(Number(nap.breakBApproved)),
    })),
  });
});

router.use(ensureAuthenticated);

router.post('/create', async (req, res) => {
  const [totalPixels] = await getUserRanks(req.user.id);
  failIf(totalPixels < 50000, 403, 'You need at least 50,000 placed pixels to create a faction.');
  const tag = validateTag(req.body?.tag);
  const name = validateString(req.body?.name, 'name', 3, 32);
  const description = req.body?.description === undefined
    ? '' : validateString(req.body.description, 'description', 0, 500);
  const color = req.body?.color === undefined ? '#ffffff' : validateColor(req.body.color);
  const flagBuffer = await imageBufferFromBase64(req.body?.flagBase64);
  let savedFlag = null;
  let factionId;
  try {
    factionId = await transaction(async (connection) => {
      const users = await connection.query('SELECT id FROM Users WHERE id = ? FOR UPDATE', [req.user.id]);
      failIf(!users.length, 401, 'User account not found or invalid.');
      const memberships = await connection.query('SELECT fid FROM UserFactions WHERE uid = ? FOR UPDATE', [req.user.id]);
      failIf(memberships.length, 409, 'You can only be in one faction.');
      const channels = await connection.query(
        'INSERT INTO Channels (name, type, lastMessage, createdAt) VALUES (?, ?, NOW(), NOW())',
        [tag, CHANNEL_TYPES.FACTION],
      );
      const channelId = channels.insertId;
      if (flagBuffer) savedFlag = await saveFlag(0, flagBuffer);
      const factions = await connection.query(
        'INSERT INTO Factions (cid, ownerId, name, tag, title, description, color, flagUrl, '
        + 'openJoin, coordinationIds, flags, memberCount, createdAt) '
        + 'VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 0, 1, NOW())',
        [
          channelId, req.user.id, tag.toLowerCase(), tag, name, description,
          color, savedFlag?.url || null, JSON.stringify([]),
        ],
      );
      const newFactionId = factions.insertId;
      if (savedFlag) {
        const finalName = safeImageName(newFactionId);
        const finalPath = path.join(FACTION_FLAGS_DIR, finalName);
        const tempPath = savedFlag.target;
        await rename(tempPath, finalPath);
        savedFlag = {
          fileName: finalName,
          url: '/userdata/factionflags/' + finalName,
          target: finalPath,
        };
        await connection.query('UPDATE Factions SET flagUrl = ? WHERE id = ?', [savedFlag.url, newFactionId]);
      }
      await connection.query(
        'INSERT INTO UserFactions (uid, fid, `role`) VALUES (?, ?, ?)',
        [req.user.id, newFactionId, 'owner'],
      );
      await connection.query(
        'INSERT INTO UserChannels (uid, cid, lastRead) VALUES (?, ?, NOW())',
        [req.user.id, channelId],
      );
      for (const role of ROLE_ORDER) {
        // Use a single connection so the sequence of seeds is atomic.
        // eslint-disable-next-line no-await-in-loop
        await factionRoleId(connection, newFactionId, role);
      }
      await setLegacyFactionRole(connection, newFactionId, req.user.id, 'owner');
      await writeAudit(connection, newFactionId, req.user.id, 'create', null, { tag });
      return newFactionId;
    });
  } catch (error) {
    await removeFileQuietly(savedFlag?.target);
    if (error.code === 'ER_DUP_ENTRY') {
      throw httpError(409, 'This tag is already taken.');
    }
    throw error;
  }
  const createdFaction = await getFactionDetails(factionId);
  await invalidateUserFactionCache(req.user.id);
  patchChannelJoin(req.user.id, createdFaction.channelId, createdFaction.channelName);
  res.status(201).json({ faction: serializeFaction(createdFaction) });
});

router.post('/join', ensureAuthenticated, async (req, res) => {
  req.tickRateLimiter?.(2500);
  const factionId = parseId(req.body?.factionId, 'factionId');
  const channelChange = await transaction(async (connection) => {
    const factions = await connection.query(
      'SELECT id, flags, openJoin FROM Factions WHERE id = ? FOR UPDATE',
      [factionId],
    );
    failIf(!factions.length, 404, 'Faction not found.');
    failIf(
      (factions[0].flags & (1 << FACTION_FLAGS.PRIV)) !== 0
      || !factions[0].openJoin,
      403,
      'This faction does not allow direct joining.',
    );
    const channel = await addMember(connection, factionId, req.user.id);
    await connection.query(
      'UPDATE FactionApplications SET status = \'accepted\', '
      + 'decidedAt = NOW(), decidedBy = ? '
      + 'WHERE factionId = ? AND userId = ? AND status = \'pending\'',
      [req.user.id, factionId, req.user.id],
    );
    await writeAudit(connection, factionId, req.user.id, 'member.join');
    return channel;
  });
  await invalidateUserFactionCache(req.user.id);
  patchChannelJoin(
    req.user.id, channelChange.channelId, channelChange.channelName,
  );
  res.json({ success: true });
});

router.post('/apply', ensureAuthenticated, async (req, res) => {
  req.tickRateLimiter?.(3000);
  const factionId = parseId(req.body?.factionId, 'factionId');
  const message = req.body?.message === undefined ? '' : validateString(req.body.message, 'message', 0, 500);
  await transaction(async (connection) => {
    const users = await connection.query('SELECT id FROM Users WHERE id = ? FOR UPDATE', [req.user.id]);
    failIf(!users.length, 401, 'User account not found or invalid.');
    const factions = await connection.query(
      'SELECT id, flags, title FROM Factions WHERE id = ? FOR UPDATE',
      [factionId],
    );
    failIf(!factions.length, 404, 'Faction not found.');
    failIf(
      (factions[0].flags & (1 << FACTION_FLAGS.PRIV)) !== 0,
      403,
      'This faction is private.',
    );
    const memberships = await connection.query('SELECT fid FROM UserFactions WHERE uid = ? FOR UPDATE', [req.user.id]);
    failIf(memberships.length, 409, 'You are already in a faction.');
    const applications = await connection.query(
      'SELECT id FROM FactionApplications WHERE factionId = ? AND userId = ? AND status = ? FOR UPDATE',
      [factionId, req.user.id, 'pending'],
    );
    failIf(applications.length, 409, 'An application for this faction has already been submitted.');
    await connection.query(
      'INSERT INTO FactionApplications (factionId, userId, message) VALUES (?, ?, ?)',
      [factionId, req.user.id, message],
    );
    const reviewers = await connection.query(
      'SELECT f.ownerId, uf.uid, uf.`role`, uf.permissions '
      + 'FROM Factions f LEFT JOIN UserFactions uf ON uf.fid = f.id '
      + 'WHERE f.id = ?',
      [factionId],
    );
    const recipientIds = new Set(reviewers
      .filter((reviewer) => reviewer.uid
        && (Number(reviewer.uid) === Number(reviewer.ownerId)
          || getPermissions(reviewer.role, reviewer.permissions)
            .manageApplications))
      .map((reviewer) => Number(reviewer.uid)));
    if (reviewers[0]?.ownerId) {
      recipientIds.add(Number(reviewers[0].ownerId));
    }
    const notificationRecipients = [...recipientIds];
    if (notificationRecipients.length) {
      const notificationMessage = `${req.user.name} applied to join `
        + `${factions[0].title}. Review the request in your faction's `
        + 'Notifications tab.';
      const notificationValues = notificationRecipients.flatMap((uid) => [
        uid,
        req.user.id,
        req.user.name,
        req.user.userlvl || 0,
        notificationMessage,
      ]);
      const placeholders = notificationRecipients.map(() => '(?, ?, ?, ?, ?)')
        .join(', ');
      await connection.query(
        'INSERT INTO UserNotifications '
        + '(uid, senderUid, senderName, senderUserlvl, message) VALUES '
        + placeholders,
        notificationValues,
      );
    }
    await writeAudit(connection, factionId, req.user.id, 'application.create');
  });
  res.json({ success: true });
});

router.post('/invite', async (req, res) => {
  req.tickRateLimiter?.(2000);
  const factionId = parseId(req.body?.factionId, 'factionId');
  const userId = parseId(req.body?.userId, 'userId');
  await transaction(async (connection) => {
    const membership = await requireMembership(req.user.id, factionId, connection);
    requirePermission(membership, 'manageInvites');
    failIf(userId === req.user.id, 400, 'You cannot invite yourself.');
    const users = await connection.query('SELECT id FROM Users WHERE id = ? FOR UPDATE', [userId]);
    failIf(!users.length, 404, 'Player not found.');
    const targetMembership = await connection.query('SELECT fid FROM UserFactions WHERE uid = ? FOR UPDATE', [userId]);
    failIf(targetMembership.length, 409, 'Player is already in a faction.');
    try {
      await connection.query(
        'INSERT INTO FactionUserInvites (factionId, userId, invitedBy) VALUES (?, ?, ?)',
        [factionId, userId, req.user.id],
      );
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') throw httpError(409, 'Player is already invited to your faction.');
      throw error;
    }
    await writeAudit(connection, factionId, req.user.id, 'invite.create', userId);
  });
  res.json({ success: true });
});

router.post('/accept-invite', async (req, res) => {
  req.tickRateLimiter?.(2500);
  const factionId = parseId(req.body?.factionId, 'factionId');
  const membershipChannel = await transaction(async (connection) => {
    const invites = await connection.query(
      'SELECT id FROM FactionUserInvites WHERE factionId = ? AND userId = ? FOR UPDATE',
      [factionId, req.user.id],
    );
    failIf(!invites.length, 404, 'Invite not found or already used.');
    const channel = await addMember(connection, factionId, req.user.id);
    await connection.query('DELETE FROM FactionUserInvites WHERE id = ?', [invites[0].id]);
    await writeAudit(connection, factionId, req.user.id, 'invite.accept');
    return channel;
  });
  await invalidateUserFactionCache(req.user.id);
  patchChannelJoin(req.user.id, membershipChannel.channelId, membershipChannel.channelName);
  res.json({ success: true });
});

router.post('/leave', async (req, res) => {
  req.tickRateLimiter?.(2000);
  const factionId = parseId(req.body?.factionId, 'factionId');
  const filesToDelete = [];
  const channelChange = await transaction(async (connection) => {
    const membership = await requireMembership(req.user.id, factionId, connection);
    const factions = await connection.query(
      'SELECT f.id, f.cid, f.ownerId, f.title, f.flagUrl, c.name AS channelName '
      + 'FROM Factions f LEFT JOIN Channels c ON c.id = f.cid WHERE f.id = ? FOR UPDATE',
      [factionId],
    );
    const [countRow] = await connection.query('SELECT COUNT(*) AS count FROM UserFactions WHERE fid = ?', [factionId]);
    if (membership.role === 'owner' || factions[0].ownerId === req.user.id) {
      failIf(Number(countRow.count) > 1, 409, 'Transfer ownership before leaving the faction.');
      const memberRows = await connection.query('SELECT uid FROM UserFactions WHERE fid = ?', [factionId]);
      await writeAudit(connection, factionId, req.user.id, 'owner.leave', null, { name: factions[0].title });
      if (factions[0].flagUrl) filesToDelete.push(path.join(FACTION_FLAGS_DIR, path.basename(factions[0].flagUrl)));
      const templates = await connection.query(
        'SELECT fileName FROM FactionTemplates WHERE factionId = ?',
        [factionId],
      );
      templates.forEach((row) => filesToDelete.push(path.join(FACTION_TEMPLATES_DIR, path.basename(row.fileName))));
      if (factions[0].cid) await connection.query('DELETE FROM Channels WHERE id = ?', [factions[0].cid]);
      else await connection.query('DELETE FROM Factions WHERE id = ?', [factionId]);
      return {
        channelId: factions[0].cid,
        channelName: factions[0].channelName,
        userIds: memberRows.map((row) => row.uid),
        deleted: true,
      };
    } else {
      const channel = await removeMember(connection, factionId, req.user.id);
      await writeAudit(connection, factionId, req.user.id, 'member.leave');
      return { ...channel, userIds: [req.user.id], deleted: false };
    }
  });
  await Promise.all(channelChange.userIds.map(invalidateUserFactionCache));
  patchChannelLeave(channelChange.userIds, channelChange.channelId);
  await Promise.all(filesToDelete.map(removeFileQuietly));
  res.json({ success: true });
});

router.post('/kick', async (req, res) => {
  req.tickRateLimiter?.(2000);
  const factionId = parseId(req.body?.factionId, 'factionId');
  const userId = parseId(req.body?.userId, 'userId');
  const channelChange = await transaction(async (connection) => {
    const actor = await requireMembership(req.user.id, factionId, connection);
    requirePermission(actor, 'manageMembers');
    failIf(userId === req.user.id, 400, 'You cannot kick yourself.');
    const target = await requireMembership(userId, factionId, connection);
    const actorLevel = ROLE_ORDER.indexOf(actor.role);
    const targetLevel = ROLE_ORDER.indexOf(target.role);
    failIf(target.role === 'owner' || target.ownerId === userId || actorLevel <= targetLevel, 403, 'Cannot kick the owner or a member with an equal or higher role.');
    const channel = await removeMember(connection, factionId, userId);
    await writeAudit(connection, factionId, req.user.id, 'member.kick', userId);
    return channel;
  });
  await invalidateUserFactionCache(userId);
  patchChannelLeave([userId], channelChange.channelId);
  res.json({ success: true });
});

router.post('/set-rank', async (req, res) => {
  req.tickRateLimiter?.(2000);
  const factionId = parseId(req.body?.factionId, 'factionId');
  const userId = parseId(req.body?.userId, 'userId');
  const role = req.body?.rank;
  failIf(!ROLE_ORDER.includes(role) || role === 'owner', 400, 'Invalid role.');
  await transaction(async (connection) => {
    const actor = await requireMembership(req.user.id, factionId, connection);
    requirePermission(actor, 'manageRanks');
    failIf(userId === req.user.id, 400, 'You cannot change your own role this way.');
    const target = await requireMembership(userId, factionId, connection);
    const actorLevel = ROLE_ORDER.indexOf(actor.role);
    const targetLevel = ROLE_ORDER.indexOf(target.role);
    failIf(target.ownerId === userId || target.role === 'owner', 403, 'Owner role can only be changed during ownership transfer.');
    failIf(targetLevel >= actorLevel || ROLE_ORDER.indexOf(role) !== actorLevel - 1, 403, 'You can only assign a role one level below your own.');
    await connection.query('UPDATE UserFactions SET `role` = ? WHERE uid = ? AND fid = ?', [role, userId, factionId]);
    await setLegacyFactionRole(connection, factionId, userId, role);
    await writeAudit(connection, factionId, req.user.id, 'member.rank', userId, { role });
  });
  res.json({ success: true });
});

router.post('/members/permissions', async (req, res) => {
  req.tickRateLimiter?.(2000);
  const factionId = parseId(req.body?.factionId, 'factionId');
  const userId = parseId(req.body?.userId, 'userId');
  const role = req.body?.role || req.body?.rank;
  const permissions = req.body?.permissions && typeof req.body.permissions === 'object' ? req.body.permissions : null;
  if (role) {
    failIf(!ROLE_ORDER.includes(role) || role === 'owner', 400, 'Invalid role.');
  }
  await transaction(async (connection) => {
    const actor = await requireMembership(req.user.id, factionId, connection);
    requirePermission(actor, 'manageRanks');
    failIf(userId === req.user.id, 400, 'You cannot change your own role or permissions this way.');
    const target = await requireMembership(userId, factionId, connection);
    failIf(target.ownerId === userId || target.role === 'owner', 403, 'Owner cannot be modified.');
    const actorLevel = ROLE_LEVEL[actor.role] ?? 0;
    const targetLevel = ROLE_LEVEL[target.role] ?? 0;
    if (actor.role !== 'owner' && actorLevel <= targetLevel) {
      throw httpError(403, 'Cannot modify permissions for a member with equal or higher role.');
    }
    const assignments = [];
    const values = [];
    if (role) {
      failIf(
        actor.role !== 'owner' && ROLE_LEVEL[role] >= actorLevel,
        403,
        'You cannot assign a role equal to or higher than your own.',
      );
      assignments.push('`role` = ?');
      values.push(role);
      await setLegacyFactionRole(connection, factionId, userId, role);
    }
    if (permissions !== null) {
      assignments.push('permissions = ?');
      values.push(JSON.stringify(permissions));
    }
    if (assignments.length) {
      values.push(userId, factionId);
      await connection.query('UPDATE UserFactions SET ' + assignments.join(', ') + ' WHERE uid = ? AND fid = ?', values);
    }
    await writeAudit(connection, factionId, req.user.id, 'member.permissions', userId, { role, permissions });
  });
  res.json({ success: true });
});

router.post('/transfer-ownership', async (req, res) => {
  req.tickRateLimiter?.(3000);
  const factionId = parseId(req.body?.factionId, 'factionId');
  const userId = parseId(req.body?.userId, 'userId');
  await transaction(async (connection) => {
    const actor = await requireMembership(req.user.id, factionId, connection);
    failIf(actor.role !== 'owner' || actor.ownerId !== req.user.id, 403, 'Only the owner can transfer ownership.');
    failIf(userId === req.user.id, 400, 'You are already the owner.');
    const target = await requireMembership(userId, factionId, connection);
    failIf(target.role === 'owner' || target.ownerId === userId, 409, 'This player is already the owner.');
    await connection.query('UPDATE Factions SET ownerId = ? WHERE id = ?', [userId, factionId]);
    await connection.query('UPDATE UserFactions SET `role` = ? WHERE uid = ? AND fid = ?', ['member', req.user.id, factionId]);
    await connection.query('UPDATE UserFactions SET `role` = ? WHERE uid = ? AND fid = ?', ['owner', userId, factionId]);
    await setLegacyFactionRole(connection, factionId, req.user.id, 'member');
    await setLegacyFactionRole(connection, factionId, userId, 'owner');
    await writeAudit(connection, factionId, req.user.id, 'ownership.transfer', userId);
  });
  res.json({ success: true });
});

async function decideApplication(req, res, accepted) {
  req.tickRateLimiter?.(2000);
  const applicationId = parseId(req.body?.applicationId, 'applicationId');
  let applicantUserId;
  let channelChange = null;
  await transaction(async (connection) => {
    const applications = await connection.query(
      'SELECT id, factionId, userId, status FROM FactionApplications WHERE id = ? FOR UPDATE',
      [applicationId],
    );
    failIf(!applications.length || applications[0].status !== 'pending', 404, 'Pending application not found.');
    const application = applications[0];
    applicantUserId = application.userId;
    const membership = await requireMembership(req.user.id, application.factionId, connection);
    requirePermission(membership, 'manageApplications');
    if (accepted) channelChange = await addMember(connection, application.factionId, application.userId);
    await connection.query(
      'UPDATE FactionApplications SET status = ?, decidedAt = NOW(), decidedBy = ? WHERE id = ?',
      [accepted ? 'accepted' : 'rejected', req.user.id, applicationId],
    );
    await writeAudit(
      connection,
      application.factionId,
      req.user.id,
      accepted ? 'application.accept' : 'application.reject',
      application.userId,
    );
  });
  if (accepted && applicantUserId) await invalidateUserFactionCache(applicantUserId);
  if (accepted && channelChange) patchChannelJoin(applicantUserId, channelChange.channelId, channelChange.channelName);
  res.json({ success: true });
}

router.post('/applications/accept', (req, res) => decideApplication(req, res, true));
router.post('/applications/reject', (req, res) => decideApplication(req, res, false));

router.patch('/:id', async (req, res) => {
  req.tickRateLimiter?.(1500);
  const factionId = parseId(req.params.id, 'factionId');
  const body = req.body || {};
  const hasName = Object.hasOwn(body, 'name');
  const hasTag = Object.hasOwn(body, 'tag');
  const hasDescription = Object.hasOwn(body, 'description');
  const hasColor = Object.hasOwn(body, 'color');
  const hasFlag = Object.hasOwn(body, 'flagBase64');
  const hasAvatar = Object.hasOwn(body, 'avatarId');
  const hasBanner = Object.hasOwn(body, 'bannerId');
  const hasPrivacy = Object.hasOwn(body, 'isPrivate');
  const hasOpenJoin = Object.hasOwn(body, 'openJoin');
  const hasCoordination = Object.hasOwn(body, 'coordinationIds');
  failIf(!hasName && !hasTag && !hasDescription && !hasColor && !hasFlag
    && !hasPrivacy && !hasOpenJoin && !hasCoordination && !hasAvatar && !hasBanner,
  400, 'No fields specified.');
  const name = hasName ? validateString(body.name, 'name', 3, 32) : null;
  const tag = hasTag ? validateTag(body.tag) : null;
  const description = hasDescription ? validateString(body.description, 'description', 0, 500) : null;
  const color = hasColor ? validateColor(body.color) : null;
  const isPrivate = hasPrivacy ? body.isPrivate : null;
  const openJoin = hasOpenJoin ? body.openJoin : null;
  failIf(hasPrivacy && typeof isPrivate !== 'boolean', 400, 'Field isPrivate must be a boolean.');
  failIf(hasOpenJoin && typeof openJoin !== 'boolean', 400, 'Field openJoin must be a boolean.');
  const coordinationIds = hasCoordination ? parseCoordinationIds(body.coordinationIds) : null;
  const avatarId = hasAvatar ? body.avatarId : null;
  const bannerId = hasBanner ? body.bannerId : null;
  failIf(hasAvatar && avatarId !== null && typeof avatarId !== 'string', 400, 'Field avatarId must be an image ID or null.');
  failIf(hasBanner && bannerId !== null && typeof bannerId !== 'string', 400, 'Field bannerId must be an image ID or null.');
  const flagBuffer = hasFlag && body.flagBase64 !== null
    ? await imageBufferFromBase64(body.flagBase64) : null;
  let newFlag = null;
  let oldFlagPath = null;
  try {
    await transaction(async (connection) => {
      const membership = await requireMembership(req.user.id, factionId, connection);
      const changesFaction = hasName || hasTag || hasDescription || hasColor || hasFlag || hasPrivacy || hasOpenJoin;
      if (changesFaction) requirePermission(membership, 'manageFaction');
      if (hasAvatar || hasBanner) requirePermission(membership, 'manageFactionAppearance');
      if (hasCoordination) requirePermission(membership, 'manageCoordination');
      if (hasAvatar && avatarId) {
        failIf(await getMediaType(avatarId) !== 'image', 400, 'Faction avatar must be a valid image.');
      }
      if (hasBanner && bannerId) {
        failIf(await getMediaType(bannerId) !== 'image', 400, 'Faction banner must be a valid image.');
      }
      const factionRows = await connection.query(
        'SELECT id, cid, flagUrl, flags FROM Factions WHERE id = ? FOR UPDATE',
        [factionId],
      );
      failIf(!factionRows.length, 404, 'Faction not found.');
      const privateMask = 1 << FACTION_FLAGS.PRIV;
      const nextPrivate = hasPrivacy
        ? isPrivate : (factionRows[0].flags & privateMask) !== 0;
      failIf(nextPrivate && hasOpenJoin && openJoin, 400, 'A private faction cannot accept applications from everyone.');
      const assignments = [];
      const values = [];
      if (hasName) {
        assignments.push('title = ?');
        values.push(name);
      }
      if (hasTag) {
        assignments.push('tag = ?', 'name = ?');
        values.push(tag, tag.toLowerCase());
        if (factionRows[0].cid) {
          await connection.query('UPDATE Channels SET name = ? WHERE id = ?', [tag, factionRows[0].cid]);
        }
      }
      if (hasDescription) {
        assignments.push('description = ?');
        values.push(description);
      }
      if (hasColor) {
        assignments.push('color = ?');
        values.push(color);
      }
      if (hasAvatar) {
        assignments.push('avatar = (SELECT id FROM Media WHERE shortId = ? AND extension = ?)');
        if (avatarId) values.push(...avatarId.split(':'));
        else values.push(null, null);
      }
      if (hasBanner) {
        assignments.push('banner = (SELECT id FROM Media WHERE shortId = ? AND extension = ?)');
        if (bannerId) values.push(...bannerId.split(':'));
        else values.push(null, null);
      }
      if (hasFlag) {
        oldFlagPath = factionRows[0].flagUrl
          ? path.join(FACTION_FLAGS_DIR, path.basename(factionRows[0].flagUrl)) : null;
        newFlag = flagBuffer ? await saveFlag(factionId, flagBuffer) : null;
        assignments.push('flagUrl = ?');
        values.push(newFlag?.url || null);
      }
      if (hasPrivacy) {
        assignments.push('flags = CASE WHEN ? = 1 THEN flags | ? ELSE flags & ~? END');
        values.push(isPrivate ? 1 : 0, privateMask, privateMask);
      }
      if (hasOpenJoin || (hasPrivacy && isPrivate)) {
        assignments.push('openJoin = ?');
        values.push(hasOpenJoin && openJoin ? 1 : 0);
      }
      if (hasCoordination) {
        const placeholders = coordinationIds.map(() => '?').join(',');
        if (coordinationIds.length) {
          const members = await connection.query(
            'SELECT uid FROM UserFactions WHERE fid = ? AND uid IN (' + placeholders + ')',
            [factionId, ...coordinationIds],
          );
          failIf(members.length !== coordinationIds.length, 400, 'All coordinators must be in the faction.');
        }
        assignments.push('coordinationIds = ?');
        values.push(JSON.stringify(coordinationIds));
      }
      assignments.push('updatedAt = NOW()');
      values.push(factionId);
      await connection.query(
        'UPDATE Factions SET ' + assignments.join(', ') + ' WHERE id = ?',
        values,
      );
      await writeAudit(connection, factionId, req.user.id, 'settings.update', null, {
        name: hasName,
        tag: hasTag,
        description: hasDescription,
        color: hasColor,
        avatar: hasAvatar,
        banner: hasBanner,
        flag: hasFlag,
        privacy: hasPrivacy,
        openJoin: hasOpenJoin,
        coordination: hasCoordination,
      });
    });
  } catch (error) {
    await removeFileQuietly(newFlag?.target);
    throw error;
  }
  if (hasFlag && oldFlagPath && oldFlagPath !== newFlag?.target) await removeFileQuietly(oldFlagPath);
  const faction = serializeFaction(await getFactionDetails(factionId));
  if (hasAvatar || hasBanner) {
    const members = await pool.query('SELECT uid FROM UserFactions WHERE fid = ?', [factionId]);
    const memberIds = members.map(({ uid }) => uid);
    if (memberIds.length) {
      if (hasAvatar) {
        socketEvents.patchUserState(memberIds, 'profile', {
          op: 'setex',
          path: `factions[name:${faction.name}].avatarId`,
          value: faction.avatarId,
        });
      }
      if (hasBanner) {
        socketEvents.patchUserState(memberIds, 'profile', {
          op: 'setex',
          path: `factions[name:${faction.name}].bannerId`,
          value: faction.bannerId,
        });
      }
    }
  }
  res.json({ faction });
});

router.delete('/:id', async (req, res, next) => {
  if (req.params.id === 'template') {
    next();
    return;
  }
  req.tickRateLimiter?.(5000);
  const factionId = parseId(req.params.id, 'factionId');
  const confirmName = validateString(req.body?.confirmName, 'confirmName', 1, 32);
  const filesToDelete = [];
  const deletedChannel = await transaction(async (connection) => {
    const membership = await requireMembership(req.user.id, factionId, connection);
    const rows = await connection.query(
      'SELECT f.id, f.cid, f.ownerId, f.title, f.flagUrl, c.name AS channelName '
      + 'FROM Factions f LEFT JOIN Channels c ON c.id = f.cid WHERE f.id = ? FOR UPDATE',
      [factionId],
    );
    failIf(!rows.length, 404, 'Faction not found.');
    failIf(rows[0].ownerId !== req.user.id || membership.role !== 'owner', 403, 'Only the owner can disband the faction.');
    failIf(confirmName !== rows[0].title, 400, 'Confirmation does not match the faction name.');
    if (rows[0].flagUrl) filesToDelete.push(path.join(FACTION_FLAGS_DIR, path.basename(rows[0].flagUrl)));
    const memberRows = await connection.query('SELECT uid FROM UserFactions WHERE fid = ?', [factionId]);
    const templates = await connection.query(
      'SELECT fileName FROM FactionTemplates WHERE factionId = ?',
      [factionId],
    );
    templates.forEach((row) => filesToDelete.push(path.join(FACTION_TEMPLATES_DIR, path.basename(row.fileName))));
    await writeAudit(connection, factionId, req.user.id, 'delete', null, {
      tag: rows[0].title,
      name: rows[0].title,
    });
    if (rows[0].cid) await connection.query('DELETE FROM Channels WHERE id = ?', [rows[0].cid]);
    else await connection.query('DELETE FROM Factions WHERE id = ?', [factionId]);
    return {
      channelId: rows[0].cid,
      userIds: memberRows.map((row) => row.uid),
    };
  });
  await Promise.all(deletedChannel.userIds.map(invalidateUserFactionCache));
  patchChannelLeave(deletedChannel.userIds, deletedChannel.channelId);
  await Promise.all(filesToDelete.map(removeFileQuietly));
  res.json({ success: true });
});

router.post('/:id/naps/accept', (req, res) => {
  res.status(410).json({ error: 'A game moderator must approve the NAP proposal.' });
});

router.post('/:id/naps/reject', (req, res) => {
  res.status(410).json({ error: 'A game moderator must reject the NAP proposal.' });
});

router.delete('/:id/naps/:napId', async (req, res) => {
  requireNapsEnabled();
  req.tickRateLimiter?.(2000);
  const factionId = parseId(req.params.id, 'factionId');
  const napId = parseId(req.params.napId, 'napId');
  const endedNap = await transaction(async (connection) => {
    const membership = await requireMembership(req.user.id, factionId, connection);
    requirePermission(membership, 'manageNaps');
    const naps = await connection.query(
      'SELECT n.id, n.factionA, n.factionB, n.status, n.requestedBy, '
      + 'n.breakAApproved, n.breakBApproved, '
      + 'a.tag AS tagA, b.tag AS tagB FROM FactionNaps n '
      + 'INNER JOIN Factions a ON a.id = n.factionA INNER JOIN Factions b ON b.id = n.factionB '
      + 'WHERE n.id = ? FOR UPDATE',
      [napId],
    );
    failIf(!naps.length || (
      Number(naps[0].factionA) !== factionId
      && Number(naps[0].factionB) !== factionId
    ), 404, 'Pact not found.');
    failIf(!['pending', 'active'].includes(naps[0].status), 409, 'Pact is already closed.');
    const nap = naps[0];
    failIf(nap.status === 'pending' && Number(nap.factionA) !== factionId,
      403, 'Only the proposing faction can withdraw a pending NAP.');
    if (nap.status === 'active') {
      const approvedA = Number(nap.factionA) === factionId;
      const alreadyApproved = Boolean(Number(
        approvedA ? nap.breakAApproved : nap.breakBApproved,
      ));
      failIf(alreadyApproved, 409, 'Your faction has already approved termination.');
      const approvalColumn = approvedA ? 'breakAApproved' : 'breakBApproved';
      await connection.query(
        `UPDATE FactionNaps SET ${approvalColumn} = 1 WHERE id = ?`,
        [napId],
      );
      const breakAApproved = approvedA || Boolean(Number(nap.breakAApproved));
      const breakBApproved = !approvedA || Boolean(Number(nap.breakBApproved));
      const status = breakAApproved && breakBApproved ? 'broken' : 'active';
      if (status === 'broken') {
        await connection.query(
          'UPDATE FactionNaps SET status = ?, decidedAt = NOW() WHERE id = ?',
          [status, napId],
        );
      }
      await writeAudit(
        connection,
        factionId,
        req.user.id,
        'nap.termination.approve',
        napId,
        { breakAApproved, breakBApproved, status },
      );
      return { ...nap, status, breakAApproved, breakBApproved };
    }

    await connection.query(
      'UPDATE FactionNaps SET status = ?, decidedAt = NOW() WHERE id = ?',
      ['rejected', napId],
    );
    const otherFactionId = Number(nap.factionA) === factionId ? nap.factionB : nap.factionA;
    await writeAudit(connection, factionId, req.user.id, 'nap.end', napId, {
      status: 'rejected',
      otherFactionId,
    });
    return { ...nap, status: 'rejected' };
  });
  if (endedNap.status === 'broken') {
    await notifyNapBroken(endedNap, 'manual');
  } else {
    await notifyFactionNapUpdate(
      endedNap.factionA,
      endedNap.factionB,
      endedNap.status === 'active'
        ? 'One faction approved NAP termination; approval from the other faction is still required.'
        : 'NAP request closed.',
    );
  }
  res.json({
    success: true,
    status: endedNap.status,
    breakAApproved: Boolean(Number(endedNap.breakAApproved)),
    breakBApproved: Boolean(Number(endedNap.breakBApproved)),
  });
});

function readAllianceMultipart(req) {
  return new Promise((resolve, reject) => {
    let parser;
    try {
      parser = Busboy({
        headers: req.headers,
        limits: {
          files: 2,
          fields: 6,
          fileSize: 8 * 1024 * 1024,
          fieldSize: 4096,
        },
      });
    } catch {
      reject(httpError(400, 'Multipart alliance creation expected.'));
      return;
    }

    const fields = {};
    const files = {};
    let invalidFile = false;
    let tooLarge = false;
    let invalidFields = false;
    parser.on('field', (name, value, info) => {
      if (info.valueTruncated || ![
        'factionId', 'name', 'terms', 'allianceType', 'targetFactionId',
      ].includes(name) || Object.hasOwn(fields, name)) {
        invalidFields = true;
        return;
      }
      fields[name] = value;
    });
    parser.on('file', (name, stream, info) => {
      if (!['avatar', 'banner'].includes(name) || files[name]) {
        invalidFile = true;
        stream.resume();
        return;
      }
      const chunks = [];
      let size = 0;
      stream.on('limit', () => {
        tooLarge = true;
      });
      stream.on('data', (chunk) => {
        size += chunk.length;
        if (size <= 8 * 1024 * 1024) chunks.push(chunk);
      });
      stream.on('end', () => {
        if (size > 0) {
          files[name] = {
            buffer: Buffer.concat(chunks),
            mimeType: info.mimeType,
          };
        }
      });
    });
    parser.on('filesLimit', () => {
      invalidFile = true;
    });
    parser.on('fieldsLimit', () => {
      invalidFields = true;
    });
    parser.on('error', () => reject(httpError(400, 'Invalid alliance upload.')));
    parser.on('close', () => {
      if (tooLarge) {
        reject(httpError(413, 'Alliance images must be 8 MB or smaller.'));
      } else if (invalidFile || invalidFields) {
        reject(httpError(400, 'Invalid alliance upload fields or images.'));
      } else {
        resolve({
          fields,
          avatar: files.avatar,
          banner: files.banner,
        });
      }
    });
    req.pipe(parser);
  });
}

async function convertAllianceImage(file, kind) {
  failIf(
    !['image/png', 'image/webp', 'image/jpeg'].includes(file.mimeType),
    400,
    'Alliance images must be PNG, WebP, or JPG.',
  );
  let metadata;
  try {
    metadata = await sharp(file.buffer, {
      limitInputPixels: 16 * 1024 * 1024,
    }).metadata();
  } catch {
    throw httpError(400, 'Failed to read alliance image.');
  }
  failIf(
    !['png', 'webp', 'jpeg'].includes(metadata.format)
    || !metadata.width || !metadata.height
    || metadata.width > 4096 || metadata.height > 4096,
    400,
    'Alliance image size or format is not supported.',
  );
  const dimensions = kind === 'avatar'
    ? { width: 512, height: 512 }
    : { width: 1600, height: 480 };
  return sharp(file.buffer, { limitInputPixels: 16 * 1024 * 1024 })
    .rotate()
    .resize(dimensions.width, dimensions.height, { fit: 'cover' })
    .webp({ quality: 90 })
    .toBuffer();
}

function readTemplateMultipart(req) {
  return new Promise((resolve, reject) => {
    let parser;
    try {
      parser = Busboy({
        headers: req.headers,
        limits: { files: 1, fields: 4, fileSize: 8 * 1024 * 1024 },
      });
    } catch {
      reject(httpError(400, 'Multipart template upload expected.'));
      return;
    }
    const fields = {};
    let image = null;
    let fileSeen = false;
    let tooLarge = false;
    let invalidFile = false;
    parser.on('field', (name, value) => {
      if (['canvasId', 'x', 'y'].includes(name)) fields[name] = value;
    });
    parser.on('file', (name, stream, info) => {
      if (name !== 'image' || fileSeen) {
        invalidFile = true;
        stream.resume();
        return;
      }
      fileSeen = true;
      const chunks = [];
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('limit', () => {
        tooLarge = true;
      });
      stream.on('end', () => {
        image = { buffer: Buffer.concat(chunks), mimeType: info.mimeType };
      });
    });
    parser.on('error', reject);
    parser.on('close', () => {
      if (tooLarge) {
        reject(httpError(413, 'Template size must not exceed 8 MB.'));
      } else if (invalidFile || !image) {
        reject(httpError(400, 'Please upload a single image file in the image field.'));
      } else {
        resolve({ fields, image });
      }
    });
    req.pipe(parser);
  });
}

async function convertTemplateImage(file) {
  failIf(!['image/png', 'image/webp', 'image/jpeg'].includes(file.mimeType), 400, 'Template must be in PNG, WebP, or JPG format.');
  let metadata;
  try {
    metadata = await sharp(file.buffer, { limitInputPixels: 16 * 1024 * 1024 }).metadata();
  } catch {
    throw httpError(400, 'Failed to read template image.');
  }
  failIf(!['png', 'webp', 'jpeg'].includes(metadata.format)
    || !metadata.width || !metadata.height
    || metadata.width > 4096 || metadata.height > 4096,
  400, 'Template image size or format is not supported.');
  const buffer = await sharp(file.buffer, { limitInputPixels: 16 * 1024 * 1024 })
    .rotate()
    .webp({ quality: 92 })
    .toBuffer();
  return { buffer, mimeType: 'image/webp' };
}

router.post('/template', async (req, res) => {
  req.tickRateLimiter?.(3000);
  const upload = await readTemplateMultipart(req);
  const canvasId = parseCanvasId(upload.fields.canvasId);
  const x = parseOptionalInt(upload.fields.x, 'x', -10000000, 10000000);
  const y = parseOptionalInt(upload.fields.y, 'y', -10000000, 10000000);
  const template = await convertTemplateImage(upload.image);
  const memberRows = await pool.query(
    'SELECT fid FROM UserFactions WHERE uid = ? ORDER BY joined LIMIT 1',
    [req.user.id],
  );
  failIf(!memberRows.length, 403, 'You are not a member of any faction.');
  const factionId = upload.fields.factionId
    ? parseId(upload.fields.factionId, 'factionId')
    : memberRows[0].fid;
  let savedPath = null;
  try {
    await transaction(async (connection) => {
      const membership = await requireMembership(req.user.id, factionId, connection);
      requirePermission(membership, 'manageTemplates');
      await connection.query('SELECT id FROM Factions WHERE id = ? FOR UPDATE', [factionId]);
      await mkdir(FACTION_TEMPLATES_DIR, { recursive: true });
      const fileName = 'template-' + factionId + '-' + randomUUID() + '.webp';
      savedPath = path.join(FACTION_TEMPLATES_DIR, fileName);
      await writeFile(savedPath, template.buffer, { flag: 'wx' });
      await connection.query(
        'UPDATE FactionTemplates SET isActive = 0 WHERE factionId = ? AND isActive = 1',
        [factionId],
      );
      await connection.query(
        'UPDATE FactionConfigs SET isActive = 0 WHERE factionId = ? AND isActive = 1',
        [factionId],
      );
      const inserted = await connection.query(
        'INSERT INTO FactionTemplates (factionId, fileName, mimeType, canvasId, x, y, isActive) '
        + 'VALUES (?, ?, ?, ?, ?, ?, 1)',
        [factionId, fileName, template.mimeType, canvasId, x, y],
      );
      const templateUrl = '/api/factions/templates/image?factionId=' + factionId + '&templateId=' + inserted.insertId;
      await connection.query(
        'INSERT INTO FactionConfigs (factionId, templateUrl, canvasId, x, y, color, extra, isActive) '
        + 'SELECT id, ?, ?, ?, ?, color, ?, 1 FROM Factions WHERE id = ?',
        [templateUrl, canvasId, x, y, JSON.stringify({ templateId: inserted.insertId }), factionId],
      );
      await writeAudit(connection, factionId, req.user.id, 'template.upload', inserted.insertId, { canvasId, x, y });
    });
  } catch (error) {
    await removeFileQuietly(savedPath);
    throw error;
  }
  await updateFactionTerritory(factionId);
  res.json({ success: true });
});

router.delete('/template', async (req, res) => {
  req.tickRateLimiter?.(2000);
  const memberRows = await pool.query(
    'SELECT fid FROM UserFactions WHERE uid = ? ORDER BY joined LIMIT 1',
    [req.user.id],
  );
  failIf(!memberRows.length, 403, 'You are not a member of any faction.');
  const factionId = memberRows[0].fid;
  await transaction(async (connection) => {
    const membership = await requireMembership(req.user.id, factionId, connection);
    requirePermission(membership, 'manageTemplates');
    await connection.query('SELECT id FROM Factions WHERE id = ? FOR UPDATE', [factionId]);
    const activeNaps = await connection.query(
      'SELECT id FROM FactionNaps WHERE status = \'active\' '
      + 'AND (factionA = ? OR factionB = ?) LIMIT 1 FOR UPDATE',
      [factionId, factionId],
    );
    failIf(activeNaps.length, 409, 'Cannot deactivate template while a NAP is active.');
    await connection.query(
      'UPDATE FactionTemplates SET isActive = 0 WHERE factionId = ? AND isActive = 1',
      [factionId],
    );
    await connection.query(
      'UPDATE FactionConfigs SET isActive = 0 WHERE factionId = ? AND isActive = 1',
      [factionId],
    );
    await writeAudit(connection, factionId, req.user.id, 'template.remove');
  });
  await updateFactionTerritory(factionId);
  res.json({ success: true });
});

router.get('/templates/image', async (req, res) => {
  req.tickRateLimiter?.(1000);
  const factionId = parseId(req.query.factionId, 'factionId');
  const templateId = parseId(req.query.templateId, 'templateId');
  await getFactionForRequest(req, factionId);
  const rows = await pool.query(
    'SELECT fileName, mimeType FROM FactionTemplates WHERE id = ? AND factionId = ?',
    [templateId, factionId],
  );
  failIf(!rows.length, 404, 'Template not found.');
  const fileName = path.basename(rows[0].fileName);
  const image = await readFile(path.join(FACTION_TEMPLATES_DIR, fileName));
  res.set({
    'Content-Type': rows[0].mimeType,
    'Cache-Control': 'private, max-age=60',
    'X-Content-Type-Options': 'nosniff',
  });
  res.send(image);
});

router.use((req, res) => {
  res.status(404).json({ error: 'Faction endpoint not found.' });
});

router.use((error, req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }
  if (error.code === 'ER_DUP_ENTRY') {
    res.status(409).json({ error: 'This entry already exists.' });
    return;
  }
  if (!error.status) {
    console.error('Faction API error:', error);
  }
  res.status(error.status || 500).json({
    error: error.status ? error.message : 'Internal faction system error.',
  });
});

export default router;
