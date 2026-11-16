/*
 * express middlewares for handling ip information
 */
import {
  PROXYCHECK_LOG_ONLY, USE_XREALIP, TIMEBLOCK_IPS,
} from '../core/config.js';
import {
  sanitizeIPString, ipToHex, getHostFromRequest,
} from '../utils/intel/ip.js';
import { getIPIntelOverShards } from '../utils/intel/index.js';
import { queue } from '../utils/queue.js';
import { getIPAllowance, touchIP } from '../data/sql/IP.js';
import { getIPVerification } from '../data/sql/Captcha.js';
import { parseListOfBans } from '../data/sql/Ban.js';
import {
  getVisitorIPFromRequest, isCloudflareIP,
} from '../utils/intel/cloudflare.js';
import { isConfirmedProxy } from '../utils/intel/risk.js';

const getIPAllowanceQueued = queue(getIPAllowance);

export class IP {
  /* expressjs request object */
  #req;
  /*
   * {
   *   lastSeen,
   *   isWhitelisted,
   *   isBanned,
   *   isProxy,
   *   country: two letter country code,
   *   whoisExpires: Date object for when whois expires,
   *   proxyCheckExpires: Date object for when proxycheck expires,
   * }
   */
  #allowance;
  /* null | boolean */
  isProxy = null;
  /* null | boolean */
  isBanned = null;
  /* null | boolean */
  isMuted = null;
  /* null | boolean */
  isWhitelisted = null;
  /*
   * timestamp when ban should be rechecked,
   * null means to never recheck (so if not banned or perma banned)
   */
  banRecheckTs = null;
  /*
   * if we need a captcha or challenge
   */
  captchaNeeded = true;
  challengeNeeded = true;
  /*
   * when to recheck for needed captcha or challenge
   */
  verificationRecheckTs = 0;

  constructor(req) {
    this.#req = req;
  }

  /**
   * @return ip as string, IPv6 cut to 64bit block
   */
  get ipString() {
    const req = this.#req;
    let ipString;
    if (USE_XREALIP) {
      ipString = getVisitorIPFromRequest(req);
    }
    if (!ipString) {
      const remoteAddress = req.socket?.remoteAddress
        || req.connection.remoteAddress;
      if (!isCloudflareIP(remoteAddress)) {
        ipString = remoteAddress;
      }
    }
    if (!ipString || isCloudflareIP(ipString)) {
      return null;
    }
    ipString = sanitizeIPString(ipString);
    Object.defineProperty(this, 'ipString', { value: ipString });
    return ipString;
  }

  /**
   * @return null | string blockedInterval, blocked users can not see the
   * canvas during defined daytime, but see a message instead and can interact
   * with chat
   */
  get blockedInterval() {
    let blockedInterval;
    if (TIMEBLOCK_IPS) {
      const timeBlockProps = TIMEBLOCK_IPS.get(this.ipString);
      if (timeBlockProps) {
        [blockedInterval] = timeBlockProps;
      }
    } else {
      blockedInterval = null;
    }
    Object.defineProperty(this, 'blockedInterval', { value: blockedInterval });
    return blockedInterval;
  }

  /**
   * @return ip as hex string, IPv6 cut to 64bit block
   */
  get ipHex() {
    return ipToHex(this.ipString);
  }

  /**
   * @return ip as Number (IPv4) or BigInt (IPv6)
   */
  get ipNum() {
    const ipHex = `0x${this.ipHex}`;
    return (ipHex.lengh > 10) ? BigInt(ipHex) : Number(ipHex);
  }

  /**
   * @return lower case two letter country code of ip if given by header
   */
  get country() {
    const cc = this.#req.headers['cf-ipcountry'];
    if (typeof cc === 'string' && /^[a-z]{2}$/i.test(cc)) {
      return cc.toLowerCase();
    }
    /*
     * in case ttag middleware is loaded, get country of language
     */
    return this.#req.langCountry || 'xx';
  }

  toString() {
    return this.ipString;
  }

  toHex() {
    return this.ipHex;
  }

  toNum() {
    return this.ipNum;
  }

