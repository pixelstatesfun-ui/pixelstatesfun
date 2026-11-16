/*
 * Cooldown and Chaos Event Manager
 */
import { getState, setState } from './SharedState.js';
import socketEvents from '../socket/socketEvents.js';
import { getCooldownFactor } from './CooldownModifiers.js';
import {
  getVipCooldownMultiplier, getVipStackCapacity, VIP_TIER,
} from './vip.js';
import {
  VIP_ENABLED,
  VIP_COOLDOWN_MULTIPLIER,
  VIP_COOLDOWN_MULTIPLIER_NO_VOID,
  VIP_PLUS_COOLDOWN_MULTIPLIER,
  VIP_PLUS_COOLDOWN_MULTIPLIER_NO_VOID,
  VIP_PLUS_PLUS_COOLDOWN_MULTIPLIER,
  VIP_PLUS_PLUS_COOLDOWN_MULTIPLIER_NO_VOID,
} from './config.js';
import { USERLVL } from './constants.js';
import logger, { ModtoolsLogger } from './logger.js';
import canvases from './canvases.js';
import { getEventActive } from '../data/redis/Event.js';

let cachedChaosEvent = null;
let cachedPermanentCooldown = null;
let initialized = false;
let expiryInterval = null;
let cooldownEventFactor = 1;

socketEvents.on('setCoolDownFactor', (factor) => {
  if (!Number.isFinite(factor) || factor < 0) {
    return;
  }
  cooldownEventFactor = factor;
  broadcastCooldownChange();
});

function formatCooldownSeconds(milliseconds) {
  const seconds = Number((Number(milliseconds) / 1000).toFixed(3));
  return seconds + 's';
}

function getVipTierMultiplier(vipTier, voidActive) {
  return getVipCooldownMultiplier(
    vipTier,
    VIP_ENABLED,
    VIP_COOLDOWN_MULTIPLIER,
    VIP_PLUS_COOLDOWN_MULTIPLIER,
    VIP_PLUS_PLUS_COOLDOWN_MULTIPLIER,
    voidActive,
    VIP_COOLDOWN_MULTIPLIER_NO_VOID,
    VIP_PLUS_COOLDOWN_MULTIPLIER_NO_VOID,
    VIP_PLUS_PLUS_COOLDOWN_MULTIPLIER_NO_VOID,
  );
}

function getVoidCooldownMultiplier(vipTier, isVip, canvasId) {
  if (isVip) {
    return getVipTierMultiplier(vipTier, true);
  }
  return String(canvasId) === '0' ? 0.5 : 1;
}

export function getCustomVipCooldowns(state, vipTier, voidActive) {
  const multiplier = getVipTierMultiplier(vipTier, voidActive);
  const noVoidMultiplier = getVipTierMultiplier(vipTier, false);
  let configuredPixelCooldown = null;
  if (vipTier >= VIP_TIER.EMPEROR) {
    configuredPixelCooldown = state.vipPlusPlusCooldown;
  } else if (vipTier >= VIP_TIER.KING) {
    configuredPixelCooldown = state.vipPlusCooldown;
  }

  const pixelCooldown = (configuredPixelCooldown !== null
    && configuredPixelCooldown !== undefined)
    ? configuredPixelCooldown * (voidActive && noVoidMultiplier > 0
      ? multiplier / noVoidMultiplier : 1)
    : state.vipCooldown * multiplier;

  return {
    bcd: state.vipBaseCooldown * multiplier,
    pcd: pixelCooldown,
  };
}

export function isChaosActive() {
  if (!cachedChaosEvent || !cachedChaosEvent.active) {
    return false;
  }
  if (!cachedChaosEvent.endsAt || Date.now() >= cachedChaosEvent.endsAt) {
    return false;
  }
  return true;
}

