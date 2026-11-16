export const VIP_TIER = {
  NONE: 0,
  PRINCE: 1,
  VIP: 1,
  KING: 2,
  PREMIUM: 2,
  EMPEROR: 3,
};

export function getVipStackCapacity(vipTier, vipEnabled = true) {
  if (!vipEnabled || vipTier < VIP_TIER.PRINCE) {
    return null;
  }
  if (vipTier >= VIP_TIER.EMPEROR) return 20 * 60 * 1000;
  if (vipTier >= VIP_TIER.KING) return 14 * 60 * 1000;
  return 10 * 60 * 1000;
}

export function getVipCooldownMultiplier(
  vipTier,
  vipEnabled = true,
  vipCooldownMultiplier = 0.5,
  vipPlusCooldownMultiplier = 0.45,
  vipPlusPlusCooldownMultiplier = 0.4,
  voidActive = true,
  vipCooldownMultiplierNoVoid = 0.95,
  vipPlusCooldownMultiplierNoVoid = 0.85,
  vipPlusPlusCooldownMultiplierNoVoid = 0.8,
) {
  if (!vipEnabled || vipTier < VIP_TIER.VIP) {
    return 1;
  }
  if (vipTier >= VIP_TIER.EMPEROR) {
    return voidActive
      ? vipPlusPlusCooldownMultiplier : vipPlusPlusCooldownMultiplierNoVoid;
  }
  if (vipTier >= VIP_TIER.KING) {
    return voidActive
      ? vipPlusCooldownMultiplier : vipPlusCooldownMultiplierNoVoid;
  }
  return voidActive ? vipCooldownMultiplier : vipCooldownMultiplierNoVoid;
}

export function isPremiumTier(vipTier) {
  return vipTier >= VIP_TIER.KING;
}

export function isVipBrushSizeAllowed(size, vipTier, vipEnabled = true) {
  if (![1, 3, 5, 7, 9, 10].includes(size)) {
    return false;
  }
  if (size <= 5) {
    return true;
  }
  if (!vipEnabled) {
    return false;
  }
  if (size <= 7) {
    return vipTier >= VIP_TIER.KING;
  }
  return vipTier >= VIP_TIER.EMPEROR;
}

export function getVipBrushSizes(vipTier) {
  return [1, 3, 5, 7, 9, 10].filter(
    (size) => isVipBrushSizeAllowed(size, vipTier),
  );
}

export function getVipTierName(vipTier) {
  if (vipTier >= VIP_TIER.EMPEROR) return 'Emperor';
  if (vipTier >= VIP_TIER.KING) return 'King';
  if (vipTier >= VIP_TIER.PRINCE) return 'Prince';
  return '';
}

export function parseVipDuration(duration) {
  if (typeof duration !== 'string') {
    return undefined;
  }
  const value = duration.trim().toLowerCase();
  if (value === 'permanent' || value === 'perm') {
    return null;
  }
  const match = /^([1-9]\d{0,4})([dhm])$/.exec(value);
  if (!match) {
    return undefined;
  }
  const amount = Number(match[1]);
  const unitMs = { d: 86400000, h: 3600000, m: 60000 }[match[2]];
  const durationMs = amount * unitMs;
  return (durationMs <= 3650 * 86400000) ? durationMs : undefined;
}
