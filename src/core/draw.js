/*
 * draw pixel on canvas by user
 */

import {
  getBrushPixels, getPixelFromChunkOffset, isIntervalActive,
} from './utils.js';
import logger, { PixelLogger } from './logger.js';
import allowPlace, { allowPlaceBrush } from '../data/redis/cooldown.js';
import {
  CANVAS_ID as VOID_CANVAS_ID, getEventActive, getEventArea,
} from '../data/redis/Event.js';
import {
  isVipBrushSizeAllowed,
} from './vip.js';
import { VIP_ENABLED } from './config.js';
import { flushPixelCache, setPixelByOffset } from './setPixel.js';
import {
  getCooldownForUser, getCooldownReserve, isZeroCooldownAllowed,
} from './CooldownManager.js';
import { getState } from './SharedState.js';
import canvases from './canvases.js';
import { setFlagOfUser } from '../data/sql/User.js';
import { recordFactionPixelPlacement } from '../data/sql/Faction.js';
import { checkFactionNapProtection } from './factionTerritory.js';
import { recordPixelActivity } from '../data/redis/activePixelZones.js';

import {
  THREE_CANVAS_HEIGHT, THREE_TILE_SIZE, TILE_SIZE, USERLVL, USER_FLAGS,
} from './constants.js';

/*
 * IPs who are currently requesting pixels
 * (have to log in order to avoid race conditions)
 */
const ipQueues = new Map();

function enqueueIP(ipString) {
  const prev = ipQueues.get(ipString) || Promise.resolve();
  let unlock;
  const next = new Promise((resolve) => { unlock = resolve; });
  ipQueues.set(ipString, next);
  return prev.then(() => unlock);
}

async function overlapsActiveVoid(canvasId, user, placedPixels) {
  if (String(canvasId) !== VOID_CANVAS_ID
    || !user || user.userlvl < USERLVL.MOD
  ) {
    return false;
  }
  const [active, eventArea] = await Promise.all([
    getEventActive(),
    getEventArea(),
  ]);
  if (!active || !eventArea) {
    return false;
  }
  const [centerI, centerJ] = eventArea;
  return placedPixels.some(([pixelI, pixelJ]) => (
    pixelI >= centerI - 1 && pixelI <= centerI + 1
    && pixelJ >= centerJ - 1 && pixelJ <= centerJ + 1
  ));
}


/**
 *
 * By Offset is preferred on server side
 * This gets used by websocket pixel placing requests
 * @param user user object or null
 * @param ip ip object
 * @param canvasId
 * @param i Chunk coordinates
 * @param j
 * @param pixels Array of individual pixels within the chunk, with:
 *        [[offset, color], [offset2, color2],...]
 *        Offset is the offset of the pixel within the chunk
 * @param connectedTs Timestamp when connection got established.
 *        if the connection is younger than the cooldown of the canvas,
 *        we fill up the cd on first pixel to nerf one-connection
 *        ip-changing cheaters
 * @return Promise<Object>
 */
