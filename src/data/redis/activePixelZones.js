import client from './client.js';
import { TILE_SIZE } from '../../core/constants.js';

// Longer fire duration: 10 x 60s buckets = 10 minutes visible (12m TTL)
const BUCKET_MS = 60_000;
const BUCKET_TTL_SECONDS = 720;
const VISIBLE_BUCKETS = 10;

// Easier fire activation: lower spread threshold & compact single-cell trigger
const MIN_ZONE_PIXELS = 1;
const MIN_SINGLE_CELL_PIXELS = 4;
const MIN_USERS_FOR_INSTANT_FIRE = 2;
export const ACTIVITY_CELL_SIZE = 32;
const ACTIVITY_REGION_CELLS = 4;
const MAX_ACTIVE_ZONE_CLUSTERS = 500;
const MIN_ACTIVITY_SPREAD = 32;

function getBucketKey(canvasId, bucket) {
  return `activity:${canvasId}:${bucket}`;
}

function getBucketRegionUsersKey(canvasId, bucket, regionKey) {
  return `activity:${canvasId}:${bucket}:users:${regionKey}`;
}

export async function recordPixelActivity(canvasId, pixels, actorId = null) {
  if (!pixels.length) return;

  const counts = new Map();
  const touchedRegions = new Set();
  pixels.forEach(([chunkX, chunkY, offset]) => {
    const pixelX = chunkX * TILE_SIZE + (offset % TILE_SIZE);
    const pixelY = chunkY * TILE_SIZE + Math.floor(offset / TILE_SIZE);
    const cellX = Math.floor(pixelX / ACTIVITY_CELL_SIZE);
    const cellY = Math.floor(pixelY / ACTIVITY_CELL_SIZE);
    const regionX = Math.floor(cellX / ACTIVITY_REGION_CELLS);
    const regionY = Math.floor(cellY / ACTIVITY_REGION_CELLS);
    const regionKey = `${regionX}:${regionY}`;
    const field = `${regionX}:${regionY}:${cellX}:${cellY}`;
    counts.set(field, (counts.get(field) || 0) + 1);
    touchedRegions.add(regionKey);
  });

  const bucket = Math.floor(Date.now() / BUCKET_MS);
  const key = getBucketKey(canvasId, bucket);
  const transaction = client.multi();
  counts.forEach((count, field) => {
    transaction.hIncrBy(key, field, count);
  });
  transaction.expire(key, BUCKET_TTL_SECONDS);

  if (actorId !== null && actorId !== undefined && String(actorId).length > 0) {
    const actorValue = String(actorId);
    touchedRegions.forEach((regionKey) => {
      const usersKey = getBucketRegionUsersKey(canvasId, bucket, regionKey);
      transaction.sAdd(usersKey, actorValue);
      transaction.expire(usersKey, BUCKET_TTL_SECONDS);
    });
  }

  await transaction.exec();
}