export function isPermanentActive(canvasId = null) {
  const hasGlobalCooldown = !!(
    cachedPermanentCooldown
    && cachedPermanentCooldown.userCooldown !== null
    && cachedPermanentCooldown.userCooldown !== undefined
  );
  if (hasGlobalCooldown) {
    return true;
  }
  const canvasCooldowns = cachedPermanentCooldown?.canvasCooldowns;
  if (canvasId !== null && canvasId !== undefined) {
    return !!canvasCooldowns?.[canvasId];
  }
  return false;
}

export function isZeroCooldownAllowed(user, cooldownType = 'pixel', canvasId = null) {
  const vipTier = user?.vipTier || 0;
  const isVip = VIP_ENABLED && vipTier > 0;
  const cooldownKey = cooldownType === 'blank' ? 'bcd' : 'pcd';
  let cooldown;

  if (isChaosActive()) {
    const chaos = getChaosState();
    cooldown = isVip
      ? getCustomVipCooldowns(chaos, vipTier, false)[cooldownKey]
      : (cooldownType === 'blank' ? chaos.baseCooldown : chaos.userCooldown);
  } else if (isPermanentActive(canvasId)) {
    const permanent = getPermanentState(canvasId);
    cooldown = isVip
      ? getCustomVipCooldowns(permanent, vipTier, false)[cooldownKey]
      : (cooldownType === 'blank'
          ? permanent.baseCooldown : permanent.userCooldown);
  }

  return cooldown === 0;
}

export function getChaosState() {
  const active = isChaosActive();
  const now = Date.now();
  const userCooldown = cachedChaosEvent?.userCooldown ?? 1000;
  const vipCooldown = cachedChaosEvent?.vipCooldown ?? 1000;
  const remainingMs = active && cachedChaosEvent
    ? Math.max(0, cachedChaosEvent.endsAt - now)
    : 0;

  return {
    active,
    userCooldown,
    vipCooldown,
    baseCooldown: cachedChaosEvent?.baseCooldown ?? 500,
    vipBaseCooldown: cachedChaosEvent?.vipBaseCooldown ?? 500,
    vipPlusCooldown: cachedChaosEvent?.vipPlusCooldown
      ?? Math.round(vipCooldown * VIP_PLUS_COOLDOWN_MULTIPLIER_NO_VOID),
    vipPlusPlusCooldown: cachedChaosEvent?.vipPlusPlusCooldown
      ?? Math.round(vipCooldown * VIP_PLUS_PLUS_COOLDOWN_MULTIPLIER_NO_VOID),
    durationMinutes: cachedChaosEvent?.durationMinutes ?? 30,
    startedAt: cachedChaosEvent?.startedAt ?? null,
    endsAt: cachedChaosEvent?.endsAt ?? null,
    remainingMs,
  };
}

export function getPermanentState(canvasId = null) {
  const canvasOverride = (canvasId !== null && canvasId !== undefined)
    ? cachedPermanentCooldown?.canvasCooldowns?.[canvasId]
    : null;
  const state = canvasOverride
    ? { ...cachedPermanentCooldown, ...canvasOverride }
    : cachedPermanentCooldown;
  const globalIsCustom = !!(
    cachedPermanentCooldown
    && cachedPermanentCooldown.userCooldown !== null
    && cachedPermanentCooldown.userCooldown !== undefined
  );
  const isCustom = globalIsCustom || !!canvasOverride;
  const userCooldown = state?.userCooldown ?? 1000;
  const vipCooldown = state?.vipCooldown ?? 500;
  const canvasDefaultReserve = (canvasId !== null && canvasId !== undefined)
    ? canvases[canvasId]?.cds : null;
  return {
    isCustom,
    userCooldown,
    vipCooldown,
    cds: state?.cds ?? canvasDefaultReserve ?? 60000,
    baseCooldown: state?.baseCooldown ?? Math.round(userCooldown * 0.5),
    vipBaseCooldown: state?.vipBaseCooldown ?? Math.round(vipCooldown * 0.5),
    vipPlusCooldown: state?.vipPlusCooldown
      ?? Math.round(vipCooldown * VIP_PLUS_COOLDOWN_MULTIPLIER_NO_VOID),
    vipPlusPlusCooldown: state?.vipPlusPlusCooldown
      ?? Math.round(vipCooldown * VIP_PLUS_PLUS_COOLDOWN_MULTIPLIER_NO_VOID),
    updatedAt: state?.updatedAt ?? null,
    canvasCooldowns: cachedPermanentCooldown?.canvasCooldowns ?? {},
  };
}