export default async function drawByOffsets(
  user,
  ip,
  canvasId,
  i,
  j,
  pixels,
  connectedTs,
  brushPixelPoints = null,
  deferPixelFlush = false,
) {
  let wait = 0;
  let coolDown = 0;
  let retCode = 0;
  let pxlCnt = 0;
  let rankedPxlCnt = 0;
  const { ipString } = ip;
  let unlockIP;

  try {
    const startTime = Date.now();

    unlockIP = await enqueueIP(ipString);

    const canvas = canvases[canvasId];
    if (!canvas || canvas.ed) {
      // canvas doesn't exist or is expired
      throw new Error(1);
    }

    const canvasSize = canvas.size;
    const is3d = !!canvas.v;
    const placedPixels = brushPixelPoints
      || pixels.map(([offset, color]) => [i, j, offset, color]);

    const tileSize = (is3d) ? THREE_TILE_SIZE : TILE_SIZE;
    /*
     * canvas/chunk validation
     */
    if (i >= canvasSize / tileSize) {
      // x out of bounds
      // (we don't have to check for <0 because it is received as uint)
      throw new Error(2);
    }
    if (j >= canvasSize / tileSize) {
      // y out of bounds
      // (we don't have to check for <0 because it is received as uint)
      throw new Error(3);
    }

    if (await overlapsActiveVoid(canvasId, user, placedPixels)) {
      throw new Error(8);
    }

    const isAdmin = (user?.userlvl >= USERLVL.ADMIN);
    const req = (isAdmin) ? null : canvas.req;
    const clrIgnore = canvas.cli || 0;
    const blankColorIndex = canvas.blankColorIndex ?? -1;
    const canCleanWithoutCooldown = (
      user?.userlvl >= USERLVL.CLEANER
      && user.userlvl < USERLVL.MOD
      && placedPixels[0][3] < clrIgnore
    );
    const canSkipBlankCooldown = isAdmin || canCleanWithoutCooldown
      || isZeroCooldownAllowed(user, 'blank', canvasId);
    const canSkipPixelCooldown = isAdmin || canCleanWithoutCooldown
      || isZeroCooldownAllowed(user, 'pixel', canvasId);
    const voidActive = await getEventActive();
    const { bcd, pcd } = getCooldownForUser(
      canvas, user, ip, canvasId, voidActive,
    );
    const userId = user?.id || 0;
    const cds = getCooldownReserve(
      canvasId, canvas.cds, user?.vipTier || 0,
    );
    let cdIfNull = cds - pcd + 1000 - startTime + connectedTs;
    if (cdIfNull < 0 || userId || bcd === 0) {
      cdIfNull = 0;
    }
    const pxlOffsets = [];

    /*
     * validate pixels
     */
    let ranked = canvas.ranked && (pcd > 0 || isAdmin);
    for (let u = 0; u < placedPixels.length; u += 1) {
      const [pixelI, pixelJ, offset, color] = placedPixels[u];
      if (pixelI >= canvasSize / tileSize) {
        throw new Error(2);
      }
      if (pixelJ >= canvasSize / tileSize) {
        throw new Error(3);
      }
      if (!brushPixelPoints) {
        pxlOffsets.push(offset);
      }

      const maxSize = (is3d) ? tileSize * tileSize * THREE_CANVAS_HEIGHT
        : tileSize * tileSize;
      if (offset >= maxSize) {
        // z out of bounds or weird stuff
        throw new Error(4);
      }

      if (color >= canvas.colors.length) {
        // color out of bounds
        throw new Error(5);
      }
      if (color < clrIgnore) {
        // admins, jannies, cleaners and mods can place unset pixels
        if ((!user || user.userlvl < USERLVL.CLEANER)
          && !(canvas.v && color === 0)
        ) {
          // color out of bounds
          throw new Error(5);
        }
      }

      /* 3D Canvas Minecraft Avatars */
      // && x >= 96 && x <= 128 && z >= 35 && z <= 100
      // 96 - 128 on x
      // 32 - 128 on z
      if (canvas.v && pixelI === 19
        && pixelJ >= 17 && pixelJ < 20 && !isAdmin
      ) {
        // protected pixel
        throw new Error(8);
      }

      /* dont rank antarctica */
      if (canvasId === 0) {
        const cy = Math.floor(offset / TILE_SIZE);
        const y = ((pixelJ - (canvasSize / 2 / TILE_SIZE)) * TILE_SIZE) + cy;
        if (y > 14450) {
          ranked = false;
        }
      }
    }

    if (await checkFactionNapProtection(
      canvasId,
      placedPixels,
      canvasSize,
      is3d,
    )) {
      throw new Error(19);
    }

    /*
     * Errors that we want to be logged later on
     * In example: The user should not know that he is detected as a proxy,
     * unless he already solved a captcha.
     * Also useful for letting pixels be logged before throwing.
     */
    let errorLater;
    let captchaPassed = false;

    if (!user) {
      errorLater = 6;
    } else if ((await getState('needVerification')) && (
      !user || user.userlvl < USERLVL.VERIFIED
    )) {
      errorLater = 17;
    }

    if (!errorLater) {
      const { captchaNeeded, challengeNeeded } = await ip.getVerification();
      captchaPassed = !captchaNeeded;
      if (captchaNeeded || challengeNeeded) {
        errorLater = 10;
      }
    }

    if (!errorLater) {
      let { isBanned, isProxy } = await ip.getAllowance();
      if (!isProxy && !isBanned && user) {
        ({ isBanned } = await user.getAllowance());
      }
      if (isBanned) {
        throw new Error(14);
      }
      if (isProxy) {
        errorLater = 11;
      }
    }

    /* temporary blocks */
    if (user?.blockedInterval && isIntervalActive(user.blockedInterval, 1)) {
      throw new Error(18);
    }
    if (ip.blockedInterval && isIntervalActive(ip.blockedInterval, 1)) {
      throw new Error(18);
    }

    const factionId = user?.activeFactionId || 0;
    [
      retCode,
      pxlCnt,
      wait,
      coolDown,
    ] = await (brushPixelPoints ? allowPlaceBrush : allowPlace)(
      ipString,
      userId,
      factionId,
      ip.country,
      ranked,
      canvasId,
      canvas.linkcd ?? canvasId,
      i, j,
      clrIgnore,
      blankColorIndex,
      canSkipBlankCooldown,
      canSkipPixelCooldown,
      req,
      bcd, pcd,
      /*
       * don't increase counter if we are will error
       */
      errorLater,
      cds,
      cdIfNull,
      brushPixelPoints || pxlOffsets,
    );

    for (let u = 0; u < placedPixels.length; u += 1) {
      const [pixelI, pixelJ, offset, color] = placedPixels[u];
      const coords = getPixelFromChunkOffset(
        pixelI, pixelJ, offset, canvasSize, is3d,
      )
        .join(' ');

      let logRetCode;
      if (errorLater) {
        logRetCode = errorLater;
      } else if (u < pxlCnt) {
        logRetCode = 0;
      } else {
        logRetCode = retCode;
      }

      PixelLogger.log(
        // eslint-disable-next-line max-len
        `${startTime} ${ipString} ${userId} ${canvasId} ${coords} ${color} ${logRetCode}`,
      );
    }

    /*
     * pxlCnt is only larger than 0 if all requirements are met for placing on
     * that canvas
     */
    if (pxlCnt > 0 && errorLater) {
      pxlCnt = 0;
      throw new Error(errorLater);
    }

    for (let u = 0; u < pxlCnt; u += 1) {
      const [pixelI, pixelJ, offset, color] = placedPixels[u];
      setPixelByOffset(canvasId, color, pixelI, pixelJ, offset);
    }
    if (ranked && userId && factionId && pxlCnt > 0) {
      try {
        await recordFactionPixelPlacement(
          factionId,
          userId,
          pxlCnt,
        );
      } catch (error) {
        logger.error(`Failed to update faction pixel totals: ${error.message}`);
      }
    }
    if (pxlCnt > 0 && !is3d) {
      const activityPixels = placedPixels.slice(0, pxlCnt)
        .map(([pixelI, pixelJ, offset]) => [pixelI, pixelJ, offset]);
      const actorKey = userId ? `u:${userId}` : `ip:${ipString}`;
      recordPixelActivity(canvasId, activityPixels, actorKey).catch((error) => {
        logger.error(`Failed to record active pixel zones: ${error.message}`);
      });
    }
    if (pxlCnt > 0 && user && captchaPassed && !user.flagUnlocked) {
      if (await setFlagOfUser(userId, USER_FLAGS.COUNTRY_FLAG_UNLOCKED, true)) {
        user.flagUnlocked = true;
      }
    }
    if (brushPixelPoints && pxlCnt > 0 && !deferPixelFlush) {
      await flushPixelCache();
    }

    if (ranked && userId) {
      rankedPxlCnt = pxlCnt;
    }

    const duration = Date.now() - startTime;
    if (duration > 5000) {
      logger.warn(
        // eslint-disable-next-line max-len
        `Long response time of ${duration}ms for placing ${pxlCnt} pixels for user ${user?.id || ipString}`,
      );
    }
  } catch (e) {
    retCode = parseInt(e.message, 10);
    if (Number.isNaN(retCode)) {
      throw e;
    }
  }

  if (unlockIP) {
    unlockIP();
  }

  return {
    wait,
    coolDown,
    pxlCnt,
    rankedPxlCnt,
    retCode,
  };
}

