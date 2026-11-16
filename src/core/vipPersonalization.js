export const VIP_BANNER_PRESETS = {
  aurora: {
    label: 'Aurora',
    background: 'linear-gradient(115deg, #163f70, #5dd6c1, #d7f7ff)',
  },
  sunset: {
    label: 'Sunset',
    background: 'linear-gradient(115deg, #4b1d67, #f05b64, #ffc66d)',
  },
  ocean: {
    label: 'Ocean',
    background: 'linear-gradient(115deg, #071b4f, #087eaa, #71e0d3)',
  },
  ember: {
    label: 'Ember',
    background: 'linear-gradient(115deg, #35100e, #c13f1a, #ffca5c)',
  },
  forest: {
    label: 'Forest',
    background: 'linear-gradient(115deg, #12352c, #398454, #c1df89)',
  },
  cosmic: {
    label: 'Cosmic',
    background: 'linear-gradient(115deg, #17143f, #7546a8, #e08acb)',
  },
  glacier: {
    label: 'Glacier',
    background: 'linear-gradient(115deg, #315678, #94d9f2, #f1ffff)',
  },
  gold: {
    label: 'Gold',
    background: 'linear-gradient(115deg, #53380a, #c99627, #fff0a3)',
  },
  nova: {
    label: 'Nova (Emperor)',
    minTier: 3,
    background: 'linear-gradient(115deg, #160d3b, #7b4dff, #42e8e0)',
  },
  royal: {
    label: 'Royal (Emperor)',
    minTier: 3,
    background: 'linear-gradient(115deg, #3b123f, #d74491, #ffcf70)',
  },
  abyss: {
    label: 'Abyss (Emperor)',
    minTier: 3,
    background: 'linear-gradient(115deg, #071b24, #087c8c, #a0fff1)',
  },
  prism: {
    label: 'Prism (Emperor)',
    minTier: 3,
    background: 'linear-gradient(115deg, #d14493, #715aff, #2be0ba)',
  },
};

export const VIP_BANNER_PRESET_KEYS = Object.keys(VIP_BANNER_PRESETS);
export const VIP_BANNER_WIDTH = 1200;
export const VIP_BANNER_HEIGHT = 300;
export const VIP_AVATAR_GLOWS = ['silver', 'gold', 'aurora'];

export function isValidVipAvatarGlow(glow) {
  return glow === null || glow === ''
    || (typeof glow === 'string' && VIP_AVATAR_GLOWS.includes(glow));
}

export function getVipAvatarGlow(tier, glow) {
  if (normalizeVipTier(tier) < 1) {
    return null;
  }
  return VIP_AVATAR_GLOWS.includes(glow) ? glow : 'gold';
}

export function isValidVipNicknameGradient(gradient) {
  if (gradient === null || gradient === '') {
    return true;
  }
  if (typeof gradient !== 'string') {
    return false;
  }
  return /^#[\da-f]{6},#[\da-f]{6}$/i.test(gradient);
}

export function normalizeVipTier(tier) {
  if (tier === null || tier === undefined || tier === '') {
    return 0;
  }
  const numericTier = Number(tier);
  return Number.isInteger(numericTier) ? numericTier : 0;
}

export function isVipTier(tier) {
  return normalizeVipTier(tier) >= 1;
}

export function isVipPlusTier(tier) {
  return normalizeVipTier(tier) >= 2;
}

export function isVipEmperorTier(tier) {
  return normalizeVipTier(tier) >= 3;
}

export function isAllowedVipBannerPreset(preset, tier = 1) {
  if (preset === null || preset === undefined) {
    return true;
  }
  if (typeof preset !== 'string') {
    return false;
  }
  const normalizedPreset = preset.trim();
  const option = VIP_BANNER_PRESETS[normalizedPreset];
  return !!option
    && (!option.minTier || normalizeVipTier(tier) >= option.minTier);
}

export function isValidVipNicknameColor(color) {
  if (color === null || color === undefined || color === '') {
    return true;
  }
  if (typeof color !== 'string') {
    return false;
  }
  return /^#[\da-f]{6}$/i.test(color.trim());
}

export function hasVipBannerDimensions(width, height) {
  return width === VIP_BANNER_WIDTH && height === VIP_BANNER_HEIGHT;
}
