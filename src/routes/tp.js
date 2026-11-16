/*
 * third party logins with passport
 */
import express from 'express';
import { parse as parseCookie } from 'cookie';
import {
  OAuth2Client, Discord, Google, generateCodeVerifier, decodeIdToken,
  CodeChallengeMethod, OAuth2Tokens,
} from 'arctic';

import { AuthLogger } from '../core/logger.js';
import { sign, unsign, generateTinyToken } from '../utils/hash.js';
import generateName from '../utils/generateName.js';
import {
  openSession, ensureLoggedIn, verifySession,
} from '../middleware/session.js';
import { parseDevice } from '../middleware/device.js';
import errorPage from '../middleware/errorPage.js';
import socketEvents from '../socket/socketEvents.js';
import { sanitizeName, validateEMail } from '../utils/validation.js';
import {
  getUserByEmail, getUserByTpid, getNameThatIsNotTaken,
  createNewUserWithIp, MAX_ACCOUNTS_PER_IP, setUserProperty,
} from '../data/sql/User.js';
import { getIIDofIP } from '../data/sql/IP.js';
import {
  addOrReplaceTpid, linkDiscordTpid,
} from '../data/sql/ThreePID.js';

import {
  THREEPID_ABBR, USERLVL, THREEPID_PROVIDERS,
} from '../core/constants.js';
import {
  DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, DISCORD_R_URI,
  TESTER_GATE_ENABLED, TESTER_DISCORD_USERNAMES, BASENAME,
  GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_R_URI,
  VK_CLIENT_ID, VK_CLIENT_SECRET, VK_R_URI,
} from '../core/config.js';

const router = express.Router();
const TESTER_DENIAL = 'Упс, вы похоже не являетесь тестером игры!';
const TESTER_COOKIE = 'ppfun.tester';
const TESTER_AUTH_ORIGIN = '/_tester_gate/';
const DISCORD_LINK_ORIGIN = '/_discord_link/:';
const TESTER_ACCESS_MS = 60 * 60 * 1000;

function isTesterUsername(username) {
  if (typeof username !== 'string' || !username.trim()) {
    return false;
  }
  const normalizedUsername = username.trim().toLowerCase();
  return TESTER_DISCORD_USERNAMES.some(
    (entry) => entry.trim().toLowerCase() === normalizedUsername,
  );
}

function isSafeReturnTo(returnTo) {
  if (typeof returnTo !== 'string'
    || !returnTo.startsWith('/')
    || returnTo.startsWith('//')
    || returnTo.includes('\\')
    || /[\r\n]/.test(returnTo)
    || returnTo.length > 2048
  ) {
    return false;
  }
  try {
    return new URL(returnTo, 'https://tester.invalid').origin
      === 'https://tester.invalid';
  } catch {
    return false;
  }
}

function getTesterCookieOptions(req) {
  return {
    httpOnly: true,
    secure: req.secure === true,
    sameSite: 'lax',
    path: '/',
  };
}

function hasValidTesterCookie(req) {
  try {
    const cookies = parseCookie(req.headers.cookie || '');
    const value = unsign(cookies[TESTER_COOKIE]);
    if (!value) {
      return false;
    }
    const { username, expiresAt } = JSON.parse(value);
    return Number.isFinite(expiresAt)
      && expiresAt > Date.now()
      && isTesterUsername(username);
  } catch {
    return false;
  }
}

export function testerSiteGate(req, res, next) {
  if (!TESTER_GATE_ENABLED) {
    next();
    return;
  }
  if (!TESTER_DISCORD_USERNAMES.length
    || !DISCORD_CLIENT_ID
    || !DISCORD_CLIENT_SECRET
    || !DISCORD_R_URI
  ) {
    res.status(503).type('text/plain').send(
      'Tester access is unavailable because its Discord '
      + 'configuration is incomplete.',
    );
    return;
  }

  if (req.path === '/test'
    || (req.method === 'GET'
      && (req.path === '/api/oauth/callback/tester'
        || req.path === '/api/oauth/callback/discord'))
  ) {
    next();
    return;
  }
  if (hasValidTesterCookie(req)) {
    next();
    return;
  }

  res.clearCookie(TESTER_COOKIE, getTesterCookieOptions(req));
  const returnTo = isSafeReturnTo(req.originalUrl) ? req.originalUrl : '/';
  const loginPath = `${BASENAME}/api/oauth/callback/tester`;
  res.redirect(
    `${loginPath}?returnTo=${encodeURIComponent(returnTo)}`,
  );
}

