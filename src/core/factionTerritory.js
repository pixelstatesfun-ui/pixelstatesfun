/*
 * Cache for active template boundaries and NAP territory protection.
 */
import path from 'path';
import { readFile } from 'fs/promises';
import sharp from 'sharp';

import pool from '../data/sql/mariadb.js';
import redis from '../data/redis/client.js';
import socketEvents from '../socket/socketEvents.js';
import { FACTION_NAPS_ENABLED } from './config.js';
import { FACTION_TEMPLATES_DIR } from '../utils/factionFiles.js';
import { getPixelFromChunkOffset } from './utils.js';

const territoryKey = (factionId) => `faction:territory:${factionId}`;
const allActiveNapsKey = 'faction:naps:active:all:v2';
let lastKnownNaps = [];
const userFactionKey = (userId) => `faction:users:${userId}`;

export async function invalidateUserFactionCache(userId) {
  if (!userId) return;
  await redis.del(userFactionKey(userId)).catch(() => {});
  await redis.del(`faction:user:${userId}`).catch(() => {});
  // Refresh pixel attribution for already connected members.
  socketEvents.reloadUser(Number(userId), true);
}

function computeCanvasBBox(width, height, originX, originY) {
  // In template system, origin is top-left (originX, originY) and Y grows downward
  return {
    x1: originX,
    y1: originY,
    x2: originX + width - 1,
    y2: originY + height - 1,
  };
}

export async function updateFactionTerritory(factionId, connection = pool) {
  const rows = await connection.query(
    'SELECT ft.id, ft.fileName, ft.canvasId, ft.x, ft.y FROM FactionTemplates ft '
    + 'INNER JOIN FactionConfigs fc ON fc.factionId = ft.factionId AND fc.isActive = 1 '
    + 'AND fc.templateUrl = CONCAT(\'/api/factions/templates/image?factionId=\', '
    + 'ft.factionId, \'&templateId=\', ft.id) '
    + 'WHERE ft.factionId = ? AND ft.isActive = 1 ORDER BY ft.id DESC LIMIT 1',
    [factionId],
  );
  if (!rows.length) {
    await redis.del(territoryKey(factionId)).catch(() => {});
    return null;
  }

  const template = rows[0];
  const imagePath = path.join(FACTION_TEMPLATES_DIR, path.basename(template.fileName));
  const metadata = await sharp(await readFile(imagePath)).metadata();
  if (!metadata.width || !metadata.height) {
    await redis.del(territoryKey(factionId)).catch(() => {});
    return null;
  }
  const territory = {
    templateId: Number(template.id),
    canvasId: Number(template.canvasId),
    ...computeCanvasBBox(
      metadata.width,
      metadata.height,
      Number(template.x),
      Number(template.y),
    ),
  };
  await redis.set(territoryKey(factionId), JSON.stringify(territory)).catch(() => {});
  return territory;
}

export async function getFactionTerritory(factionId) {
  try {
    const cached = await redis.get(territoryKey(factionId));
    if (cached) return JSON.parse(cached);
  } catch {
    // On Redis failure, recalculate boundary from active template.
  }
  return updateFactionTerritory(factionId);
}

export async function invalidateFactionNapCache() {
  await redis.del(allActiveNapsKey).catch(() => {});
}

async function getAllActiveNaps() {
  try {
    const cached = await redis.get(allActiveNapsKey);
    if (cached) {
      lastKnownNaps = JSON.parse(cached);
      return lastKnownNaps;
    }
  } catch {
    // Database remains source of truth.
  }
  const rows = await pool.query(
    'SELECT n.id, n.factionA, n.factionB, n.startDate, n.endDate, n.territory, a.tag AS tagA, a.title AS nameA, '
    + 'b.tag AS tagB, b.title AS nameB FROM FactionNaps n '
    + 'INNER JOIN Factions a ON a.id = n.factionA '
    + 'INNER JOIN Factions b ON b.id = n.factionB '
    + 'WHERE n.status = \'active\' '
    + 'AND (n.startDate IS NULL OR n.startDate <= NOW()) '
    + 'AND (n.endDate IS NULL OR n.endDate >= NOW())',
  );
  try {
    await redis.set(allActiveNapsKey, JSON.stringify(rows), { EX: 5 });
  } catch {
    // Cache failure is non-fatal.
  }
  lastKnownNaps = rows;
  return rows;
}