export async function drawBrushByOffsets(
  user,
  ip,
  canvasId,
  i,
  j,
  offset,
  size,
  color,
  connectedTs,
  deferPixelFlush = false,
) {
  const canvas = canvases[canvasId];
  let retCode = 4;
  if (!canvas || canvas.ed) {
    retCode = 1;
  } else if (canvas.v || !isVipBrushSizeAllowed(
    size, user?.vipTier || 0, VIP_ENABLED,
  )) {
    retCode = 5;
  } else if (i >= canvas.size / TILE_SIZE) {
    retCode = 2;
  } else if (j >= canvas.size / TILE_SIZE) {
    retCode = 3;
  } else if (offset < TILE_SIZE * TILE_SIZE) {
    const [x, y] = getPixelFromChunkOffset(
      i, j, offset, canvas.size,
    );
    const brushPixels = getBrushPixels(canvas.size, x, y, size);
    const pixels = brushPixels.map(([, , pixelOffset]) => [
      pixelOffset, color,
    ]);
    const pixelPoints = brushPixels.map(([pixelI, pixelJ, pixelOffset]) => [
      pixelI, pixelJ, pixelOffset, color,
    ]);
    return drawByOffsets(
      user,
      ip,
      canvasId,
      i,
      j,
      pixels,
      connectedTs,
      pixelPoints,
      deferPixelFlush,
    );
  }

  return {
    wait: 0,
    coolDown: 0,
    pxlCnt: 0,
    rankedPxlCnt: 0,
    retCode,
  };
}

