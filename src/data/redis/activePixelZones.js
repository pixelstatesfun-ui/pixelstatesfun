import client from './client.js';
import { TILE_SIZE } from '../../core/constants.js';

const BUCKET_MS = 30_000;
const BUCKET_TTL_SECONDS = 120;
const VISIBLE_BUCKETS = 3;
const MIN_ZONE_PIXELS = 1;
export const ACTIVITY_CELL_SIZE = 32;
const ACTIVITY_REGION_CELLS = 4;
const MAX_ACTIVE_ZONE_CLUSTERS = 500;
const MIN_ACTIVITY_SPREAD = 96;

function getBucketKey(canvasId, bucket) {
  return `activity:${canvasId}:${bucket}`;
}

export async function recordPixelActivity(canvasId, pixels) {
  if (!pixels.length) return;

  const counts = new Map();
  pixels.forEach(([chunkX, chunkY, offset]) => {
    const pixelX = chunkX * TILE_SIZE + (offset % TILE_SIZE);
    const pixelY = chunkY * TILE_SIZE + Math.floor(offset / TILE_SIZE);
    const cellX = Math.floor(pixelX / ACTIVITY_CELL_SIZE);
    const cellY = Math.floor(pixelY / ACTIVITY_CELL_SIZE);
    const regionX = Math.floor(cellX / ACTIVITY_REGION_CELLS);
    const regionY = Math.floor(cellY / ACTIVITY_REGION_CELLS);
    const field = `${regionX}:${regionY}:${cellX}:${cellY}`;
    counts.set(field, (counts.get(field) || 0) + 1);
  });

  const bucket = Math.floor(Date.now() / BUCKET_MS);
  const key = getBucketKey(canvasId, bucket);
  const transaction = client.multi();
  counts.forEach((count, field) => {
    transaction.hIncrBy(key, field, count);
  });
  transaction.expire(key, BUCKET_TTL_SECONDS);
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

  const activeRegions = new Map();
  regions.forEach((region, regionKey) => {
    const cells = Array.from(region, ([field, count]) => {
      const [cellX, cellY] = field.split(':').map(Number);
      return { cellX, cellY, count };
    });
    const hasSpread = cells.some((cell, index) => (
      cells.slice(index + 1).some((other) => (
        Math.hypot(
          (cell.cellX - other.cellX) * ACTIVITY_CELL_SIZE,
          (cell.cellY - other.cellY) * ACTIVITY_CELL_SIZE,
        ) >= MIN_ACTIVITY_SPREAD
      ))
    ));
    if (!hasSpread) return;

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
    for (let index = 0; index < queue.length; index += 1) {
      const region = queue[index];
      count += region.count;
      weightedX += region.weightedX;
      weightedY += region.weightedY;
      minCellX = Math.min(minCellX, region.minCellX);
      minCellY = Math.min(minCellY, region.minCellY);
      maxCellX = Math.max(maxCellX, region.maxCellX);
      maxCellY = Math.max(maxCellY, region.maxCellY);

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
