import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getVipBrushSizes, getVipCooldownMultiplier, getVipStackCapacity, isPremiumTier,
  isVipBrushSizeAllowed, VIP_TIER,
} from './vip.js';

test('VIP tiers reduce pixel cooldown while stack capacity is tier-specific', () => {
  assert.equal(getVipCooldownMultiplier(VIP_TIER.VIP), 0.5);
  assert.equal(getVipCooldownMultiplier(VIP_TIER.PREMIUM), 0.45);
  assert.equal(getVipCooldownMultiplier(VIP_TIER.EMPEROR), 0.4);
  assert.equal(getVipCooldownMultiplier(VIP_TIER.NONE), 1);
  assert.equal(getVipCooldownMultiplier(VIP_TIER.PREMIUM, false), 1);
  assert.equal(
    getVipCooldownMultiplier(
      VIP_TIER.PRINCE, true, 0.5, 0.45, 0.4, false, 0.95, 0.85, 0.8,
    ),
    0.95,
  );
  assert.equal(
    getVipCooldownMultiplier(
      VIP_TIER.PRINCE, true, 0.5, 0.45, 0.4, true, 0.95, 0.85, 0.8,
    ),
    0.5,
  );
  assert.equal(
    getVipCooldownMultiplier(
      VIP_TIER.KING, true, 0.5, 0.45, 0.4, false, 0.95, 0.85, 0.8,
    ),
    0.85,
  );
  assert.equal(
    getVipCooldownMultiplier(
      VIP_TIER.EMPEROR, true, 0.5, 0.45, 0.4, false, 0.95, 0.85, 0.8,
    ),
    0.8,
  );
  assert.equal(
    getVipCooldownMultiplier(
      VIP_TIER.KING, true, 0.5, 0.45, 0.4, true, 0.95, 0.85, 0.8,
    ),
    0.45,
  );
});

test('VIP stack capacity is 10, 14, and 20 minutes by tier', () => {
  assert.equal(getVipStackCapacity(VIP_TIER.NONE), null);
  assert.equal(getVipStackCapacity(VIP_TIER.PRINCE), 10 * 60 * 1000);
  assert.equal(getVipStackCapacity(VIP_TIER.KING), 14 * 60 * 1000);
  assert.equal(getVipStackCapacity(VIP_TIER.EMPEROR), 20 * 60 * 1000);
  assert.equal(getVipStackCapacity(VIP_TIER.EMPEROR, false), null);
});

test('King and Emperor receive premium tier privileges', () => {
  assert.equal(isPremiumTier(VIP_TIER.PREMIUM), true);
  assert.equal(isPremiumTier(VIP_TIER.VIP), false);
  assert.equal(isPremiumTier(VIP_TIER.NONE), false);
  assert.equal(isPremiumTier(VIP_TIER.EMPEROR), true);
});

test('King gets 7x7 brushes and Emperor gets up to 10x10', () => {
  assert.equal(isVipBrushSizeAllowed(5, VIP_TIER.NONE, false), true);
  assert.equal(isVipBrushSizeAllowed(7, VIP_TIER.KING, true), true);
  assert.equal(isVipBrushSizeAllowed(9, VIP_TIER.KING, true), false);
  assert.equal(isVipBrushSizeAllowed(10, VIP_TIER.KING, true), false);
  assert.equal(isVipBrushSizeAllowed(7, VIP_TIER.KING, false), false);
  assert.equal(isVipBrushSizeAllowed(9, VIP_TIER.EMPEROR, true), true);
  assert.equal(isVipBrushSizeAllowed(10, VIP_TIER.EMPEROR, true), true);
  assert.equal(isVipBrushSizeAllowed(10, VIP_TIER.NONE, true), false);
  assert.equal(isVipBrushSizeAllowed(11, VIP_TIER.EMPEROR, true), false);
  assert.deepEqual(getVipBrushSizes(VIP_TIER.KING), [1, 3, 5, 7]);
  assert.deepEqual(getVipBrushSizes(VIP_TIER.EMPEROR), [1, 3, 5, 7, 9, 10]);
});

test(
  'VIP duration accepts bounded permanent, day, hour, and minute values',
  async () => {
    const { parseVipDuration } = await import('./vip.js');
    assert.equal(parseVipDuration('permanent'), null);
    assert.equal(parseVipDuration('30d'), 30 * 86400000);
    assert.equal(parseVipDuration('12h'), 12 * 3600000);
    assert.equal(parseVipDuration('45m'), 45 * 60000);
    assert.equal(parseVipDuration('3651d'), undefined);
    assert.equal(parseVipDuration('-1d'), undefined);
  },
);