export function getCooldownReserve(canvasId, canvasDefault = null, vipTier = 0) {
  const vipCapacity = getVipStackCapacity(vipTier, VIP_ENABLED);
  if (vipCapacity !== null) {
    return vipCapacity;
  }
  const canvasOverride = cachedPermanentCooldown?.canvasCooldowns?.[canvasId];
  if (canvasOverride && Object.hasOwn(canvasOverride, 'cds')) {
    return canvasOverride.cds;
  }
  if (cachedPermanentCooldown
    && Object.hasOwn(cachedPermanentCooldown, 'cds')
  ) {
    return cachedPermanentCooldown.cds;
  }
  return canvasDefault ?? 60000;
}

export function getEffectiveCanvasCooldowns(canvasId = null) {
  let effective;
  if (isChaosActive()) {
    const chaos = getChaosState();
    effective = {
      bcd: chaos.baseCooldown,
      pcd: chaos.userCooldown,
    };
  } else if (isPermanentActive(canvasId)) {
    const perm = getPermanentState(canvasId);
    effective = {
      bcd: perm.baseCooldown,
      pcd: perm.userCooldown,
    };
  }
  if (!effective) {
    return null;
  }
  return {
    bcd: Math.floor(effective.bcd * cooldownEventFactor),
    pcd: Math.floor(effective.pcd * cooldownEventFactor),
  };
}

export function getEffectiveVipMultipliers(voidActive = false) {
  if (isChaosActive()) {
    const chaos = getChaosState();
    const getRatios = (tier) => {
      const vipCooldowns = getCustomVipCooldowns(chaos, tier, voidActive);
      return {
        pixel: chaos.userCooldown > 0
          ? vipCooldowns.pcd / chaos.userCooldown : 1,
        blank: chaos.baseCooldown > 0
          ? vipCooldowns.bcd / chaos.baseCooldown : 1,
      };
    };
    const vip = getRatios(VIP_TIER.VIP);
    const king = getRatios(VIP_TIER.KING);
    const emperor = getRatios(VIP_TIER.EMPEROR);
    return {
      vipCooldownMultiplier: vip.pixel,
      vipPlusCooldownMultiplier: king.pixel,
      vipPlusPlusCooldownMultiplier: emperor.pixel,
      vipBaseCooldownMultiplier: vip.blank,
      vipPlusBaseCooldownMultiplier: king.blank,
      vipPlusPlusBaseCooldownMultiplier: emperor.blank,
    };
  }
  if (isPermanentActive()) {
    const perm = getPermanentState();
    const getRatios = (tier) => {
      const vipCooldowns = getCustomVipCooldowns(perm, tier, voidActive);
      return {
        pixel: perm.userCooldown > 0
          ? vipCooldowns.pcd / perm.userCooldown : 1,
        blank: perm.baseCooldown > 0
          ? vipCooldowns.bcd / perm.baseCooldown : 1,
      };
    };
    const vip = getRatios(VIP_TIER.VIP);
    const king = getRatios(VIP_TIER.KING);
    const emperor = getRatios(VIP_TIER.EMPEROR);
    return {
      vipCooldownMultiplier: vip.pixel,
      vipPlusCooldownMultiplier: king.pixel,
      vipPlusPlusCooldownMultiplier: emperor.pixel,
      vipBaseCooldownMultiplier: vip.blank,
      vipPlusBaseCooldownMultiplier: king.blank,
      vipPlusPlusBaseCooldownMultiplier: emperor.blank,
    };
  }
  return {
    vipCooldownMultiplier: getVipTierMultiplier(VIP_TIER.VIP, voidActive),
    vipPlusCooldownMultiplier: getVipTierMultiplier(VIP_TIER.KING, voidActive),
    vipPlusPlusCooldownMultiplier:
      getVipTierMultiplier(VIP_TIER.EMPEROR, voidActive),
    vipBaseCooldownMultiplier: getVipTierMultiplier(VIP_TIER.VIP, voidActive),
    vipPlusBaseCooldownMultiplier:
      getVipTierMultiplier(VIP_TIER.KING, voidActive),
    vipPlusPlusBaseCooldownMultiplier:
      getVipTierMultiplier(VIP_TIER.EMPEROR, voidActive),
  };
}

