/*
 * Populate minimap (canvas 11) from ocean tiles, scaled down 2048 -> 256.
 * Safe: does not touch other canvas data. Backs up existing keys.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from 'redis';
import sharp from 'sharp';
import { REDIS_URL } from '../../src/core/config.js';

const CANVAS_ID = 11;
const CANVAS_SIZE = 8192;
const CHUNK_SIZE = 256;
const SOURCE_TILE_SIZE = 2048;
const SOURCE_TILES_PER_AXIS = 32;
const CHUNKS_PER_AXIS = CANVAS_SIZE / CHUNK_SIZE;

const TILE_FOLDER = path.join(
  path.dirname(fileURLToPath(import.meta.url)), 'ocean',
);
const BACKUP_DIR = '/root/minimap-backup';

const redisClient = createClient({ url: REDIS_URL });
redisClient.on('error', (error) => {
  console.error(`Minimap Redis error: ${error.message}`);
});

async function scanKeys(pattern) {
  const keys = [];
  for await (const key of redisClient.scanIterator({ MATCH: pattern, COUNT: 100 })) {
    keys.push(key);
  }
  return keys;
}

async function backupExistingKeys() {
  const existing = await scanKeys(`ch:${CANVAS_ID}:*`);
  if (existing.length === 0) {
    console.log(`No existing ch:${CANVAS_ID}:* keys - no backup needed.`);
    return 0;
  }

  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(BACKUP_DIR, `backup-${timestamp}.json`);
  const backup = {};

  console.log(`Found ${existing.length} existing keys. Creating backup...`);
  for (const key of existing) {
    const buf = await redisClient.get(
      redisClient.commandOptions({ returnBuffers: true }),
      key,
    );
    if (buf) {
      backup[key] = buf.toString('base64');
    }
  }

  fs.writeFileSync(backupPath, JSON.stringify(backup));
  console.log(`Backup saved: ${backupPath} (${Object.keys(backup).length} keys)`);
  return existing.length;
}

async function drawMinimap() {
  await redisClient.connect();
  try {
    const existingCount = await backupExistingKeys();
    if (existingCount > 0) {
      console.log(`WARNING: ${existingCount} existing ch:${CANVAS_ID}:* keys will be UPDATED.`);
      console.log('Existing non-zero pixels will be preserved.');
    }

    let chunksWritten = 0;
    let chunksSkipped = 0;
    let chunksMissing = 0;

    for (let tx = 0; tx < SOURCE_TILES_PER_AXIS; tx += 1) {
      for (let ty = 0; ty < SOURCE_TILES_PER_AXIS; ty += 1) {
        const filename = path.join(TILE_FOLDER, String(tx), `${ty}.png`);
        if (!fs.existsSync(filename)) {
          chunksMissing += 1;
          continue;
        }

        const { data, info } = await sharp(filename)
          .resize(CHUNK_SIZE, CHUNK_SIZE, { kernel: 'nearest' })
          .removeAlpha()
          .greyscale()
          .threshold(128)
          .linear(-1 / 255, 1)
          .raw()
          .toBuffer({ resolveWithObject: true });

        if (info.width !== CHUNK_SIZE || info.height !== CHUNK_SIZE) {
          console.warn(`Wrong dimensions: ${filename}`);
          continue;
        }

        if (!data.includes(1)) {
          chunksSkipped += 1;
          continue;
        }

        const cx = tx;
        const cy = ty;
        const key = `ch:${CANVAS_ID}:${cx}:${cy}`;

        const chunk = Buffer.from(data);
        const existing = await redisClient.get(
          redisClient.commandOptions({ returnBuffers: true }),
          key,
        );

        if (existing && Buffer.isBuffer(existing) && existing.length === chunk.length) {
          for (let i = 0; i < existing.length; i += 1) {
            if (existing[i] !== 0) {
              chunk[i] = existing[i];
            }
          }
        }

        await redisClient.set(key, chunk);
        chunksWritten += 1;
      }
      console.log(`Column ${tx + 1}/${SOURCE_TILES_PER_AXIS} done`);
    }

    console.log(`\nDone! Written: ${chunksWritten}, Skipped (empty): ${chunksSkipped}, Missing source: ${chunksMissing}`);
  } finally {
    await redisClient.quit();
  }
}

drawMinimap().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});