function getOAuthCookieOptions() {
  return {
    httpOnly: true,
    secure: false,
    sameSite: 'lax',
    path: '/',
  };
}

/*
 * available providers
 */
const abbrToProvider = {
  /* eslint-disable max-len */
  d: DISCORD_CLIENT_ID && new Discord(DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, DISCORD_R_URI),
  g: GOOGLE_CLIENT_ID && new Google(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_R_URI),
  vk: VK_CLIENT_ID && new OAuth2Client(VK_CLIENT_ID, VK_CLIENT_SECRET, VK_R_URI),
  /* eslint-enable max-len */
};

router.get('/link/discord', verifySession, ensureLoggedIn, (req, res) => {
  req.tickRateLimiter(5000);
  if (req.csrfPossible) {
    res.status(403).type('text/plain').send('Request from this origin denied.');
    return;
  }
  const provider = abbrToProvider.d;
  if (!provider) {
    res.status(503).type('text/plain').send(
      'Discord linking is unavailable because Discord OAuth is not configured.',
    );
    return;
  }
  const returnTo = req.query.returnTo || '/';
  if (!isSafeReturnTo(returnTo)) {
    res.status(400).type('text/plain').send('Invalid return path');
    return;
  }
  const state = generateTinyToken();
  const codeVerifier = generateCodeVerifier();
  const origin = `${DISCORD_LINK_ORIGIN}${req.user.id}:${
    encodeURIComponent(returnTo)
  }`;
  res.cookie(`oa${state}`, sign(`${codeVerifier}:${origin}`), {
    ...getOAuthCookieOptions(req),
    expires: new Date(Date.now() + 900 * 1000),
  });
  res.redirect(provider.createAuthorizationURL(
    state, codeVerifier, ['identify', 'email'],
  ).toString());
});

/*
 * get into auth flow
 */
router.get('/:abbr', (req, res) => {
  req.tickRateLimiter(5000);
  res.set({
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    Expires: '0',
  });

  const provider = abbrToProvider[req.params.abbr];
  if (!provider) {
    throw new Error('No such oauth provider configured');
  }

  const state = generateTinyToken();
  /* Only allow local return paths after authentication. */
  const origin = isSafeReturnTo(req.query.o) ? req.query.o : '/';
  /*
   * pkce challenge, would be better to store it in a database, but a signed
   * cookie shall be alright, especially since others don't use it at all
   */
  const codeVerifier = generateCodeVerifier();

  res.cookie(`oa${state}`, sign(`${codeVerifier}:${origin}`), {
    ...getOAuthCookieOptions(req),
    expires: new Date(Date.now() + 900 * 1000),
  });

  let url;
  switch (req.params.abbr) {
    case 'd': {
      const scopes = ['identify', 'email'];
      url = provider.createAuthorizationURL(state, codeVerifier, scopes);
      break;
    }
    case 'g': {
      const scopes = ['openid', 'email', 'profile'];
      url = provider.createAuthorizationURL(state, codeVerifier, scopes);
      break;
    }
    case 'vk': {
      const scopes = ['email'];
      url = provider.createAuthorizationURLWithPKCE(
        'https://id.vk.com/authorize', state,
        CodeChallengeMethod.S256, codeVerifier, scopes,
      );
      break;
    }
    default:
      // nothing
  }

  res.redirect(url.toString());
});

/*
 * return from oauth
 */
