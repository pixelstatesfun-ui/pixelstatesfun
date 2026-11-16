import { BlockList, isIP } from 'node:net';
import { IPAPIIS_KEY } from '../../core/config.js';

const REQUEST_TIMEOUT_MS = 8000;
const MAX_RESPONSE_LENGTH = 64 * 1024;
const MAX_CONCURRENT_REQUESTS = 20;
const PROXY_CLASSES = new Set([
  'privacy_relay',
  'tor',
  'vpn',
]);
const CONTEXT_CLASSES = new Set(['hosting']);
const CLEAN_CLASSES = new Set([
  'business',
  'mobile',
  'residential',
]);
const PRIVATE_IPS = new BlockList();
[
  ['0.0.0.0', 8, 'ipv4'],
  ['10.0.0.0', 8, 'ipv4'],
  ['100.64.0.0', 10, 'ipv4'],
  ['127.0.0.0', 8, 'ipv4'],
  ['169.254.0.0', 16, 'ipv4'],
  ['172.16.0.0', 12, 'ipv4'],
  ['192.0.0.0', 24, 'ipv4'],
  ['192.0.2.0', 24, 'ipv4'],
  ['192.168.0.0', 16, 'ipv4'],
  ['198.18.0.0', 15, 'ipv4'],
  ['198.51.100.0', 24, 'ipv4'],
  ['203.0.113.0', 24, 'ipv4'],
  ['224.0.0.0', 4, 'ipv4'],
  ['240.0.0.0', 4, 'ipv4'],
  ['::', 128, 'ipv6'],
  ['::1', 128, 'ipv6'],
  ['fc00::', 7, 'ipv6'],
  ['fe80::', 10, 'ipv6'],
  ['2001:db8::', 32, 'ipv6'],
].forEach(([address, prefix, family]) => {
  PRIVATE_IPS.addSubnet(address, prefix, family);
});
const PROXY_KEYS = new Set(['proxy', 'is_proxy', 'isproxy']);
const VPN_KEYS = new Set(['vpn', 'is_vpn', 'isvpn']);
const TOR_KEYS = new Set(['tor', 'is_tor', 'istor']);
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_LIMIT = 20000;
const resultCache = new Map();
const pendingChecks = new Map();
const requestWaiters = [];
let activeRequests = 0;
const TOR_EXIT_LIST_URL = 'https://check.torproject.org/torbulkexitlist';
const TOR_EXIT_LIST_TTL_MS = 6 * 60 * 60 * 1000;
const TOR_EXIT_LIST_RETRY_MS = 2 * 60 * 1000;
let torExitList = null;
let torExitListLoadedAt = 0;
let torExitListLastAttempt = 0;
let torExitListRefresh;

async function limitedFetch(url, options) {
  if (activeRequests >= MAX_CONCURRENT_REQUESTS) {
    await new Promise((resolve) => requestWaiters.push(resolve));
  }
  activeRequests += 1;
  try {
    return await fetch(url, options);
  } finally {
    activeRequests -= 1;
    requestWaiters.shift()?.();
  }
}

function isPrivateAddress(ip, family) {
  if (family === 4) {
    return PRIVATE_IPS.check(ip, 'ipv4');
  }
  if (ip.toLowerCase().startsWith('::ffff:')) {
    const mapped = ip.slice(7);
    if (isIP(mapped) === 4) {
      return PRIVATE_IPS.check(mapped, 'ipv4');
    }
    const parts = mapped.split(':');
    if (parts.length === 2 && parts.every((part) => (
      /^[\da-f]{1,4}$/i.test(part)
    ))) {
      const high = Number.parseInt(parts[0], 16);
      const low = Number.parseInt(parts[1], 16);
      const mappedIPv4 = [
        high >> 8, high & 0xff, low >> 8, low & 0xff,
      ].join('.');
      return PRIVATE_IPS.check(mappedIPv4, 'ipv4');
    }
  }
  return PRIVATE_IPS.check(ip, 'ipv6');
}

function unavailable(name, detail) {
  return {
    name,
    status: 'unavailable',
    flagged: false,
    detail,
  };
}

