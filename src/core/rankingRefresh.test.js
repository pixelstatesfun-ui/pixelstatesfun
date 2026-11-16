import test from 'node:test';
import assert from 'node:assert/strict';

import { shouldRefreshRankings } from './rankingRefresh.js';

test('refreshes rankings when stale for at least 5 minutes', () => {
  const lastStatsFetch = 1_000_000;
  const now = lastStatsFetch + 300_000;

  assert.equal(shouldRefreshRankings(lastStatsFetch, now), true);
});

test('does not refresh rankings before 5 minutes have passed', () => {
  const lastStatsFetch = 1_000_000;
  const now = lastStatsFetch + 299_999;

  assert.equal(shouldRefreshRankings(lastStatsFetch, now), false);
});