async function handleOAuthCallback(req, res, abbr = req.params.abbr) {
  req.tickRateLimiter(7000);
  res.set({
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    Expires: '0',
  });

  const provider = abbrToProvider[abbr];
  if (!provider) {
    throw new Error('No such oauth provider configured');
  }

  const { query } = req;
  const { state } = query;

  const cookies = parseCookie(req.headers.cookie || '');
  const cookieName = `oa${state}`;
  const oauthCookie = unsign(cookies[cookieName]);
  res.clearCookie(cookieName, getOAuthCookieOptions(req));

  /* eslint-disable max-len */
  if (!oauthCookie) {
    throw new Error(
      'Either your browser does not support cookies or the third party provider sent a bad return.',
    );
  }

  if (query.error) {
    if (query.error_description) {
      const error = new Error(query.error_description);
      error.title = query.error;
      throw error;
    }
    throw new Error(query.error);
  }

  const seperator = oauthCookie.indexOf(':');
  if (seperator === -1) {
    throw new Error(
      'I do not know how this can even happen without you deliberately messing with it',
    );
  }
  const codeVerifier = oauthCookie.substring(0, seperator);
  let origin = oauthCookie.substring(seperator + 1);
  if (!origin) {
    origin = '/';
  }
  const testerFlow = origin.startsWith(TESTER_AUTH_ORIGIN);
  const discordLinkFlow = origin.startsWith(DISCORD_LINK_ORIGIN);
  let testerReturnTo = null;
  let discordLinkUid = null;
  let discordLinkReturnTo = null;
  if (discordLinkFlow) {
    if (abbr !== 'd') {
      throw new Error('Discord linking requires Discord OAuth');
    }
    const linkData = origin.substring(DISCORD_LINK_ORIGIN.length);
    const separator = linkData.indexOf(':');
    const uid = Number(linkData.substring(0, separator));
    try {
      discordLinkReturnTo = decodeURIComponent(
        linkData.substring(separator + 1),
      );
    } catch {
      discordLinkReturnTo = null;
    }
    if (separator < 1 || !Number.isSafeInteger(uid) || uid < 1
      || !isSafeReturnTo(discordLinkReturnTo)
    ) {
      throw new Error('Invalid Discord link flow');
    }
    discordLinkUid = uid;
  }
  if (testerFlow) {
    if (abbr !== 'd') {
      throw new Error('Tester authentication requires Discord');
    }
    try {
      testerReturnTo = decodeURIComponent(
        origin.substring(TESTER_AUTH_ORIGIN.length),
      );
    } catch {
      testerReturnTo = null;
    }
    if (!isSafeReturnTo(testerReturnTo)) {
      throw new Error('Invalid tester login return path');
    }
  }
  const { code } = query;
  const providerName = THREEPID_ABBR[abbr];

  let tpid;
  let email;
  let emailVerified = false;
  let tpidVerified = false;
  let preferredName;
  let discordUsername = null;
  /*
   * we get avtarUrl, but we do not use it (yet),
   * Reminder that people do not like or even expect to share their profile pic
   * when they do a third party login, they expect a login only.
   * If we ever use it, we need to ask for explicit consent.
   */
  /* eslint-disable no-unused-vars */
  let avatarUrl;
  switch (abbr) {
    case 'd': {
      /*
       * https://discord.com/developers/docs/topics/oauth2
       */
      const tokens = await provider.validateAuthorizationCode(code, codeVerifier);
      const accessToken = tokens.accessToken();
      const response = await fetch('https://discord.com/api/users/@me', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) {
        throw new Error('Discord could not authenticate this account');
      }
      const user = await response.json();
      if (!user || typeof user.username !== 'string' || !user.id) {
        throw new Error('Discord returned an invalid account identity');
      }
      discordUsername = user.username;
      if (testerFlow && !isTesterUsername(discordUsername)) {
        res.status(403).type('text/plain').send(TESTER_DENIAL);
        return;
      }
      ({
        username: preferredName, email, id: tpid,
      } = user);
      if (user.verified) {
        emailVerified = true;
        tpidVerified = true;
      }
      avatarUrl = `https://cdn.discordapp.com/avatars/${tpid}/${user.avatar}.png`;
      break;
    }
    case 'g': {
      /*
       * generic OpenID Connect flow
       * https://developers.google.com/identity/openid-connect/openid-connect#an-id-tokens-payload
       */
      const tokens = await provider.validateAuthorizationCode(code, codeVerifier);
      const claims = decodeIdToken(tokens.idToken());
      /*
       * 'name' claim would be a full name that is a RL name, we shall not use
       * that
       */
      ({
        sub: tpid,
        email,
        email_verified: emailVerified,
        picture: avatarUrl,
      } = claims);
      if (emailVerified) {
        tpidVerified = true;
      }
      break;
    }
    case 'vk': {
      /*
       * Some own thing, not really OIDC, but close
       * https://id.vk.com/about/business/go/docs/en/vkid/latest/vk-id/connection/start-integration/auth-without-sdk/auth-without-sdk-web
       */
      let body = new URLSearchParams();
      body.set('grant_type', 'authorization_code');
      body.set('code_verifier', codeVerifier);
      body.set('redirect_uri', VK_R_URI);
      body.set('code', code);
      body.set('client_id', VK_CLIENT_ID);
      /*
       * this stops it from being oidc, together with the missing Authorization
       * header
       */
      body.set('device_id', query.device_id);
      body.set('state', state);

      let response = await fetch('https://id.vk.com/oauth2/auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
          'User-Agent': 'ppfun',
        },
        body: body.toString(),
      });
      response = await response.json();
      if (response.error) {
        throw new Error(response.error_description || response.error);
      }
      const tokens = new OAuth2Tokens(response);

      body = new URLSearchParams();
      body.set('access_token', tokens.accessToken());
      body.set('client_id', VK_CLIENT_ID);
      response = await fetch('https://id.vk.com/oauth2/user_info', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
          'User-Agent': 'ppfun',
        },
        body: body.toString(),
      });
      response = await response.json();
      if (response.error) {
        throw new Error(response.error_description || response.error);
      }
      const { user } = response;
      ({
        email, user_id: tpid, avatar: avatarUrl,
      } = user);
      if (user.verified) {
        emailVerified = true;
      }
      /*
       * vk account creation is so restrictive, consider it verified if it
       * exists.
       * user.first_name and user.last_name would be RL names, we can not use
       * that
       */
      tpidVerified = true;
      break;
    }
    default:
      // nothing
  }
  /* eslint-enable no-unused-vars */
  /* eslint-enable max-len */

  /*
   * the fun starts here, we now got the third party data, verify it
   */

  if (tpid && typeof tpid !== 'string') {
    tpid = tpid.toString();
  }
  /* don't accept emails that aren't verified */
  if (!emailVerified) {
    email = null;
  }
  /* if we got no preferred name, use a dummy */
  if (!preferredName) {
    preferredName = generateName();
  }
  /* make sure name and email have proper format */
  preferredName = sanitizeName(preferredName);
  if (email?.length > 40 || validateEMail(email)) {
    email = null;
  }

  const providerType = THREEPID_PROVIDERS[providerName];
  if (!providerType) {
    throw new Error(`Can not login with ${providerName}`);
  }
  if (!email && !tpid) {
    throw new Error(
      // eslint-disable-next-line max-len
      `${providerName} didn't give us enough information to log you in, maybe you don't have an email set in their account?`,
    );
  }

  if (discordLinkFlow) {
    const result = await linkDiscordTpid(discordLinkUid, tpid);
    if (result === 'account_has_discord') {
      throw new Error(
        'This PixelStates account already has a Discord account linked',
      );
    }
    if (result === 'discord_in_use') {
      throw new Error(
        'This Discord account is already linked to another PixelStates account',
      );
    }
    const returnUrl = new URL(discordLinkReturnTo, 'http://pixelstates.invalid');
    returnUrl.searchParams.set('discordLink', 'success');
    res.redirect(`${returnUrl.pathname}${returnUrl.search}${returnUrl.hash}`);
    return;
  }

  /*
   * get or create the user account
   */

  try {
    const promises = [];
    let userData;
    /* An existing provider identity takes precedence over an email match. */
    if (tpid) {
      userData = await getUserByTpid(providerType, tpid);
    }
    /* Link a new identity to an account with the same verified email. */
    if (!userData && email && emailVerified) {
      userData = await getUserByEmail(email);
    }

    const { ip } = req;
    await ip.getAllowance();
    let iid = await getIIDofIP(ip.ipString);
    /* create new user */
    if (!userData) {
      preferredName = await getNameThatIsNotTaken(preferredName);
      const registration = await createNewUserWithIp(
        preferredName, null, null, ip.ipString, MAX_ACCOUNTS_PER_IP,
      );
      userData = registration.user;
      iid = await getIIDofIP(ip.ipString);
      if (registration.limitReached) {
        throw new Error(
          'A maximum of 3 accounts can be registered from one IP.',
        );
      }
      if (!userData) {
        throw new Error('Could not create user');
      }

      AuthLogger.newOAuthUser(
        userData, email?.substring(email.indexOf('@')), iid, ip.country,
        providerName,
      );
    } else {
      AuthLogger.oAuthLogin(
        userData, email?.substring(email.indexOf('@')), iid, ip.country,
        providerName,
      );
    }

    if (tpid) {
      promises.push(
        addOrReplaceTpid(userData.id, providerType, tpid, tpidVerified),
      );
    }
    if (email && emailVerified) {
      promises.push(
        addOrReplaceTpid(userData.id, THREEPID_PROVIDERS.EMAIL, email),
      );
    }
    if ((tpidVerified || emailVerified)
      && userData.userlvl === USERLVL.REGISTERED
    ) {
      promises.push(setUserProperty(userData.id, 'userlvl', USERLVL.VERIFIED));
    }
    await Promise.all(promises);

    /*
    * at this point we have userData of { id, name, password, userlvl }
    */

    /* creates req.user */
    const sessionToken = await openSession(req, res, userData.id, 168);
    if (testerFlow) {
      if (!sessionToken || !discordUsername) {
        throw new Error('Could not create tester login session');
      }
      const expiresAt = Date.now() + TESTER_ACCESS_MS;
      res.cookie(
        TESTER_COOKIE,
        sign(JSON.stringify({ username: discordUsername, expiresAt })),
        {
          ...getTesterCookieOptions(req),
          expires: new Date(expiresAt),
        },
      );
      origin = testerReturnTo;
    }
  } catch (error) {
    console.error(`OAUTH Login Error: ${error.message}`);
    throw error;
  }

  /*
  * on logins for openid connect reauthentification, we should split the
  * promt='login' from the query, to indicate that we authenticated, and add
  * max_age, to make sure that it is recent
  */
  if (origin.startsWith('/oidc/')) {
    const url = new URL(origin, 'http://example.com');
    if (url.searchParams.get('prompt') === 'login') {
      url.searchParams.delete('prompt');
      url.searchParams.set('max_age', '600');
      origin = url.pathname + url.search;
    }
  }

  /* tell all clients of this ip to reload */
  res.on('finish', () => socketEvents.reloadIP(req.ip.ipString));
  res.redirect(origin);
}