export async function drawBrushBatchByOffsets(
  user,
  ip,
  canvasId,
  stamps,
  connectedTs,
) {
  const emptyResult = {
    wait: 0,
    coolDown: 0,
    pxlCnt: 0,
    rankedPxlCnt: 0,
    retCode: 0,
  };
  if (!stamps.length) {
    return emptyResult;
  }
  const canvas = canvases[canvasId];
  const pixelPoints = [];
  for (let stampIndex = 0; stampIndex < stamps.length; stampIndex += 1) {
    const stamp = stamps[stampIndex];
    const {
      i, j, offset, size, color,
    } = stamp;
    if (!canvas || canvas.ed) {
      emptyResult.retCode = 1;
      return emptyResult;
    }
    if (canvas.v || !isVipBrushSizeAllowed(
      size, user?.vipTier || 0, VIP_ENABLED,
    )) {
      emptyResult.retCode = 5;
      return emptyResult;
    }
    if (i >= canvas.size / TILE_SIZE) {
      emptyResult.retCode = 2;
      return emptyResult;
    }
    if (j >= canvas.size / TILE_SIZE) {
      emptyResult.retCode = 3;
      return emptyResult;
    }
    if (offset >= TILE_SIZE * TILE_SIZE) {
      emptyResult.retCode = 4;
      return emptyResult;
    }
    const [x, y] = getPixelFromChunkOffset(i, j, offset, canvas.size);
    const brushPixels = getBrushPixels(canvas.size, x, y, size);
    if (pixelPoints.length + brushPixels.length > 100) {
      emptyResult.retCode = 5;
      return emptyResult;
    }
    brushPixels.forEach(([pixelI, pixelJ, pixelOffset]) => {
      pixelPoints.push([
        pixelI, pixelJ, pixelOffset, color, stampIndex,
      ]);
    });
  }

  const { i, j } = stamps[0];
  const result = await drawByOffsets(
    user,
    ip,
    canvasId,
    i,
    j,
    pixelPoints.map(([, , offset, color]) => [offset, color]),
    connectedTs,
    pixelPoints,
    true,
  );
  if (result.pxlCnt > 0) {
    await flushPixelCache();
  }
  return result;
}