export async function getCooldownPayload(user = null, ip = null) {
  const voidActive = await getEventActive();
  const multipliers = getEffectiveVipMultipliers(voidActive);
  const chaos = getChaosState();
  const canvasCooldowns = {};
  for (const [id, canvas] of Object.entries(canvases)) {
    const cooldownsByVipTier = {};
    for (
      let vipTier = VIP_TIER.NONE;
      vipTier <= VIP_TIER.EMPEROR;
      vipTier += 1
    ) {
      const tierCooldowns = getCooldownForUser(
        canvas,
        { vipTier, userlvl: USERLVL.ANONYM },
        null,
        id,
        voidActive,
      );
      tierCooldowns.cds = getCooldownReserve(id, canvas.cds, vipTier);
      cooldownsByVipTier[vipTier] = tierCooldowns;
    }
    const regular = cooldownsByVipTier[VIP_TIER.NONE];
    const cooldowns = {
      bcd: regular.bcd,
      pcd: regular.pcd,
      cds: getCooldownReserve(id, canvas.cds),
      cooldownsByVipTier,
    };
    canvasCooldowns[id] = cooldowns;
  }
  const defaultCooldowns = canvasCooldowns['0'] || { bcd: 500, pcd: 1000 };
  const currentUserCooldowns = (user && canvases['0'])
    ? getCooldownForUser(canvases['0'], user, ip, '0', voidActive)
    : defaultCooldowns.cooldownsByVipTier?.[VIP_TIER.NONE]
      || defaultCooldowns;
  return {
    bcd: defaultCooldowns.bcd,
    pcd: defaultCooldowns.pcd,
    currentUserCooldown: currentUserCooldowns,
    voidActive,
    canvasCooldowns,
    vipCooldownMultiplier: multipliers.vipCooldownMultiplier,
    vipPlusCooldownMultiplier: multipliers.vipPlusCooldownMultiplier,
    vipPlusPlusCooldownMultiplier: multipliers.vipPlusPlusCooldownMultiplier,
    vipBaseCooldownMultiplier: multipliers.vipBaseCooldownMultiplier,
    vipPlusBaseCooldownMultiplier:
      multipliers.vipPlusBaseCooldownMultiplier,
    vipPlusPlusBaseCooldownMultiplier:
      multipliers.vipPlusPlusBaseCooldownMultiplier,
    chaosEvent: {
      active: chaos.active,
      endsAt: chaos.endsAt,
      remainingMs: chaos.remainingMs,
      userCooldown: chaos.userCooldown,
      vipCooldown: chaos.vipCooldown,
      baseCooldown: chaos.baseCooldown,
      vipBaseCooldown: chaos.vipBaseCooldown,
      vipPlusCooldown: chaos.vipPlusCooldown,
      vipPlusPlusCooldown: chaos.vipPlusPlusCooldown,
    },
    permanentCooldown: getPermanentState(),
  };
}

export function broadcastCooldownChange() {
  return getCooldownPayload().then((payload) => {
    socketEvents.broadcastCooldownUpdate(payload);
  }).catch((error) => {
    logger.error(`Could not broadcast cooldown update: ${error.message}`);
  });
}

