import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import { createReadStream } from 'fs';
import {
  mkdtemp, rm, stat, writeFile,
} from 'fs/promises';
import os from 'os';
import path from 'path';
import { pipeline } from 'stream/promises';
import sharp from 'sharp';

import canvases from '../../core/canvases.js';
import { BACKUP_URL } from '../../core/config.js';
import redis from '../../data/redis/client.js';
import { getUserRanks } from '../../data/redis/ranks.js';
import { getIIDofIP } from '../../data/sql/IP.js';
import { fetchTimesOfDay } from '../history.js';

const MINIMUM_PIXELS = 300000;
const MAX_DAYS = 7;
const MAX_FRAMES = 100;
const MAX_TILE_BYTES = 1024 * 1024;
const MAX_VIDEO_BYTES = 20 * 1024 * 1024;
const JOB_TIMEOUT_MS = 120000;
const USER_COOLDOWN_SECONDS = 900;
const GLOBAL_LOCK_SECONDS = 180;
const GLOBAL_LOCK_KEY = 'timelapse:global-lock';

function parseDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime())
    || date.toISOString().slice(0, 10) !== value ? null : date;
}

function parseInteger(value) {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) ? value : null;
  }
  if (typeof value !== 'string' || !/^-?\d+$/.test(value)) {
    return null;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function formatDate(date) {
  return date.toISOString().slice(0, 10).replace(/-/g, '');
}

function canvasSizeOnDate(canvas, day) {
  let size = canvas.size;
  if (Array.isArray(canvas.historicalSizes)) {
    for (const [effectiveDate, historicalSize] of canvas.historicalSizes) {
      if (day <= effectiveDate) {
        size = historicalSize;
      }
    }
  }
  return size;
}

async function fetchTile(url, signal) {
  const response = await fetch(url, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]),
  });
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`Backup returned HTTP ${response.status}`);
  }
  const contentLength = Number(response.headers.get('content-length'));
  if (contentLength > MAX_TILE_BYTES) {
    throw new Error('Backup tile exceeds the size limit');
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length || buffer.length > MAX_TILE_BYTES) {
    throw new Error('Backup tile has an invalid size');
  }
  return buffer;
}

async function getFrameTiles({
  day, canvasId, size, x, y, width, height, snapshot, signal,
}) {
  const offset = -Math.floor(size / 2);
  const firstTileX = Math.floor((x - offset) / 256);
  const lastTileX = Math.floor((x + width - 1 - offset) / 256);
  const firstTileY = Math.floor((y - offset) / 256);
  const lastTileY = Math.floor((y + height - 1 - offset) / 256);
  const base = BACKUP_URL.replace(/\/+$/, '');
  const dayPath = `${base}/${day.slice(0, 4)}/${day.slice(4, 6)}`
    + `/${day.slice(6)}/${canvasId}/${snapshot}`;
  const tiles = [];

  for (let tileY = firstTileY; tileY <= lastTileY; tileY += 1) {
    for (let tileX = firstTileX; tileX <= lastTileX; tileX += 1) {
      const tileUrl = `${dayPath}/${tileX}/${tileY}.png`;
      // Sequential requests cap upstream work to one job at a time.
      // eslint-disable-next-line no-await-in-loop
      const buffer = await fetchTile(tileUrl, signal);
      if (!buffer) {
        continue;
      }
      const tileLeft = tileX * 256 + offset;
      const tileTop = tileY * 256 + offset;
      const left = Math.max(0, tileLeft - x);
      const top = Math.max(0, tileTop - y);
      const sourceLeft = Math.max(0, x - tileLeft);
      const sourceTop = Math.max(0, y - tileTop);
      const cropWidth = Math.min(256 - sourceLeft, width - left);
      const cropHeight = Math.min(256 - sourceTop, height - top);
      if (cropWidth <= 0 || cropHeight <= 0) {
        continue;
      }
      // Tiles are cropped serially to keep memory and CPU usage bounded.
      // eslint-disable-next-line no-await-in-loop
      const image = await sharp(buffer)
        .extract({
          left: sourceLeft,
          top: sourceTop,
          width: cropWidth,
          height: cropHeight,
        })
        .png()
        .toBuffer();
      tiles.push({ input: image, left, top });
    }
  }
  return tiles;
}