function answered(name, flagged, detail, type = null, strong = false) {
  return {
    name,
    status: flagged ? 'proxy' : 'clean',
    flagged,
    detail,
    type,
    strong,
  };
}

function contextual(name, detail, type) {
  return {
    name,
    status: 'context',
    flagged: false,
    detail,
    type,
  };
}

async function readLimitedBody(response, maxLength) {
  const contentLength = Number(response.headers?.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > maxLength) {
    return null;
  }
  if (!response.body?.getReader) {
    const body = await response.text();
    return body.length <= maxLength ? body : null;
  }

  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    length += value.byteLength;
    if (length > maxLength) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const body = new Uint8Array(length);
  let offset = 0;
  chunks.forEach((chunk) => {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  });
  return new TextDecoder().decode(body);
}

async function requestJson(name, url, options) {
  let response;
  let body;
  try {
    response = await limitedFetch(url, {
      ...options,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      return { error: `HTTP ${response.status}` };
    }
    body = await readLimitedBody(response, MAX_RESPONSE_LENGTH);
  } catch (error) {
    console.warn(`Proxy reputation provider ${name} request failed: ${error.name}`);
    return { error: error.name === 'TimeoutError'
      ? 'request timeout' : 'network error' };
  }
  if (body === null) {
    return { error: 'response too large' };
  }
  try {
    return { data: JSON.parse(body) };
  } catch {
    console.warn(`Proxy reputation provider ${name} returned invalid JSON`);
    return { error: 'invalid JSON' };
  }
}

function extractIpLogsSignals(value) {
  const signals = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return signals;
  }
  Object.entries(value).forEach(([key, entry]) => {
    const normalizedKey = key.toLowerCase().replace(/[-\s]/g, '_');
    const validKey = PROXY_KEYS.has(normalizedKey)
      || VPN_KEYS.has(normalizedKey)
      || TOR_KEYS.has(normalizedKey);
    if (!validKey) {
      return;
    }
    if (typeof entry === 'boolean') {
      signals.push({ key: normalizedKey, value: entry });
    } else if (typeof entry === 'string') {
      const normalizedValue = entry.trim().toLowerCase();
      if (normalizedValue === 'yes' || normalizedValue === 'true') {
        signals.push({ key: normalizedKey, value: true });
      } else if (normalizedValue === 'no' || normalizedValue === 'false') {
        signals.push({ key: normalizedKey, value: false });
      }
    }
  });
  return signals;
}

export async function checkIPInfo(ip) {
  const name = 'ipinfo';
  const url = `https://blackbox.ipinfo.app/api/v3beta/${encodeURIComponent(ip)}`;
  const result = await requestJson(name, url);
  if (result.error) {
    return unavailable(name, result.error);
  }

  const { data } = result;
  const classification = String(data?.classification || '')
    .trim().toLowerCase();
  if (data?.error || (!PROXY_CLASSES.has(classification)
    && !CONTEXT_CLASSES.has(classification)
    && !CLEAN_CLASSES.has(classification))
  ) {
    return unavailable(name, 'no usable classification');
  }

  const confidence = Number.isFinite(data.confidence)
    ? Math.round(data.confidence * 100) : 'unknown';
  const detail = `classification=${classification} confidence=${confidence}%`;
  if (CONTEXT_CLASSES.has(classification)) {
    return contextual(name, detail, classification);
  }
  return answered(
    name, PROXY_CLASSES.has(classification), detail, classification,
  );
}

export async function checkIPLogs(ip) {
  const name = 'iplogs';
  const result = await requestJson(name, 'https://iplogs.com/v1/check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ip }),
  });
  if (result.error) {
    return unavailable(name, result.error);
  }

  const signals = extractIpLogsSignals(result.data);
  if (!signals.length) {
    return unavailable(name, 'no usable proxy signals');
  }

  const flagged = signals.some((signal) => signal.value);
  const summary = signals.map(({ key, value }) => `${key}=${value}`).join(',');
  return answered(name, flagged, summary);
}