export function applyEffectiveCanvases(canvasesObj) {
  const updated = {};
  for (const [id, c] of Object.entries(canvasesObj)) {
    const effective = getEffectiveCanvasCooldowns(id);
    const canvas = {
      ...c,
      bcd: effective
        ? effective.bcd : Math.floor(c.bcd * cooldownEventFactor),
      cds: getCooldownReserve(id, c.cds),
    };
    if (effective) {
      canvas.pcd = effective.pcd;
    } else if (c.pcd !== null && c.pcd !== undefined) {
      canvas.pcd = Math.floor(c.pcd * cooldownEventFactor);
    }
    updated[id] = canvas;
  }
  return updated;
}

export function getCooldownForUser(canvas, user, ip, canvasId, voidActive) {
  const isAdmin = user?.userlvl >= USERLVL.ADMIN;
  if (isAdmin) {
    return { bcd: 0, pcd: 0 };
  }
  const canCleanWithoutCooldown = (
    user?.userlvl >= USERLVL.CLEANER
    && user.userlvl < USERLVL.MOD
  );
  if (canCleanWithoutCooldown) {
    return { bcd: 0, pcd: 0 };
  }

  const vipTier = user?.vipTier || 0;
  const isVip = VIP_ENABLED && vipTier > 0;
  const countryFactor = getCooldownFactor(ip?.country);

  let targetPcd;
  let targetBcd;
  let customCooldown = false;

  if (isChaosActive()) {
    customCooldown = true;
    const chaos = getChaosState();
    if (isVip) {
      const vipCooldowns = getCustomVipCooldowns(
        chaos, vipTier, voidActive,
      );
      targetPcd = vipCooldowns.pcd;
      targetBcd = vipCooldowns.bcd;
    } else {
      targetPcd = chaos.userCooldown;
      targetBcd = chaos.baseCooldown ?? Math.round(targetPcd / 2);
    }
  } else if (isPermanentActive(canvasId)) {
    customCooldown = true;
    const perm = getPermanentState(canvasId);
    if (isVip) {
      const vipCooldowns = getCustomVipCooldowns(
        perm, vipTier, voidActive,
      );
      targetPcd = vipCooldowns.pcd;
      targetBcd = vipCooldowns.bcd;
    } else {
      targetPcd = perm.userCooldown;
      targetBcd = perm.baseCooldown ?? Math.round(targetPcd / 2);
    }
  } else {
    let factor = 1.0;
    if (isVip) {
      const reducedCooldownActive = voidActive;
      factor *= getVipCooldownMultiplier(
        vipTier,
        VIP_ENABLED,
        VIP_COOLDOWN_MULTIPLIER,
        VIP_PLUS_COOLDOWN_MULTIPLIER,
        VIP_PLUS_PLUS_COOLDOWN_MULTIPLIER,
        reducedCooldownActive,
        VIP_COOLDOWN_MULTIPLIER_NO_VOID,
        VIP_PLUS_COOLDOWN_MULTIPLIER_NO_VOID,
        VIP_PLUS_PLUS_COOLDOWN_MULTIPLIER_NO_VOID,
      );
    } else if (voidActive && String(canvasId) === '0') {
      factor *= 0.5;
    }
    targetBcd = Math.floor(canvas.bcd * factor);
    const canvasPixelCooldown = (canvas.pcd !== null
      && canvas.pcd !== undefined) ? canvas.pcd : canvas.bcd;
    targetPcd = Math.floor(canvasPixelCooldown * factor);
  }

  if (customCooldown && voidActive && !isVip) {
    const voidMultiplier = getVoidCooldownMultiplier(vipTier, false, canvasId);
    targetBcd = Math.floor(targetBcd * voidMultiplier);
    targetPcd = Math.floor(targetPcd * voidMultiplier);
  }

  targetBcd = Math.floor(targetBcd * cooldownEventFactor);
  targetPcd = Math.floor(targetPcd * cooldownEventFactor);

  const finalBcd = Math.floor(targetBcd * countryFactor);
  const finalPcd = Math.floor(targetPcd * countryFactor);
  return { bcd: Math.max(0, finalBcd), pcd: Math.max(0, finalPcd) };
}

