import test from 'node:test';
import assert from 'node:assert/strict';

import MassRateLimiter from './MassRateLimiter.js';

MassRateLimiter.cleaningInterval.unref();

test('custom threshold gives normal request bursts more headroom', () => {
  const realNow = Date.now;
  Date.now = () => 100000;
  try {
    const limiter = new MassRateLimiter(5 * 60 * 1000, 2 * 60 * 1000);
    let triggered = false;
    const onTrigger = () => { triggered = true; };

    limiter.tick('client', 1000, null, onTrigger);
    for (let index = 0; index < 119; index += 1) {
      limiter.tick('client', 1000, null, onTrigger);
    }
    assert.equal(triggered, false);

    limiter.tick('client', 1000, null, onTrigger);
    assert.equal(triggered, true);
    assert.equal(limiter.isTriggered('client'), true);
  } finally {
    Date.now = realNow;
  }
});

test('default threshold remains unchanged for other limiter users', () => {
  const limiter = new MassRateLimiter(60 * 60 * 1000);
  assert.equal(limiter.maxBurstDebt, 60000);
});
