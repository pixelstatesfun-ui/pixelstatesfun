import test from 'node:test';
import assert from 'node:assert/strict';

import {
  VIP_BANNER_PRESETS,
  VIP_BANNER_WIDTH,
  VIP_BANNER_HEIGHT,
  hasVipBannerDimensions,
  isValidVipAvatarGlow,
  getVipAvatarGlow,
  isAllowedVipBannerPreset,
  isValidVipNicknameGradient,
  isVipEmperorTier,
  isVipPlusTier,
  isVipTier,
  isValidVipNicknameColor,
} from './vipPersonalization.js';

test('reserves premium built-in banners for Emperor', () => {
  assert.equal(Object.keys(VIP_BANNER_PRESETS).length, 12);
  assert.equal(isVipTier(1), true);
  assert.equal(isVipTier(0), false);
  assert.equal(isAllowedVipBannerPreset('aurora'), true);
  assert.equal(isAllowedVipBannerPreset('nova', 1), false);
  assert.equal(isAllowedVipBannerPreset('nova', 2), false);
  assert.equal(isAllowedVipBannerPreset('nova', 3), true);
  assert.equal(isAllowedVipBannerPreset('unknown'), false);
  assert.equal(isVipEmperorTier(2), false);
  assert.equal(isVipEmperorTier(3), true);
});

test('restricts custom VIP+ colors to valid HEX values', () => {
  assert.equal(isVipPlusTier(2), true);
  assert.equal(isVipPlusTier(1), false);
  assert.equal(isValidVipNicknameColor('#a1B2c3'), true);
  assert.equal(isValidVipNicknameColor('#fff'), false);
  assert.equal(isValidVipNicknameColor('red'), false);
  assert.equal(isValidVipNicknameColor(null), true);
});

test(
  'accepts supported avatar glows and two-color nickname gradients',
  () => {
    assert.equal(isValidVipAvatarGlow('silver'), true);
    assert.equal(isValidVipAvatarGlow('aurora'), true);
    assert.equal(isValidVipAvatarGlow('unknown'), false);
    assert.equal(getVipAvatarGlow(1, null), 'gold');
    assert.equal(getVipAvatarGlow(2, null), 'gold');
    assert.equal(getVipAvatarGlow(3, null), 'gold');
    assert.equal(getVipAvatarGlow(1, 'silver'), 'silver');
    assert.equal(getVipAvatarGlow(1, 'aurora'), 'aurora');
    assert.equal(getVipAvatarGlow(0, 'gold'), null);
    assert.equal(
      isValidVipNicknameGradient('#aabbcc,#112233'),
      true,
    );
    assert.equal(isValidVipNicknameGradient('#fff,#112233'), false);
    assert.equal(isValidVipNicknameGradient('red,blue'), false);
    assert.equal(isValidVipNicknameGradient(null), true);
  },
);

test('requires uploaded banner images to be exactly 1200 by 300 pixels', () => {
  assert.equal(VIP_BANNER_WIDTH, 1200);
  assert.equal(VIP_BANNER_HEIGHT, 300);
  assert.equal(hasVipBannerDimensions(1200, 300), true);
  assert.equal(hasVipBannerDimensions(1200, 301), false);
});