export async function startChaos({
  userCooldown,
  vipCooldown,
  durationMinutes,
  baseCooldown = null,
  vipBaseCooldown = null,
  vipPlusCooldown = null,
  vipPlusPlusCooldown = null,
  adminUser = null,
}) {
  const ucd = Number(userCooldown);
  const vcd = Number(vipCooldown);
  const dur = Number(durationMinutes);

  if (!Number.isFinite(ucd) || ucd < 0 || ucd > 600000) {
    throw new Error('Regular user cooldown must be between 0 and 600000 ms');
  }
  if (!Number.isFinite(vcd) || vcd < 0 || vcd > 600000) {
    throw new Error('VIP cooldown must be between 0 and 600000 ms');
  }
  if (!Number.isFinite(dur) || dur <= 0 || dur > 43200) {
    throw new Error('Event duration must be between 1 and 43200 minutes');
  }

  const bcd = (baseCooldown !== null && baseCooldown !== undefined
    && Number.isFinite(Number(baseCooldown)))
    ? Math.max(0, Number(baseCooldown))
    : (cachedChaosEvent?.baseCooldown ?? 500);
  const vbcd = (vipBaseCooldown !== null && vipBaseCooldown !== undefined
    && Number.isFinite(Number(vipBaseCooldown)))
    ? Math.max(0, Number(vipBaseCooldown))
    : (cachedChaosEvent?.vipBaseCooldown ?? 500);
  const vpcd = (vipPlusCooldown !== null && vipPlusCooldown !== undefined
    && Number.isFinite(Number(vipPlusCooldown)))
    ? Math.max(0, Number(vipPlusCooldown))
    : null;
  const vppcd = (vipPlusPlusCooldown !== null
    && vipPlusPlusCooldown !== undefined
    && Number.isFinite(Number(vipPlusPlusCooldown)))
    ? Math.max(0, Number(vipPlusPlusCooldown))
    : null;

  const startedAt = Date.now();
  const endsAt = startedAt + Math.round(dur * 60 * 1000);

  cachedChaosEvent = {
    active: true,
    userCooldown: ucd,
    vipCooldown: vcd,
    baseCooldown: bcd,
    vipBaseCooldown: vbcd,
    vipPlusCooldown: vpcd,
    vipPlusPlusCooldown: vppcd,
    durationMinutes: dur,
    startedAt,
    endsAt,
  };

  await setState('chaosEvent', cachedChaosEvent);
  await broadcastCooldownChange();

  if (adminUser) {
    ModtoolsLogger.adminTextAction(
      adminUser,
      'startchaos',
      `Reg=${ucd}ms, VIP=${vcd}ms, Dur=${dur}m`,
    );
  }

  socketEvents.broadcastAnnouncement(
    `⚡ Chaos Event started! Regular CD: ${formatCooldownSeconds(ucd)}, VIP CD: ${formatCooldownSeconds(vcd)} (${dur} min)`,
  );

  logger.info(
    `CHAOS> Started Chaos Event: Reg=${ucd}ms, VIP=${vcd}ms, Dur=${dur}m by ${
      adminUser?.name || 'admin'
    }`,
  );

  return `Chaos Event started: Regular=${formatCooldownSeconds(ucd)}, VIP=${formatCooldownSeconds(vcd)} for ${dur} minutes!`;
}