async function sendNapNotice(nap, message) {
  const members = await pool.query(
    'SELECT uid FROM UserFactions WHERE fid IN (?, ?)',
    [nap.factionA, nap.factionB],
  );
  const userIds = [...new Set(members.map((row) => Number(row.uid)))];
  if (!userIds.length) return;
  socketEvents.broadcastFactionNotice(userIds, {
    factionA: Number(nap.factionA),
    factionB: Number(nap.factionB),
    message,
  });
}

export async function notifyFactionNapUpdate(factionA, factionB, message) {
  await invalidateFactionNapCache(factionA, factionB);
  try {
    const members = await pool.query(
      'SELECT uid FROM UserFactions WHERE fid IN (?, ?)',
      [factionA, factionB],
    );
    const userIds = [...new Set(members.map((row) => Number(row.uid)))];
    if (!userIds.length) return;
    socketEvents.broadcastFactionNotice(userIds, {
      factionA: Number(factionA),
      factionB: Number(factionB),
      message,
    });
  } catch (error) {
    console.error(`Could not broadcast NAP update: ${error.message}`);
  }
}

export async function notifyNapBroken(nap, reason = 'manual') {
  await invalidateFactionNapCache(nap.factionA, nap.factionB);
  const detail = reason === 'attack'
    ? `NAP between [${nap.tagA}] and [${nap.tagB}] was broken due to attack!`
    : `NAP between [${nap.tagA}] and [${nap.tagB}] was broken manually.`;
  try {
    await sendNapNotice(nap, detail);
  } catch (error) {
    console.error(`Could not broadcast broken NAP ${nap.id}: ${error.message}`);
  }
}

export async function breakNap(nap, reason = 'manual') {
  const result = await pool.query(
    'UPDATE FactionNaps SET status = \'broken\', decidedAt = NOW() '
    + 'WHERE id = ? AND status = \'active\'',
    [nap.id],
  );
  if (!result.affectedRows) return false;
  await notifyNapBroken(nap, reason);
  return true;
}

/*
 * Checks canvas coordinates directly: inversion is only applied when
 * constructing the bbox from the template.
 */
export async function checkFactionNapProtection(
  canvasId,
  placedPixels,
  canvasSize,
  is3d,
) {
  if (!FACTION_NAPS_ENABLED || !placedPixels?.length) return false;
  let naps;
  try {
    naps = await getAllActiveNaps();
  } catch (error) {
    console.error(`Could not load active NAP territories: ${error.message}`);
    naps = lastKnownNaps;
  }
  const now = Date.now();
  for (const nap of naps) {
    if ((nap.startDate && new Date(nap.startDate).getTime() > now)
      || (nap.endDate && new Date(nap.endDate).getTime() < now)) continue;
    let territory;
    try {
      territory = typeof nap.territory === 'string' ? JSON.parse(nap.territory) : nap.territory;
    } catch {
      continue;
    }
    if (!territory) continue;
    const protectedTerritories = territory.myTerritory || territory.targetTerritory
      ? [territory.myTerritory, territory.targetTerritory] : [territory];

    for (const protectedBBox of protectedTerritories) {
      if (!protectedBBox || Number(protectedBBox.canvasId) !== Number(canvasId)) continue;
      const attacked = placedPixels.some(([i, j, offset]) => {
        const [x, y] = getPixelFromChunkOffset(i, j, offset, canvasSize, is3d);
        return x >= protectedBBox.x1 && x <= protectedBBox.x2
          && y >= protectedBBox.y1 && y <= protectedBBox.y2;
      });
      if (attacked) {
        return true;
      }
    }
  }
  return false;
}
