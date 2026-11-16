import test from 'node:test';
import assert from 'node:assert/strict';

delete process.env.BROWSER;
process.env.USE_XREALIP = 'true';

const { IP } = await import('./ip.js');

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

  const ip = new IP(req);
  assert.equal(ip.ipString, '203.0.113.21');
});