export async function checkIPAPIIs(ip) {
  const name = 'ipapi.is';
  const url = new URL('https://api.ipapi.is/');
  url.searchParams.set('q', ip);
  if (IPAPIIS_KEY) {
    url.searchParams.set('key', IPAPIIS_KEY);
  }
  const result = await requestJson(name, url.toString());
  if (result.error) {
    return unavailable(name, result.error);
  }

  const { data } = result;
  if (data?.error || data?.is_bogon) {
    return unavailable(name, 'no usable public IP result');
  }
  if (typeof data?.is_proxy !== 'boolean'
    || typeof data?.is_vpn !== 'boolean'
    || typeof data?.is_tor !== 'boolean'
    || typeof data?.is_datacenter !== 'boolean'
  ) {
    return unavailable(name, 'no usable proxy signals');
  }

  const flagged = data.is_proxy || data.is_vpn || data.is_tor;
  const detail = [
    `proxy=${data.is_proxy}`,
    `vpn=${data.is_vpn}`,
    `tor=${data.is_tor}`,
    `datacenter=${data.is_datacenter}`,
  ].join(',');
  if (data.is_datacenter && !flagged) {
    return contextual(name, detail, 'hosting');
  }
  return answered(name, flagged, detail, data.is_tor ? 'tor'
    : data.is_vpn ? 'vpn' : data.is_proxy ? 'proxy' : null);
}