export async function getActivePixelZones(canvasId) {
  const currentBucket = Math.floor(Date.now() / BUCKET_MS);
  const buckets = Array.from(
    { length: VISIBLE_BUCKETS },
    (_, index) => currentBucket - index,
  );
  const keys = buckets.map((bucket) => getBucketKey(canvasId, bucket));
  const hashes = await Promise.all(keys.map((key) => client.hGetAll(key)));
  const regions = new Map();

  hashes.forEach((hash) => {
    Object.entries(hash).forEach(([field, value]) => {
      const count = Number(value);
      if (!Number.isSafeInteger(count) || count <= 0) return;
      const [regionX, regionY, cellX, cellY] = field.split(':').map(Number);
      if (![regionX, regionY, cellX, cellY].every(Number.isSafeInteger)) {
        return;
      }
      const regionKey = `${regionX}:${regionY}`;
      const region = regions.get(regionKey) || new Map();
      const cellKey = `${cellX}:${cellY}`;
      region.set(cellKey, (region.get(cellKey) || 0) + count);
      regions.set(regionKey, region);
    });
  });

  const regionKeys = Array.from(regions.keys());
  const regionUsersMap = new Map();
  if (regionKeys.length > 0) {
    const userSets = await Promise.all(
      regionKeys.map(async (regionKey) => {
        const memberLists = await Promise.all(
          buckets.map((bucket) => client.sMembers(
            getBucketRegionUsersKey(canvasId, bucket, regionKey),
          )),
        );
        const uniqueUsers = new Set();
        memberLists.forEach((members) => {
          if (Array.isArray(members)) {
            members.forEach((member) => uniqueUsers.add(member));
          }
        });
        return [regionKey, uniqueUsers];
      }),
    );
    userSets.forEach(([regionKey, uniqueUsers]) => {
      regionUsersMap.set(regionKey, uniqueUsers);
    });
  }

  const activeRegions = new Map();
  regions.forEach((region, regionKey) => {
    const cells = Array.from(region, ([field, count]) => {
      const [cellX, cellY] = field.split(':').map(Number);
      return { cellX, cellY, count };
    });
    const users = regionUsersMap.get(regionKey) || new Set();
    const totalRegionPixels = cells.reduce((sum, cell) => sum + cell.count, 0);
    const hasSpread = cells.some((cell, index) => (
      cells.slice(index + 1).some((other) => (
        Math.hypot(
          (cell.cellX - other.cellX) * ACTIVITY_CELL_SIZE,
          (cell.cellY - other.cellY) * ACTIVITY_CELL_SIZE,
        ) >= MIN_ACTIVITY_SPREAD
      ))
    ));
    const meetsEasyTrigger = hasSpread
      || totalRegionPixels >= MIN_SINGLE_CELL_PIXELS
      || users.size >= MIN_USERS_FOR_INSTANT_FIRE;
    if (!meetsEasyTrigger) return;

    let count = 0;
    let weightedX = 0;
    let weightedY = 0;
    let minCellX = Infinity;
    let minCellY = Infinity;
    let maxCellX = -Infinity;
    let maxCellY = -Infinity;
    cells.forEach((cell) => {
      if (cell.count < MIN_ZONE_PIXELS) return;
      count += cell.count;
      weightedX += (cell.cellX + 0.5) * cell.count;
      weightedY += (cell.cellY + 0.5) * cell.count;
      minCellX = Math.min(minCellX, cell.cellX);
      minCellY = Math.min(minCellY, cell.cellY);
      maxCellX = Math.max(maxCellX, cell.cellX);
      maxCellY = Math.max(maxCellY, cell.cellY);
    });
    if (count) {
      activeRegions.set(regionKey, {
        regionX: Number(regionKey.split(':')[0]),
        regionY: Number(regionKey.split(':')[1]),
        count,
        users,
        weightedX,
        weightedY,
        minCellX,
        minCellY,
        maxCellX,
        maxCellY,
      });
    }
  });

  const zones = [];
  const visited = new Set();
  activeRegions.forEach((firstRegion, firstKey) => {
    if (visited.has(firstKey)) return;
    visited.add(firstKey);
    const queue = [firstRegion];
    let count = 0;
    let weightedX = 0;
    let weightedY = 0;
    let minCellX = Infinity;
    let minCellY = Infinity;
    let maxCellX = -Infinity;
    let maxCellY = -Infinity;
    const zoneUsers = new Set();
    for (let index = 0; index < queue.length; index += 1) {
      const region = queue[index];
      count += region.count;
      weightedX += region.weightedX;
      weightedY += region.weightedY;
      minCellX = Math.min(minCellX, region.minCellX);
      minCellY = Math.min(minCellY, region.minCellY);
      maxCellX = Math.max(maxCellX, region.maxCellX);
      maxCellY = Math.max(maxCellY, region.maxCellY);
      region.users.forEach((member) => zoneUsers.add(member));

      for (let dx = -1; dx <= 1; dx += 1) {
        for (let dy = -1; dy <= 1; dy += 1) {
          if (!dx && !dy) continue;
          const neighborKey = `${region.regionX + dx}:${region.regionY + dy}`;
          const neighbor = activeRegions.get(neighborKey);
          if (neighbor && !visited.has(neighborKey)) {
            visited.add(neighborKey);
            queue.push(neighbor);
          }
        }
      }
    }
    zones.push({
      cellX: (weightedX / count) - 0.5,
      cellY: (weightedY / count) - 0.5,
      count,
      users: Math.max(1, zoneUsers.size),
      minCellX,
      minCellY,
      maxCellX,
      maxCellY,
    });
  });

  return zones
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_ACTIVE_ZONE_CLUSTERS);
}