export async function stopChaos(adminUser = null, isAuto = false) {
  if (!isChaosActive() && (!cachedChaosEvent || !cachedChaosEvent.active)) {
    return 'Chaos Event is not currently active';
  }

  cachedChaosEvent = {
    ...(cachedChaosEvent || {}),
    active: false,
    endedAt: Date.now(),
  };

  await setState('chaosEvent', cachedChaosEvent);
  await broadcastCooldownChange();

  if (adminUser) {
    ModtoolsLogger.adminTextAction(adminUser, 'stopchaos', 'Manual stop');
  }

  socketEvents.broadcastAnnouncement('⚡ Chaos Event has ended.');

  logger.info(
    `CHAOS> Stopped Chaos Event ${isAuto ? '(automatic expiration)' : `by ${adminUser?.name || 'admin'}`}`,
  );

  return 'Chaos Event has been stopped successfully';
}

export async function setPermanentCooldown({
  userCooldown,
  vipCooldown,
  canvasId = null,
  baseCooldown = null,
  vipBaseCooldown = null,
  vipPlusCooldown = null,
  vipPlusPlusCooldown = null,
  cooldownReserve = null,
  adminUser = null,
}) {
  if (canvasId !== null && canvasId !== undefined && canvasId !== ''
    && !Object.hasOwn(canvases, String(canvasId))
  ) {
    throw new Error('Unknown canvas');
  }
  const ucd = Number(userCooldown);
  const vcd = Number(vipCooldown);

  if (!Number.isFinite(ucd) || ucd < 0 || ucd > 600000) {
    throw new Error('Regular user cooldown must be between 0 and 600000 ms');
  }
  if (!Number.isFinite(vcd) || vcd < 0 || vcd > 600000) {
    throw new Error('VIP cooldown must be between 0 and 600000 ms');
  }
  const cds = Number(cooldownReserve);
  if (!Number.isFinite(cds) || cds < 0 || cds > 600000) {
    throw new Error('Cooldown reserve must be between 0 and 600000 ms');
  }

  const bcd = (baseCooldown !== null && baseCooldown !== undefined
    && Number.isFinite(Number(baseCooldown)))
    ? Math.max(0, Number(baseCooldown))
    : (cachedPermanentCooldown?.baseCooldown ?? 500);
  const vbcd = (vipBaseCooldown !== null && vipBaseCooldown !== undefined
    && Number.isFinite(Number(vipBaseCooldown)))
    ? Math.max(0, Number(vipBaseCooldown))
    : (cachedPermanentCooldown?.vipBaseCooldown ?? 250);
  const vpcd = (vipPlusCooldown !== null && vipPlusCooldown !== undefined
    && Number.isFinite(Number(vipPlusCooldown)))
    ? Math.max(0, Number(vipPlusCooldown))
    : null;
  const vppcd = (vipPlusPlusCooldown !== null
    && vipPlusPlusCooldown !== undefined
    && Number.isFinite(Number(vipPlusPlusCooldown)))
    ? Math.max(0, Number(vipPlusPlusCooldown))
    : null;

  const cooldownState = {
    userCooldown: ucd,
    vipCooldown: vcd,
    cds,
    baseCooldown: bcd,
    vipBaseCooldown: vbcd,
    vipPlusCooldown: vpcd,
    vipPlusPlusCooldown: vppcd,
    updatedAt: Date.now(),
  };
  if (canvasId !== null && canvasId !== undefined && canvasId !== '') {
    const existing = cachedPermanentCooldown || {
      userCooldown: null,
      vipCooldown: null,
      baseCooldown: null,
      vipBaseCooldown: null,
      vipPlusCooldown: null,
      vipPlusPlusCooldown: null,
      canvasCooldowns: {},
    };
    cachedPermanentCooldown = {
      ...existing,
      canvasCooldowns: {
        ...(existing.canvasCooldowns || {}),
        [canvasId]: cooldownState,
      },
    };
  } else {
    cachedPermanentCooldown = {
      ...cooldownState,
      canvasCooldowns: cachedPermanentCooldown?.canvasCooldowns || {},
    };
  }

  await setState('permanentCooldown', cachedPermanentCooldown);
  await broadcastCooldownChange();

  if (adminUser) {
    ModtoolsLogger.adminTextAction(
      adminUser,
      'setpermanentcooldown',
      `Reg=${ucd}ms, VIP=${vcd}ms, reserve=${cds}ms`,
    );
  }

  logger.info(
    `COOLDOWN> Permanent cooldown updated: Reg=${ucd}ms, VIP=${vcd}ms, `
    + `reserve=${cds}ms by ${
      adminUser?.name || 'admin'
    }`,
  );

  return `Permanent cooldown set: Regular=${formatCooldownSeconds(ucd)}, `
    + `VIP=${formatCooldownSeconds(vcd)}, `
    + `reserve=${formatCooldownSeconds(cds)}!`;
}