  /**
   * get host
   * @param includeProto include the http:// part (default true)
   * @param stripSub strip subdomains and heep the dot (default: false)
   * @return host from request
   */
  getHost(includeProto, stripSub) {
    return getHostFromRequest(this.#req, includeProto, stripSub);
  }

  /**
   * update lastSeen timestamps of IP
   * @return Promise<boolean>
   */
  touch() {
    if (!this.#allowance
      || this.#allowance.lastSeen.getTime() > Date.now() - 10 * 60 * 1000
    ) {
      return false;
    }
    return touchIP(this.ipString);
  }

  refresh() {
    this.verificationRecheckTs = 0;
    return this.getAllowance(true);
  }

  /**
   * fetch verification status (captcha, js challenge) of ip
   * @return { captchaNeeded, challengeNeeded }
   */
  async getVerification() {
    const currentTs = Date.now();
    if (this.verificationRecheckTs !== null
      && this.verificationRecheckTs < currentTs
    ) {
      const { ipString } = this;
      const {
        captchaExpiresTs, challengeExpiresTs,
      } = await getIPVerification(ipString);

      this.verificationRecheckTs = captchaExpiresTs;
      if (challengeExpiresTs !== null
        && challengeExpiresTs < this.verificationRecheckTs
      ) {
        this.verificationRecheckTs = challengeExpiresTs;
      }

      this.challengeNeeded = (
        challengeExpiresTs !== null && challengeExpiresTs < currentTs
      );
      this.captchaNeeded = (
        captchaExpiresTs !== null && captchaExpiresTs < currentTs
      );

      if (this.verificationRecheckTs !== null
        && this.verificationRecheckTs < currentTs
      ) {
        /* limit recheck time */
        this.verificationRecheckTs = currentTs + 3000;
      }
    }
    return {
      captchaNeeded: this.captchaNeeded,
      challengeNeeded: this.challengeNeeded,
    };
  }

  /**
   * fetch allowance data of ip
   * @param refresh whether we should refetch it, even if we have it already
   * @return { isBanned, isProxy, isMuted, isWhitelisted }
   */
  async getAllowance(refresh = false) {
    const currentTs = Date.now();

    if (!this.#allowance || refresh
      || this.#allowance.whoisExpiresTs < currentTs
      || this.#allowance.proxyCheckExpiresTs < currentTs
      || (this.banRecheckTs !== null && this.banRecheckTs < currentTs)
    ) {
      const { ipString } = this;
      const allowance = await getIPAllowanceQueued(ipString);

      /* fetch whois and proxycheck if needed */
      const needWhois = allowance.whoisExpiresTs < currentTs;
      const needProxyCheck = allowance.proxyCheckExpiresTs < currentTs;
      if (needWhois || needProxyCheck) {
        try {
          const [
            whoisData, proxyCheckData,
          ] = await getIPIntelOverShards(ipString, needWhois, needProxyCheck);

          if (whoisData) {
            allowance.whoisExpiresTs = whoisData.expiresTs;
            allowance.country = whoisData.country || 'xx';
          }

          if (proxyCheckData) {
            allowance.proxyCheckExpiresTs = proxyCheckData.expiresTs;
            allowance.isProxy = isConfirmedProxy(proxyCheckData);
            allowance.proxyRisk = proxyCheckData.risk;
            allowance.proxyConfidence = proxyCheckData.confidence;
            allowance.proxyRepetition = proxyCheckData.repetition;
            allowance.proxyType = proxyCheckData.type;
            allowance.providerVotes = proxyCheckData.providerVotes;
          }
        } catch (error) {
          console.error(`IP Error on getIPAllowance: ${error.message}`);
          allowance.isProxy = false;
          allowance.proxyCheckExpiresTs = currentTs + 3000;
        }
      }

      /*
       * Prefer Cloudflare country for flag display; use IPQS only as fallback
       * only when Cloudflare has no valid country code.
       */
      const cfCountry = this.#req.headers['cf-ipcountry'];
      const hasCfCountry = typeof cfCountry === 'string'
        && /^[a-z]{2}$/i.test(cfCountry);
      const hasIntelCountry = /^[a-z]{2}$/i.test(allowance.country || '');
      if (hasIntelCountry && !hasCfCountry) {
        Object.defineProperty(this, 'country', { value: allowance.country });
      }

      const [isBanned, isMuted, banRecheckTs] = parseListOfBans(allowance.bans);
      this.isBanned = isBanned;
      this.isMuted = isMuted;
      this.isWhitelisted = allowance.isWhitelisted;
      this.banRecheckTs = banRecheckTs;
      const wouldBlock = !allowance.isWhitelisted && allowance.isProxy;
      const hasProxyObservation = allowance.providerVotes
        && allowance.providerVotes.verdict !== 'clean'
        && allowance.providerVotes.verdict !== 'unknown';
      if (hasProxyObservation && PROXYCHECK_LOG_ONLY) {
        const sourceSummary = allowance.providerVotes.sources
          .map(({ name, status }) => `${name}:${status}`)
          .join(',');
        console.info(
          'Proxy check dry-run observation:',
          `verdict=${allowance.providerVotes.verdict}`,
          `votes=${allowance.providerVotes.summary || 'unavailable'}`,
          `sources=${sourceSummary || 'none'}`,
          `country=${allowance.country || 'xx'}`,
          `type=${allowance.proxyType || 'unknown'}`,
          `risk=${allowance.proxyRisk ?? 'unknown'}`,
          `confidence=${allowance.proxyConfidence ?? 'unknown'}`,
        );
      }
      this.isProxy = wouldBlock && !PROXYCHECK_LOG_ONLY;
      this.#allowance = allowance;
    }
    return {
      isBanned: this.isBanned,
      isProxy: this.isProxy,
      isMuted: this.isMuted,
      isWhitelisted: this.isWhitelisted,
    };
  }
}

/*
 * express middleware to add IP object to request
 */
export function parseIP(req, res, next) {
  const ip = new IP(req);
  if (!ip.ipString) {
    next(new Error(
      'Could not determine visitor IP; refusing to process a proxy IP.',
    ));
    return;
  }
  Object.defineProperty(req, 'ip', { value: ip });
  next();
}

/*
 * express middleware to resolve IP allowance in a promise under req.promise,
 * must be called after parseIP.
 * Promise can be resolved by './promises.js' middleware.
 * This has the purpose to allow other actions to happen while we wait.
 */
export async function ipAllowancePromisified(req, res, next) {
  if (!req.promise) {
    req.promise = [];
  }
  req.promise.push(req.ip.getAllowance());
  next();
}
