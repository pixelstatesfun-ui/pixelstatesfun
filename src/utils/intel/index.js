/*
 * utils for informations regarding ip and email
 */
import ProxyCheck from './ProxyCheck.js';
import whois from './whois.js';
import socketEvents from '../../socket/socketEvents.js';
import { getLowHexSubnetOfIP } from './ip.js';
import {
  saveIPIntel,
  getProviderOfIP,
  getRangeOfIP,
  getWhoisHostOfIP,
  getProxCheckHistory,
} from '../../data/sql/IP.js';
import { queue } from '../queue.js';
import {
  USE_PROXYCHECK, PROXYCHECK_KEY, WHOIS_DURATION, USE_IPQS_DB,
  IPQS_DB_CACHE_MS,
} from '../../core/config.js';
import { DO_NOTHING, PROXY_FLAGS } from '../../core/constants.js';
import { lookupIPQS } from './IPQSDB.js';
import { getIPQSConnectionType } from './risk.js';
import {
  checkExternalProxyProviders, summarizeProxyVotes,
} from './ExternalProxyChecks.js';

let proxyChecker = () => null;
let mailChecker = () => null;

if (USE_PROXYCHECK && PROXYCHECK_KEY && !USE_IPQS_DB) {
  const pc = new ProxyCheck(PROXYCHECK_KEY);
  proxyChecker = pc.checkIp;
  // eslint-disable-next-line no-unused-vars
  mailChecker = pc.checkEmail;
}

function ipqsToProxyData(ipqsResult) {
  const nowTs = Date.now();
  if (!ipqsResult.found) {
    return {
      isProxy: 0,
      expiresTs: nowTs + IPQS_DB_CACHE_MS,
      source: 'IPQS local database',
      providerVote: {
        name: 'IPQS',
        status: 'unavailable',
        flagged: false,
        detail: 'IP not found in local database',
      },
      ipqs: { found: false },
    };
  }

  const { record } = ipqsResult;
  const type = getIPQSConnectionType(record);
  const isDataCenter = type === 'Data Center';
  const flagged = !!(record.isProxy || record.isVPN || record.isTOR
    || record.activeVPN || record.activeTOR);
  const hostingOnly = !flagged && (record.isHostingProvider || isDataCenter);

  return {
    isProxy: 0,
    type,
    operator: record.organization || record.isp || null,
    city: record.city || null,
    risk: record.fraudScore,
    confidence: null,
    repetition: 0,
    expiresTs: nowTs + IPQS_DB_CACHE_MS,
    source: 'IPQS local database',
    providerVote: {
      name: 'IPQS',
      status: flagged ? 'proxy' : hostingOnly ? 'context' : 'clean',
      flagged,
      type,
      detail: [
        `connection=${type}`,
        `proxy=${!!record.isProxy}`,
        `vpn=${!!record.isVPN}`,
        `tor=${!!record.isTOR}`,
      ].join(','),
    },
    ipqs: { found: true, ...record, isDataCenter },
  };
}

async function getPrimaryProxyData(ipString) {
  if (USE_IPQS_DB) {
    try {
      const result = await lookupIPQS(ipString);
      return ipqsToProxyData(result);
    } catch (error) {
      console.error(`IPQS reputation lookup failed: ${error.message}`);
      return null;
    }
  }

  if (USE_PROXYCHECK && PROXYCHECK_KEY) {
    try {
      return await proxyChecker(ipString);
    } catch (error) {
      console.error(`ProxyCheck reputation lookup failed: ${error.message}`);
    }
  }
  return null;
}

async function proxyCheckWithStorage(ipString) {
  const [history, primaryData, externalVotes] = await Promise.all([
    getProxCheckHistory(ipString),
    getPrimaryProxyData(ipString),
    checkExternalProxyProviders(ipString),
  ]);
  const primaryVote = primaryData?.providerVote || {
    name: USE_IPQS_DB ? 'IPQS' : 'ProxyCheck',
    status: 'unavailable',
    flagged: false,
    detail: USE_IPQS_DB || (USE_PROXYCHECK && PROXYCHECK_KEY)
      ? 'provider lookup failed' : 'provider is not configured',
  };
  const votes = [primaryVote, ...externalVotes];
  const summary = summarizeProxyVotes(votes);
  const repetition = history?.verdict === summary.verdict
    ? history.repetition + 1 : 0;
  const fallbackVote = votes.find((vote) => vote.type);

  return {
    ...primaryData,
    isProxy: summary.verdict === 'proxy'
      ? 1 << PROXY_FLAGS.PROXY : 0,
    proxyVerdict: summary.verdict,
    providerVotes: summary,
    providerVote: undefined,
    source: primaryData?.source || 'Three-provider reputation check',
    type: primaryData?.type || fallbackVote?.type || null,
    risk: primaryData?.risk ?? null,
    confidence: primaryData?.confidence ?? null,
    repetition,
    expiresTs: Date.now() + 10 * 60 * 1000,
  };
}