router.get('/r/:abbr', parseDevice, handleOAuthCallback);

router.use(errorPage);

export const oauthCallbackRouter = express.Router();
oauthCallbackRouter.get('/tester', (req, res) => {
  if (!TESTER_GATE_ENABLED) {
    res.status(404).end();
    return;
  }
  req.tickRateLimiter(5000);
  res.set({
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    Expires: '0',
  });

  const returnTo = req.query.returnTo || '/';
  if (!isSafeReturnTo(returnTo)) {
    res.status(400).type('text/plain').send('Invalid return path');
    return;
  }
  const provider = abbrToProvider.d;
  if (!provider) {
    res.status(503).type('text/plain').send(
      'Tester access is unavailable because Discord OAuth is not configured.',
    );
    return;
  }

  const state = generateTinyToken();
  const codeVerifier = generateCodeVerifier();
  const origin = `${TESTER_AUTH_ORIGIN}${encodeURIComponent(returnTo)}`;
  res.cookie(`oa${state}`, sign(`${codeVerifier}:${origin}`), {
    ...getOAuthCookieOptions(req),
    expires: new Date(Date.now() + 900 * 1000),
  });
  const url = provider.createAuthorizationURL(
    state, codeVerifier, ['identify', 'email'],
  );
  res.redirect(url.toString());
});

oauthCallbackRouter.get(
  '/google',
  parseDevice,
  (req, res) => handleOAuthCallback(req, res, 'g'),
);
oauthCallbackRouter.get(
  '/discord',
  parseDevice,
  (req, res) => handleOAuthCallback(req, res, 'd'),
);

export default router;