function encodeVideo(tempDirectory, fps, frameCount, signal, onProgress) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      const error = new Error('Timelapse generation was aborted');
      error.name = 'AbortError';
      reject(error);
      return;
    }
    const outputPath = path.join(tempDirectory, 'timelapse.mp4');
    const process = spawn('ffmpeg', [
      '-nostdin', '-hide_banner', '-loglevel', 'error', '-nostats',
      '-progress', 'pipe:1', '-y',
      '-framerate', String(fps),
      '-start_number', '0',
      '-i', path.join(tempDirectory, 'frame%04d.png'),
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '26',
      '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
      '-vf', 'scale=512:-2:flags=fast_bilinear',
      outputPath,
    ], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    let stdout = '';
    process.stdout.setEncoding('utf8');
    process.stdout.on('data', (chunk) => {
      stdout += chunk;
      const lines = stdout.split('\n');
      stdout = lines.pop();
      lines.forEach((line) => {
        const match = line.match(/^frame=(\d+)$/);
        if (match) {
          onProgress(Number(match[1]), frameCount);
        }
      });
    });
    process.stderr.setEncoding('utf8');
    process.stderr.on('data', (chunk) => {
      stderr = `${stderr}${chunk}`.slice(-3000);
    });
    const abort = () => process.kill();
    signal.addEventListener('abort', abort, { once: true });
    process.once('error', (error) => {
      signal.removeEventListener('abort', abort);
      reject(error);
    });
    process.once('close', (code) => {
      signal.removeEventListener('abort', abort);
      if (code === 0) {
        resolve(outputPath);
      } else {
        const error = new Error(
          signal.aborted
            ? 'Timelapse generation was aborted'
            : `ffmpeg exited with code ${code}: ${stderr}`,
        );
        if (signal.aborted) {
          error.name = 'AbortError';
        }
        reject(error);
      }
    });
  });
}

