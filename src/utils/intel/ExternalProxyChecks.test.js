import test from 'node:test';
import assert from 'node:assert/strict';

import {
  checkIPAPIIs, checkIPInfo, checkIPLogs, checkShodanInternetDB,
  checkTorExitList, checkExternalProxyProviders, summarizeProxyVotes,
} from './ExternalProxyChecks.js';

function mockResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  };
}

test('proxy verdict requires two provider votes', () => {
  assert.equal(summarizeProxyVotes([
    { name: 'primary', status: 'proxy', flagged: true },
    { name: 'ipinfo', status: 'proxy', flagged: true },
    { name: 'iplogs', status: 'clean', flagged: false },
  ]).verdict, 'proxy');

  assert.equal(summarizeProxyVotes([
    { name: 'primary', status: 'clean', flagged: false },
    { name: 'ipinfo', status: 'clean', flagged: false },
    { name: 'iplogs', status: 'proxy', flagged: true },
  ]).verdict, 'clean');

  assert.equal(summarizeProxyVotes([
    { name: 'primary', status: 'proxy', flagged: true },
    { name: 'ipinfo', status: 'clean', flagged: false },
  ]).verdict, 'uncertain');

  assert.equal(summarizeProxyVotes([
    { name: 'proxy-a', status: 'proxy', flagged: true },
    { name: 'proxy-b', status: 'proxy', flagged: true },
    { name: 'clean-a', status: 'clean', flagged: false },
    { name: 'clean-b', status: 'clean', flagged: false },
    { name: 'clean-c', status: 'clean', flagged: false },
  ]).verdict, 'clean');
});

test('a curated Tor exit-list hit is a strong proxy signal', () => {
  const summary = summarizeProxyVotes([
    {
      name: 'Tor Exit List',
      status: 'proxy',
      flagged: true,
      strong: true,
    },
    { name: 'ipinfo', status: 'clean', flagged: false },
  ]);
  assert.equal(summary.verdict, 'proxy');
  assert.equal(summary.strong, true);
});

test('missing or unavailable provider results do not count as votes', () => {
  const summary = summarizeProxyVotes([
    { name: 'primary', status: 'unavailable', flagged: false },
    { name: 'ipinfo', status: 'proxy', flagged: true },
  ]);
  assert.equal(summary.verdict, 'uncertain');
  assert.equal(summary.answered, 1);

  assert.equal(summarizeProxyVotes([
    { name: 'primary', status: 'unavailable', flagged: false },
    { name: 'ipinfo', status: 'unavailable', flagged: false },
  ]).verdict, 'unknown');
});