/**
 * get whois informatino of IP, lookup SQL for data first
 * return is euqal to whoisData, but with optional additional range id and
 * expires date
 * @param ipString ip as string
 * @return null | {
 *   [rid]: id of range,
 *   [expiresTs]: timestamp when data expires,
 *   range as [start: hex, end: hex, mask: number],
 *   org as string,
 *   descr as string,
 *   asn as unsigned 32bit integer,
 *   country as two letter lowercase code,
 *   referralHost as string,
 *   referralRange as [start: hex, end: hex, mask: number],
 * }
 */
async function whoisWithStorage(ipString) {
  /* request range from SQL first */
  let whoisData = await getRangeOfIP(ipString);
  if (whoisData) {
    if (whoisData.expires) {
      whoisData.expiresTs = whoisData.expires.getTime();
      delete whoisData.expires;
    }
    return whoisData;
  }
  const whoisOptions = {};
  /* check if we have a whois server stored */
  const host = await getWhoisHostOfIP(ipString);
  if (host) whoisOptions.host = host;
  whoisData = await whois(ipString, whoisOptions);
  if (whoisData?.country === 'zz') {
    whoisData.country = 'fa';
  }
  return whoisData;
}

/**
 * Get IP intel (whois and proxy reputation)
 * @param ipString ip as string
 * @param whoisNeeded if we shouldfetch whois
 * @param proxyCheckNeeded if we should fetch proxycheck
 * @return Promise<[null | {
 *   expiresTs: timestamp when data expires,
 *   range as [start: hex, end: hex, mask: number],
 *   org as string,
 *   descr as string,
 *   asn as unsigned 32bit integer,
 *   country as two letter lowercase code,
 *   referralHost as string,
 *   referralRange as [start: hex, end: hex, mask: number],
 * }, null | {
 *   expiresTs: timestamp when data expires,
 *   isProxy: type of proxy, 0 if none,
 *   type: Residential, Wireless, VPN, SOCKS,...,
 *   operator: name of proxy operator if available,
 *   city: name of city,
 *   repetition: number of how many times we encountered the same result,
 *   devices: amount of devices using this ip,
 *   risk: score of risk,
 *   confidence: percentage of confidence,
 *   subnetDevices: amount of devices in this subnet,
 * }]>
 */
export const getIPIntel = queue(async (
  ipString, whoisNeeded, proxyCheckNeeded,
) => {
  /* if neither whois or proxycheck needed are given, get both */
  // eslint-disable-next-line eqeqeq
  if (whoisNeeded == null && proxyCheckNeeded == null) {
    whoisNeeded = true;
    proxyCheckNeeded = true;
  }

  let [whoisData, proxyCheckData] = await Promise.all([
    (whoisNeeded) ? whoisWithStorage(ipString) : null,
    (proxyCheckNeeded) ? proxyCheckWithStorage(ipString) : null,
  ]);

  const nowTs = Date.now();
  const ipqsRecord = proxyCheckData?.ipqs;
  const ipqsCountry = ipqsRecord?.country?.toLowerCase();
  if (whoisNeeded && USE_IPQS_DB && ipqsRecord?.found
    && /^[a-z]{2}$/.test(ipqsCountry || '')
  ) {
    const range = whoisData?.range || getLowHexSubnetOfIP(ipString);
    if (range) {
      whoisData = {
        ...whoisData,
        range,
        country: ipqsCountry,
        org: ipqsRecord.organization || ipqsRecord.isp || null,
        descr: ipqsRecord.isp || null,
        asn: ipqsRecord.asn || null,
        expiresTs: nowTs + IPQS_DB_CACHE_MS,
      };
    }
  }

  /* if we couldn't fetch something, store placeholder */
  if (whoisNeeded && !whoisData) {
    const placeholderRange = getLowHexSubnetOfIP(ipString);
    if (!placeholderRange) {
      console.error(`${ipString} is not valid`);
    } else {
      whoisData = {
        range: placeholderRange,
        expiresTs: nowTs + 24 * 3600 * 1000,
      };
    }
  }
  if (proxyCheckNeeded && !proxyCheckData) {
    proxyCheckData = {
      isProxy: 0,
      expiresTs: nowTs + 900 * 1000,
    };
  }

  /* add expiration if not set */
  if (whoisData && !whoisData.expiresTs) {
    whoisData.expiresTs = nowTs + WHOIS_DURATION * 3600 * 1000;
  }
  if (proxyCheckData && !proxyCheckData.expiresTs) {
    proxyCheckData.expiresTs = nowTs + 600 * 1000;
  }

  await saveIPIntel(ipString, whoisData, proxyCheckData);

  if (whoisData?.rid) {
    delete whoisData.rid;
  }

  return [whoisData, proxyCheckData];
});