export async function checkShodanInternetDB(ip) {
  const name = 'Shodan InternetDB';
  const url = `https://internetdb.shodan.io/${encodeURIComponent(ip)}`;
  let response;
  let body;
  try {
    response = await limitedFetch(url, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (response.status === 404) {
      return unavailable(name, 'IP not indexed');
    }
    if (!response.ok) {
      return unavailable(name, `HTTP ${response.status}`);
    }
    body = await readLimitedBody(response, MAX_RESPONSE_LENGTH);
  } catch (error) {
    console.warn(`Proxy reputation provider ${name} request failed: ${error.name}`);
    return unavailable(name, error.name === 'TimeoutError'
      ? 'request timeout' : 'network error');
  }
  if (body === null) {
    return unavailable(name, 'response too large');
  }

  let data;
  try {
    data = JSON.parse(body);
  } catch {
    console.warn(`Proxy reputation provider ${name} returned invalid JSON`);
    return unavailable(name, 'invalid JSON');
  }
  if (!Array.isArray(data?.tags) || !Array.isArray(data?.ports)) {
    return unavailable(name, 'no usable proxy signals');
  }

  const tags = new Set(data.tags.map((tag) => String(tag).toLowerCase()));
  const proxyPorts = new Set([
    1080, 1081, 3128, 3129, 4145, 8118, 8888, 9050, 9150,
  ]);
  const matchedPorts = data.ports.filter((port) => proxyPorts.has(port));
  const isTor = tags.has('tor');
  const isVPN = tags.has('vpn');
  const flagged = isTor || isVPN || tags.has('proxy')
    || matchedPorts.length > 0;
  const tagSummary = [...tags].join(',') || 'none';
  const portSummary = matchedPorts.join(',') || 'none';
  const detail = `tags=${tagSummary} proxy_ports=${portSummary}`;
  return answered(name, flagged, detail, isTor ? 'tor'
    : isVPN ? 'vpn' : flagged ? 'proxy' : null);
}

async function loadTorExitList() {
  const now = Date.now();
  if (torExitList && now - torExitListLoadedAt < TOR_EXIT_LIST_TTL_MS) {
    return torExitList;
  }
  if (torExitListRefresh) {
    return torExitListRefresh;
  }
  if (now - torExitListLastAttempt < TOR_EXIT_LIST_RETRY_MS) {
    return torExitList;
  }

  torExitListLastAttempt = now;
  torExitListRefresh = (async () => {
    let response;
    let body;
    try {
      response = await limitedFetch(TOR_EXIT_LIST_URL, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      body = await readLimitedBody(response, MAX_RESPONSE_LENGTH);
      if (body === null) {
        throw new Error('response too large');
      }
    } catch (error) {
      console.warn(`Tor exit list refresh failed: ${error.message}`);
      return torExitList;
    }

    const addresses = new Set();
    body.split(/\r?\n/).forEach((line) => {
      const address = line.trim();
      if (isIP(address)) {
        addresses.add(address);
      }
    });
    if (addresses.size > 0) {
      torExitList = addresses;
      torExitListLoadedAt = Date.now();
    } else {
      console.warn('Tor exit list returned no valid IP addresses');
    }
    return torExitList;
  })();
  try {
    return await torExitListRefresh;
  } finally {
    torExitListRefresh = null;
  }
}

export async function checkTorExitList(ip) {
  const name = 'Tor Exit List';
  const addresses = await loadTorExitList();
  if (!addresses) {
    return unavailable(name, 'list unavailable');
  }
  const flagged = addresses.has(ip);
  return answered(name, flagged, flagged ? 'listed' : 'not listed',
    flagged ? 'tor' : null, flagged);
}

export async function checkExternalProxyProviders(ip) {
  const cached = resultCache.get(ip);
  if (cached && cached.expiresTs > Date.now()) {
    return cached.results;
  }

  const pending = pendingChecks.get(ip);
  if (pending) {
    return pending;
  }

  const pendingCheck = (async () => {
    const family = isIP(ip);
    if (!family || isPrivateAddress(ip, family)) {
      return [
        unavailable('ipinfo', 'private or invalid IP; not checked'),
        unavailable('iplogs', 'private or invalid IP; not checked'),
        unavailable('ipapi.is', 'private or invalid IP; not checked'),
        unavailable('Shodan InternetDB', 'private or invalid IP; not checked'),
        unavailable('Tor Exit List', 'private or invalid IP; not checked'),
      ];
    }

    const results = await Promise.all([
      checkIPInfo(ip),
      checkIPLogs(ip),
      checkIPAPIIs(ip),
      checkShodanInternetDB(ip),
      checkTorExitList(ip),
    ]);
    const hasUsableResult = results.some((vote) => (
      vote.status === 'proxy' || vote.status === 'clean'
      || vote.status === 'context'
    ));
    if (resultCache.size >= CACHE_LIMIT) {
      const now = Date.now();
      resultCache.forEach((entry, key) => {
        if (entry.expiresTs <= now) {
          resultCache.delete(key);
        }
      });
      if (resultCache.size >= CACHE_LIMIT) {
        resultCache.clear();
      }
    }
    resultCache.set(ip, {
      results,
      expiresTs: Date.now() + (hasUsableResult ? CACHE_TTL_MS : 60 * 1000),
    });
    return results;
  })();
  pendingChecks.set(ip, pendingCheck);
  try {
    return await pendingCheck;
  } finally {
    pendingChecks.delete(ip);
  }
}

export function summarizeProxyVotes(votes) {
  const answeredVotes = votes.filter((vote) => (
    vote.status === 'proxy' || vote.status === 'clean'
  ));
  const proxyVotes = answeredVotes.filter((vote) => vote.flagged).length;
  const cleanVotes = answeredVotes.length - proxyVotes;
  const contextualVotes = votes.filter(
    (vote) => vote.status === 'context',
  ).length;
  const hasStrongProxyVote = votes.some((vote) => (
    vote.status === 'proxy' && vote.strong
  ));
  let verdict = 'unknown';

  if (hasStrongProxyVote) {
    verdict = 'proxy';
  } else if (answeredVotes.length >= 2) {
    if (proxyVotes >= 2 && proxyVotes > cleanVotes) {
      verdict = 'proxy';
    } else if (cleanVotes >= 2 && cleanVotes > proxyVotes) {
      verdict = 'clean';
    } else {
      verdict = 'uncertain';
    }
  } else if (answeredVotes.length === 1) {
    verdict = 'uncertain';
  } else if (contextualVotes > 0) {
    verdict = 'uncertain';
  }

  return {
    verdict,
    answered: answeredVotes.length,
    proxy: proxyVotes,
    clean: cleanVotes,
    context: contextualVotes,
    strong: hasStrongProxyVote,
    sources: votes,
    summary: `${proxyVotes}/${answeredVotes.length} proxy votes`,
  };
}
