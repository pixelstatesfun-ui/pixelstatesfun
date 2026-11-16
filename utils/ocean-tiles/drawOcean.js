/*
 * Restore the default land mask on the world canvas from Ocean Tiles.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from 'redis';
import sharp from 'sharp';
import { REDIS_URL } from '../../src/core/config.js';

const CANVAS_ID = 0;
const CANVAS_SIZE = 65536;
const CHUNK_SIZE = 256;
const SOURCE_TILE_SIZE = 2048;
const CHUNKS_PER_SOURCE_TILE = SOURCE_TILE_SIZE / CHUNK_SIZE;
const TILES_PER_AXIS = CANVAS_SIZE / SOURCE_TILE_SIZE;
const TILE_FOLDER = path.join(
  path.dirname(fileURLToPath(import.meta.url)), 'ocean',
);
const redisClient = createClient({ url: REDIS_URL });
redisClient.on('error', (error) => {
  console.error(`Ocean map Redis error: ${error.message}`);
});

function validateSourceTiles() {
  for (let tx = 0; tx < TILES_PER_AXIS; tx += 1) {
    for (let ty = 0; ty < TILES_PER_AXIS; ty += 1) {
      const filename = path.join(TILE_FOLDER, String(tx), `${ty}.png`);
      if (!fs.existsSync(filename)) {
        throw new Error(`Ocean map tile is missing: ${filename}`);
      }
    }
  }
}

async function applyMask(tx, ty, filename) {
  const { data, info } = await sharp(filename)
    .removeAlpha()
    .greyscale()
    .threshold(128)
    .linear(-1 / 255, 1)
    .raw()
    .toBuffer({ resolveWithObject: true });

  if (info.width !== SOURCE_TILE_SIZE
    || info.height !== SOURCE_TILE_SIZE
    || info.channels !== 1
  ) {
    throw new Error(`Unexpected ocean mask dimensions: ${filename}`);
  }

  const writes = [];
  for (let chunkY = 0; chunkY < CHUNKS_PER_SOURCE_TILE; chunkY += 1) {
    for (let chunkX = 0; chunkX < CHUNKS_PER_SOURCE_TILE; chunkX += 1) {
      const chunk = Buffer.alloc(CHUNK_SIZE * CHUNK_SIZE);
      for (let row = 0; row < CHUNK_SIZE; row += 1) {
        const sourceStart = (
          (chunkY * CHUNK_SIZE + row) * SOURCE_TILE_SIZE
        ) + (chunkX * CHUNK_SIZE);
        const targetStart = row * CHUNK_SIZE;
        data.copy(chunk, targetStart, sourceStart, sourceStart + CHUNK_SIZE);
      }

      if (!chunk.includes(1)) {
        continue;
      }

      const cx = tx * CHUNKS_PER_SOURCE_TILE + chunkX;
      const cy = ty * CHUNKS_PER_SOURCE_TILE + chunkY;
      const key = `ch:${CANVAS_ID}:${cx}:${cy}`;
      writes.push((async () => {
        const existing = await redisClient.get(
          redisClient.commandOptions({ returnBuffers: true }),
          key,
        );
        if (existing && Buffer.isBuffer(existing)) {
          for (let i = 0; i < existing.length; i += 1) {
            if (existing[i] !== 0) {
              chunk[i] = existing[i];
            }
          }
        }
        await redisClient.set(key, chunk);
      })());
    }
  }

  await Promise.all(writes);
  return writes.length;
}

async function restoreLandMask() {
  validateSourceTiles();
  await redisClient.connect();

  try {
    let chunksWritten = 0;
    for (let ty = 0; ty < TILES_PER_AXIS; ty += 1) {
      for (let tx = 0; tx < TILES_PER_AXIS; tx += 1) {
        const filename = path.join(TILE_FOLDER, String(tx), `${ty}.png`);
        // Process one source tile at a time to bound memory usage.
        // eslint-disable-next-line no-await-in-loop
        chunksWritten += await applyMask(tx, ty, filename);
      }
      console.info(
        `Restored world land map row ${ty + 1}/${TILES_PER_AXIS}; `
        + `${chunksWritten} chunks written.`,
      );
    }
    console.info(
      `World land map restored: ${chunksWritten} chunks.`,
    );
  } finally {
    await redisClient.quit();
  }
}

restoreLandMask().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