test('IPinfo classifications are normalized and unknown values are unavailable', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => mockResponse({
    classification: ' Privacy_Relay ',
    confidence: 0.93,
  });
  try {
    assert.equal((await checkIPInfo('192.0.2.10')).status, 'proxy');
  } finally {
    globalThis.fetch = originalFetch;
  }

  globalThis.fetch = async () => mockResponse({
    classification: 'unknown',
  });
  try {
    assert.equal((await checkIPInfo('192.0.2.11')).status, 'unavailable');
  } finally {
    globalThis.fetch = originalFetch;
  }

  globalThis.fetch = async () => mockResponse({
    classification: 'hosting',
    confidence: 0.97,
  });
  try {
    assert.equal((await checkIPInfo('198.51.100.15')).status, 'context');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('iplogs only accepts recognized top-level boolean or yes/no signals', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => mockResponse({
    isVPN: 'yes',
    tor: false,
    unrelated: { proxy: true },
  });
  try {
    assert.equal((await checkIPLogs('192.0.2.12')).status, 'proxy');
  } finally {
    globalThis.fetch = originalFetch;
  }

  globalThis.fetch = async () => mockResponse({
    proxy: 'not-sure',
    details: { vpn: true },
  });
  try {
    assert.equal((await checkIPLogs('192.0.2.13')).status, 'unavailable');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('provider HTTP and JSON failures are reported as unavailable', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => mockResponse({}, 503);
  try {
    assert.equal((await checkIPInfo('192.0.2.14')).status, 'unavailable');
  } finally {
    globalThis.fetch = originalFetch;
  }

  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    text: async () => '{invalid json',
  });
  try {
    assert.equal((await checkIPLogs('192.0.2.15')).status, 'unavailable');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('ipapi.is treats hosting as context and only votes on proxy signals', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => mockResponse({
    is_bogon: false,
    is_datacenter: true,
    is_tor: false,
    is_proxy: false,
    is_vpn: false,
  });
  try {
    assert.equal((await checkIPAPIIs('1.1.1.1')).status, 'context');
  } finally {
    globalThis.fetch = originalFetch;
  }

  globalThis.fetch = async () => mockResponse({
    is_bogon: false,
    is_datacenter: false,
    is_tor: true,
    is_proxy: false,
    is_vpn: false,
  });
  try {
    const vote = await checkIPAPIIs('1.0.0.1');
    assert.equal(vote.status, 'proxy');
    assert.equal(vote.type, 'tor');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Shodan votes only on known proxy tags or listener ports', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => mockResponse({
    tags: ['cloud'],
    ports: [22, 1080],
  });
  try {
    assert.equal((await checkShodanInternetDB('9.9.9.9')).status, 'proxy');
  } finally {
    globalThis.fetch = originalFetch;
  }

  globalThis.fetch = async () => mockResponse({
    tags: ['cloud'],
    ports: [22, 443],
  });
  try {
    assert.equal((await checkShodanInternetDB('8.8.8.8')).status, 'clean');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Tor exit-list hits are cached and produce a proxy vote', async () => {
  const originalFetch = globalThis.fetch;
  let requestCount = 0;
  globalThis.fetch = async () => {
    requestCount += 1;
    return {
      ok: true,
      status: 200,
      text: async () => '# comment\n9.9.9.8\ninvalid-address\n',
    };
  };
  try {
    const vote = await checkTorExitList('9.9.9.8');
    assert.equal(vote.status, 'proxy');
    assert.equal(vote.type, 'tor');
    assert.equal((await checkTorExitList('9.9.9.7')).status, 'clean');
    assert.equal(requestCount, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('external lookups skip private IPs and coalesce concurrent requests', async () => {
  const originalFetch = globalThis.fetch;
  let requestCount = 0;
  globalThis.fetch = async (url) => {
    requestCount += 1;
    if (url.includes('torbulkexitlist')) {
      return {
        ok: true,
        status: 200,
        text: async () => '9.9.9.9\n',
      };
    }
    if (url.includes('blackbox.ipinfo')) {
      return mockResponse({ classification: 'residential' });
    }
    if (url.includes('iplogs.com')) {
      return mockResponse({ proxy: false });
    }
    if (url.includes('ipapi.is')) {
      return mockResponse({
        is_bogon: false,
        is_datacenter: false,
        is_tor: false,
        is_proxy: false,
        is_vpn: false,
      });
    }
    return mockResponse({ tags: [], ports: [] });
  };
  try {
    const privateResults = await checkExternalProxyProviders('192.168.1.2');
    assert.equal(requestCount, 0);
    assert.equal(
      privateResults.every((vote) => vote.status === 'unavailable'),
      true,
    );
    await checkExternalProxyProviders('::ffff:7f00:1');
    assert.equal(requestCount, 0);

    const results = await Promise.all([
      checkExternalProxyProviders('9.9.9.9'),
      checkExternalProxyProviders('9.9.9.9'),
    ]);
    assert.equal(requestCount, 4);
    assert.deepEqual(results[0], results[1]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('provider request concurrency is bounded', async () => {
  const originalFetch = globalThis.fetch;
  let activeRequests = 0;
  let peakRequests = 0;
  globalThis.fetch = async (url) => {
    activeRequests += 1;
    peakRequests = Math.max(peakRequests, activeRequests);
    await new Promise((resolve) => setTimeout(resolve, 1));
    activeRequests -= 1;
    if (url.includes('torbulkexitlist')) {
      return {
        ok: true,
        status: 200,
        text: async () => '9.9.9.9\n',
      };
    }
    if (url.includes('blackbox.ipinfo')) {
      return mockResponse({ classification: 'residential' });
    }
    if (url.includes('iplogs.com')) {
      return mockResponse({ proxy: false });
    }
    if (url.includes('ipapi.is')) {
      return mockResponse({
        is_bogon: false,
        is_datacenter: false,
        is_tor: false,
        is_proxy: false,
        is_vpn: false,
      });
    }
    return mockResponse({ tags: [], ports: [] });
  };
  try {
    await Promise.all(Array.from({ length: 30 }, (_, index) => (
      checkExternalProxyProviders(`8.8.4.${index + 1}`)
    )));
    assert.ok(peakRequests <= 20);
    assert.ok(peakRequests > 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('hosting context does not count as proxy or clean consensus', () => {
  const summary = summarizeProxyVotes([
    { name: 'hosting provider', status: 'context', flagged: false },
    { name: 'unavailable', status: 'unavailable', flagged: false },
  ]);
  assert.equal(summary.verdict, 'uncertain');
  assert.equal(summary.answered, 0);
  assert.equal(summary.context, 1);
});
