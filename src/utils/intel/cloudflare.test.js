import test from 'node:test';
import assert from 'node:assert/strict';

import { getVisitorIPFromRequest } from './cloudflare.js';

test('falls back to the socket IP when Cloudflare headers are missing', () => {
  const req = {
    headers: {
      'cf-ray': 'abc123',
    },
    socket: {
      remoteAddress: '203.0.113.21',
    },
    connection: {
      remoteAddress: '203.0.113.21',
    },
  };

  assert.equal(getVisitorIPFromRequest(req), '203.0.113.21');
});

test('keeps rejecting Cloudflare ranges as invalid direct visitors', () => {
  const req = {
    headers: {
      'cf-ray': 'abc123',
    },
    socket: {
      remoteAddress: '173.245.48.10',
    },
    connection: {
      remoteAddress: '173.245.48.10',
    },
  };

  assert.equal(getVisitorIPFromRequest(req), null);
});