// eslint-disable-next-line no-unused-vars
const disposableEmailDomainCache = new Map([
  ['aminating.com', true],
  ['fuckmeuwu.shop', true],
  ['pindush.net', true],
]);

export const checkMail = queue(async (email) => {
  if (!email) {
    return false;
  }
  const domain = email.substring(email.lastIndexOf('@') + 1);
  const tld = domain.substring(domain.lastIndexOf('.') + 1);
  if (tld === 'sbs' || tld === 'cyou') {
    return true;
  }
  if (domain.endsWith('okcx.edu.rs')
    || domain.endsWith('pindush.net')
    || domain.endsWith('noriina.shop')
  ) {
    return true;
  }
  if (![
    'gmail.com', 'outlook.com', 'yandex.ru', 'yandex.com', 'protonmail.com',
    'proton.me', 'proton.com', 'hotmail.com', 'icloud.com', 'mail.com',
    'googlemail.com', 'esponamail.com', 'windowslive.com',
  ].includes(domain)) {
    return true;
  }
  return false;
  /*
   * deactivated because we have whitelist now
   * TODO: enable it again
  const cache = disposableEmailDomainCache.get(domain);
  if (cache) {
    return cache;
  }
  if (disposableEmailDomainCache.size > 10) {
    disposableEmailDomainCache.clear();
  }
  const isDisposable = await mailChecker(email);
  if (isDisposable) {
    disposableEmailDomainCache.set(domain, true);
  }
  return isDisposable;
  */
});

/*
 * the following is for shards,
 * only the main shard shall handle proxycheck and whois requests, other shards
 * request it from him and wait for an answer.
 */

/* answer on request if main shard */
socketEvents.onReq('ipintel', (...args) => {
  if (socketEvents.important) {
    return getIPIntel(...args).catch((error) => { console.error('IP intel lookup failed:', error.message); return [null, { isProxy: 0, expiresTs: Date.now() + 900000 }]; });
  }
  return DO_NOTHING;
});

socketEvents.onReq('mailintel', (...args) => {
  if (socketEvents.important) {
    console.log('MAILINTEL ARGS', args);
    return checkMail(...args);
  }
  return DO_NOTHING;
});

/* send request */
// eslint-disable-next-line max-len
export const getIPIntelOverShards = queue((...args) => socketEvents.req('ipintel', ...args));

// eslint-disable-next-line max-len
export const checkMailOverShards = queue((...args) => socketEvents.req('mailintel', ...args));

/**
 * check if two IPs have the same provider
 * @param ipStringA
 * @param ipStringB
 * @return boolean if same provider, if in doubt, true
 */
export async function checkIfSameProvider(ipStringA, ipStringB) {
  if (ipStringA === ipStringB) {
    return true;
  }
  let [providerA, providerB] = await Promise.all([
    getProviderOfIP(ipStringA),
    getProviderOfIP(ipStringB),
  ]);
  [providerA, providerB] = await Promise.all([
    providerA || getIPIntelOverShards(ipStringA, true, false),
    providerB || getIPIntelOverShards(ipStringB, true, false),
  ]);
  if (!providerA || !providerB || !providerA.asn || !providerB.asn
    || providerA.asn === providerB.asn || (
    providerA.org && providerA.org === providerB.org
  )
  ) {
    return true;
  }
  /*
   * some providers really are weird and hand out IPs of different ASNs
   * who also have a different org
   */
  const sameProvider = [
    [9141, 39603], [9050, 8708], [52361, 7303], [5483, 1955], [26599, 267336],
    [48503, 9198], [9121, 16135], [15897, 211709], [12361, 3329], [43612, 6821],
  ];
  for (let i = 0; i < sameProvider.length; i += 1) {
    const [asnA, asnB] = sameProvider[i];
    if ((providerA.asn === asnA && providerB.asn === asnB)
      || (providerA.asn === asnB && providerB.asn === asnA)
    ) {
      return true;
    }
  }
  return false;
}