export default async function createTimelapse(req, res) {
  req.tickRateLimiter(10000);
  const { t } = req.ttag;
  const userId = req.user?.id;
  const progressId = req.body?.progressId;
  if (typeof progressId !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(progressId)
  ) {
    res.status(400).json({ errors: [t`Invalid timelapse request`] });
    return;
  }
  const progressKey = `timelapse:progress:${progressId}`;
  const updateProgress = (percent, stage) => redis.set(
    progressKey,
    JSON.stringify({ userId, percent, stage }),
    { EX: 300 },
  );
  if (!userId) {
    res.status(401).json({ errors: [t`You must be logged in`] });
    return;
  }
  if (!BACKUP_URL) {
    res.status(503).json({ errors: [t`Timelapses are not available`] });
    return;
  }

  const body = req.body || {};
  const canvasId = typeof body.canvasId === 'string' ? body.canvasId : '';
  const canvas = /^\d+$/.test(canvasId) ? canvases[canvasId] : null;
  const startDate = parseDate(body.startDate);
  const endDate = parseDate(body.endDate);
  const x = parseInteger(body.x);
  const y = parseInteger(body.y);
  const endX = parseInteger(body.endX);
  const endY = parseInteger(body.endY);
  const fps = parseInteger(body.fps);
  const frameskip = parseInteger(body.frameskip);
  if (!canvas || canvas.v || canvas.hid || canvas.ed
    || !startDate || !endDate || endDate < startDate
    || [x, y, endX, endY].includes(null)
    || fps === null || fps < 1 || fps > 30
    || frameskip === null || frameskip < 1 || frameskip > 24
  ) {
    res.status(400).json({ errors: [t`Invalid timelapse settings`] });
    return;
  }

  const width = endX - x + 1;
  const height = endY - y + 1;
  const dayCount = Math.round((endDate - startDate) / 86400000) + 1;
  const halfSize = Math.floor(canvas.size / 2);
  if (dayCount > MAX_DAYS || width < 1 || height < 1
    || x < -halfSize || y < -halfSize
    || endX >= halfSize || endY >= halfSize
  ) {
    res.status(400).json({
      errors: [t`The date range or selected area exceeds the timelapse limits`],
    });
    return;
  }

  try {
    const [totalPixels] = await getUserRanks(userId);
    if (totalPixels < MINIMUM_PIXELS) {
      res.status(403).json({
        errors: [t`Timelapses unlock after placing 300,000 pixels`],
      });
      return;
    }

    const iid = await getIIDofIP(req.ip.ipString);
    if (!iid) {
      throw new Error('Could not get IID for timelapse cooldown');
    }
    const cooldownKey = `timelapse:cooldown:${iid}`;
    const cooldownTtl = await redis.ttl(cooldownKey);
    if (cooldownTtl > 0 || cooldownTtl === -1) {
      if (cooldownTtl > USER_COOLDOWN_SECONDS || cooldownTtl === -1) {
        await redis.expire(cooldownKey, USER_COOLDOWN_SECONDS);
      }
      res.status(429).json({
        errors: [t`Please wait before creating another timelapse`],
      });
      return;
    }

    const lockToken = randomUUID();
    const lockSet = await redis.set(GLOBAL_LOCK_KEY, lockToken, {
      NX: true,
      EX: GLOBAL_LOCK_SECONDS,
    });
    if (!lockSet) {
      res.status(429).json({
        errors: [t`Another timelapse is being created. Please try again later`],
      });
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), JOB_TIMEOUT_MS);
    let tempDirectory;
    await updateProgress(2, 'Preparing history');
    res.on('close', () => {
      if (!res.writableEnded) {
        controller.abort();
      }
    });

    try {
      tempDirectory = await mkdtemp(path.join(os.tmpdir(), 'pixel-timelapse-'));
      const days = [];
      for (let dayIndex = 0; dayIndex < dayCount; dayIndex += 1) {
        const date = new Date(startDate.getTime() + dayIndex * 86400000);
        const day = formatDate(date);
        // Days are read in order to bound backup-server concurrency.
        // eslint-disable-next-line no-await-in-loop
        const times = await fetchTimesOfDay(
          day.slice(0, 4), day.slice(4, 6), day.slice(6), canvasId, 300,
        );
        const increments = times
          .filter((time) => /^\d{4}$/.test(time) && time !== '0000')
          .sort()
          .filter((time, index) => (index + 1) % frameskip === 0);
        if (times.includes('0000')) {
          days.push({ day, increments });
        }
        // eslint-disable-next-line no-await-in-loop
        await updateProgress(
          5 + Math.round(((dayIndex + 1) / dayCount) * 10),
          'Preparing history',
        );
      }
      if (!days.length) {
        res.status(404).json({
          errors: [t`No historical backups are available for these dates`],
        });
        return;
      }
      const frameCount = days.reduce(
        (count, { increments }) => count + 1 + increments.length,
        0,
      );
      await updateProgress(20, 'Loading historical frames');
      if (frameCount > MAX_FRAMES) {
        res.status(400).json({
          errors: [
            t`Too many frames. Increase frame skip or shorten the date range`,
          ],
        });
        return;
      }

      const background = canvas.colors[0];
      if (!Array.isArray(background) || background.length < 3) {
        throw new Error(`Canvas ${canvasId} has no valid background color`);
      }
      let frameIndex = 0;
      let previousFrame = null;
      for (const { day, increments } of days) {
        const size = canvasSizeOnDate(canvas, day);
        const snapshots = ['tiles', ...increments];
        for (const snapshot of snapshots) {
          const fullSnapshot = snapshot === 'tiles';
          let baseFrame = previousFrame;
          if (fullSnapshot || !previousFrame) {
            // Each delta frame depends on the previous frame's pixels.
            // eslint-disable-next-line no-await-in-loop
            baseFrame = await sharp({
              create: {
                width,
                height,
                channels: 3,
                background: {
                  r: background[0],
                  g: background[1],
                  b: background[2],
                },
              },
            }).png().toBuffer();
          }
          // Keep only one upstream tile batch active at a time.
          // eslint-disable-next-line no-await-in-loop
          const overlays = await getFrameTiles({
            day,
            canvasId,
            size,
            x,
            y,
            width,
            height,
            snapshot,
            signal: controller.signal,
          });
          if (!fullSnapshot && !overlays.length) {
            continue;
          }
          let frame = baseFrame;
          if (overlays.length) {
            // Frames must be encoded in chronological order.
            // eslint-disable-next-line no-await-in-loop
            frame = await sharp(baseFrame)
              .composite(overlays)
              .png()
              .toBuffer();
          }
          const framePath = path.join(
            tempDirectory,
            `frame${String(frameIndex).padStart(4, '0')}.png`,
          );
          // eslint-disable-next-line no-await-in-loop
          await writeFile(framePath, frame);
          previousFrame = frame;
          frameIndex += 1;
          // eslint-disable-next-line no-await-in-loop
          await updateProgress(
            20 + Math.round((frameIndex / frameCount) * 60),
            'Loading historical frames',
          );
        }
      }
      if (!frameIndex) {
        throw new Error('No historical frames were available');
      }

      await updateProgress(80, 'Creating video');
      const videoPath = await encodeVideo(
        tempDirectory,
        fps,
        frameIndex,
        controller.signal,
        (encodedFrames, totalFrames) => {
          const percent = Math.min(
            95,
            80 + Math.round((encodedFrames / totalFrames) * 15),
          );
          updateProgress(percent, 'Creating video').catch((error) => {
            console.error(`Could not update timelapse progress: ${error.message}`);
          });
        },
      );
      await updateProgress(97, 'Finishing up');
      const { size: videoSize } = await stat(videoPath);
      if (videoSize > MAX_VIDEO_BYTES) {
        res.status(413).json({
          errors: [t`The generated video exceeds the 20 MB limit`],
        });
        return;
      }
      res.status(200).type('video/mp4').set({
        'Content-Disposition': 'attachment; filename="timelapse.mp4"',
        'Content-Length': String(videoSize),
        'Cache-Control': 'no-store',
      });
      await updateProgress(100, 'Completed');
      await pipeline(createReadStream(videoPath), res);
      await redis.set(cooldownKey, '1', { EX: USER_COOLDOWN_SECONDS });
    } finally {
      clearTimeout(timeout);
      if (tempDirectory) {
        try {
          await rm(tempDirectory, { recursive: true, force: true });
        } catch (error) {
          console.error(
            `Could not remove timelapse temp directory: ${error.message}`,
          );
        }
      }

      try {
        await redis.eval(
          `if redis.call('get', KEYS[1]) == ARGV[1] then `
          + `return redis.call('del', KEYS[1]) else return 0 end`,
          { keys: [GLOBAL_LOCK_KEY], arguments: [lockToken] },
        );
      } catch (error) {
        console.error(
          `Could not release timelapse lock: ${error.message}`,
        );
      }
    }
  } catch (error) {
    console.error(
      `Timelapse generation failed for user ${userId}: ${error.message}`,
    );
    if (!res.headersSent) {
      res.status(error.name === 'AbortError' ? 504 : 500).json({
        errors: [
          error.name === 'AbortError'
            ? t`Timelapse generation timed out`
            : t`Could not create the timelapse`,
        ],
      });
    }
  }
}

export async function getTimelapseProgress(req, res) {
  const { t } = req.ttag;
  req.tickRateLimiter(300);
  const progressId = req.params.id;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(progressId)) {
    res.status(400).json({ errors: [t`Invalid timelapse request`] });
    return;
  }
  const serializedProgress = await redis.get(`timelapse:progress:${progressId}`);
  if (!serializedProgress) {
    res.status(404).json({ errors: [t`Timelapse progress not found`] });
    return;
  }
  const progress = JSON.parse(serializedProgress);
  if (progress.userId !== req.user?.id) {
    res.status(404).json({ errors: [t`Timelapse progress not found`] });
    return;
  }
  res.json({
    percent: progress.percent,
    stage: progress.stage,
  });
}