export async function drawTemplateBrushBatchByOffsets(
  user,
  ip,
  canvasId,
  stamps,
  connectedTs,
) {
  const emptyResult = {
    wait: 0,
    coolDown: 0,
    pxlCnt: 0,
    rankedPxlCnt: 0,
    retCode: 0,
  };
  if (!stamps.length) {
    return emptyResult;
  }
  const canvas = canvases[canvasId];
  const pixelPoints = [];
  for (let stampIndex = 0; stampIndex < stamps.length; stampIndex += 1) {
    const stamp = stamps[stampIndex];
    const {
      i, j, offset, size, templateMask, templateColors,
    } = stamp;
    if (!canvas || canvas.ed || canvas.v
      || !isVipBrushSizeAllowed(size, user?.vipTier || 0, VIP_ENABLED)
    ) {
      emptyResult.retCode = (!canvas || canvas.ed) ? 1 : 5;
      return emptyResult;
    }
    const pixelCount = size * size;
    const requiredMaskBytes = Math.ceil(pixelCount / 8);
    if (!Array.isArray(templateMask) || templateMask.length !== 13
      || !Array.isArray(templateColors) || templateColors.length !== 100
    ) {
      emptyResult.retCode = 5;
      return emptyResult;
    }
    const remainingMaskBits = pixelCount % 8;
    const hasInvalidTrailingMaskBits = remainingMaskBits > 0
      && (templateMask[requiredMaskBytes - 1] >> remainingMaskBits) !== 0;
    if (!templateMask.some((byte) => byte)
      || templateMask.slice(requiredMaskBytes).some((byte) => byte !== 0)
      || hasInvalidTrailingMaskBits
    ) {
      emptyResult.retCode = 5;
      return emptyResult;
    }
    if (i >= canvas.size / TILE_SIZE) {
      emptyResult.retCode = 2;
      return emptyResult;
    }
    if (j >= canvas.size / TILE_SIZE) {
      emptyResult.retCode = 3;
      return emptyResult;
    }
    if (offset >= TILE_SIZE * TILE_SIZE) {
      emptyResult.retCode = 4;
      return emptyResult;
    }
    const [x, y] = getPixelFromChunkOffset(i, j, offset, canvas.size);
    const brushPixels = getBrushPixels(canvas.size, x, y, size);
    const radius = Math.floor(size / 2);
    const stampPixelPoints = [];
    for (const [pixelI, pixelJ, pixelOffset, pixelX, pixelY] of brushPixels) {
      const colorIndex = (pixelY - y + radius) * size
        + pixelX - x + radius;
      if (templateMask[colorIndex >> 3] & (1 << (colorIndex & 7))) {
        stampPixelPoints.push([
          pixelI,
          pixelJ,
          pixelOffset,
          templateColors[colorIndex],
          stampIndex,
        ]);
      }
    }
    if (!stampPixelPoints.length
      || pixelPoints.length + stampPixelPoints.length > 100
    ) {
      emptyResult.retCode = 5;
      return emptyResult;
    }
    pixelPoints.push(...stampPixelPoints);
  }

  const { i, j } = stamps[0];
  const result = await drawByOffsets(
    user,
    ip,
    canvasId,
    i,
    j,
    pixelPoints.map(([, , offset, color]) => [offset, color]),
    connectedTs,
    pixelPoints,
    true,
  );
  if (result.pxlCnt > 0) {
    await flushPixelCache();
  }
  return result;
}