export async function resetPermanentCooldown(adminUser = null, canvasId = null) {
  if (canvasId !== null && canvasId !== undefined && canvasId !== ''
    && !Object.hasOwn(canvases, String(canvasId))
  ) {
    throw new Error('Unknown canvas');
  }
  if (canvasId !== null && canvasId !== undefined && canvasId !== '') {
    if (cachedPermanentCooldown?.canvasCooldowns) {
      const canvasCooldowns = { ...cachedPermanentCooldown.canvasCooldowns };
      delete canvasCooldowns[canvasId];
      const hasGlobalCooldown = cachedPermanentCooldown.userCooldown
        !== null && cachedPermanentCooldown.userCooldown !== undefined;
      cachedPermanentCooldown = hasGlobalCooldown || Object.keys(canvasCooldowns).length
        ? { ...cachedPermanentCooldown, canvasCooldowns }
        : null;
    }
  } else {
    cachedPermanentCooldown = null;
  }
  await setState('permanentCooldown', cachedPermanentCooldown);
  await broadcastCooldownChange();

  if (adminUser) {
    ModtoolsLogger.adminTextAction(
      adminUser,
      'resetpermanentcooldown',
      'Reset to default',
    );
  }

  logger.info(
    `COOLDOWN> Permanent cooldown reset to default by ${
      adminUser?.name || 'admin'
    }`,
  );

  return 'Permanent cooldown reset to defaults (1000ms / 500ms)!';
}

export async function initialize() {
  if (initialized) {
    return;
  }
  initialized = true;

  try {
    const [chaos, permanent] = await Promise.all([
      getState('chaosEvent'),
      getState('permanentCooldown'),
    ]);
    if (chaos) {
      cachedChaosEvent = chaos;
    }
    if (permanent) {
      cachedPermanentCooldown = permanent;
    }
  } catch (error) {
    logger.error(`CooldownManager failed to load initial state: ${error.message}`);
  }

  socketEvents.on('sharedstate', (key, value) => {
    if (key === 'chaosEvent') {
      cachedChaosEvent = value;
      broadcastCooldownChange();
    } else if (key === 'permanentCooldown') {
      cachedPermanentCooldown = value;
      broadcastCooldownChange();
    }
  });

  if (!expiryInterval) {
    expiryInterval = setInterval(async () => {
      if (cachedChaosEvent && cachedChaosEvent.active) {
        if (Date.now() >= cachedChaosEvent.endsAt) {
          try {
            await stopChaos(null, true);
          } catch (err) {
            logger.error(`Error auto-stopping Chaos Event: ${err.message}`);
          }
        }
      }
    }, 1000);
    expiryInterval.unref();
  }
}

export default {
  initialize,
  isChaosActive,
  isPermanentActive,
  isZeroCooldownAllowed,
  getChaosState,
  getPermanentState,
  getCooldownReserve,
  getEffectiveCanvasCooldowns,
  getEffectiveVipMultipliers,
  getCooldownPayload,
  broadcastCooldownChange,
  applyEffectiveCanvases,
  getCooldownForUser,
  startChaos,
  stopChaos,
  setPermanentCooldown,
  resetPermanentCooldown,
};
