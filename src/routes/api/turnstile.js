import express from 'express';

import {
  CAPTCHA_PROVIDER,
  TURNSTILE_ACTION,
  TURNSTILE_HOSTNAME,
  TURNSTILE_SECRET_KEY,
  TURNSTILE_SITE_KEY,
} from '../../core/config.js';
import { recordTurnstileVerification } from '../../data/sql/Captcha.js';
import logger from '../../core/logger.js';
import socketEvents from '../../socket/socketEvents.js';

const router = express.Router();

router.get('/', (req, res) => {
  if (!['turnstile', 'ppfun'].includes(CAPTCHA_PROVIDER)) {
    res.status(503).json({ error: 'Invalid CAPTCHA_PROVIDER setting.' });
    return;
  }
  if (CAPTCHA_PROVIDER === 'turnstile'
    && (!TURNSTILE_SITE_KEY || !TURNSTILE_SECRET_KEY)
  ) {
    res.status(503).json({ error: 'Turnstile is not configured.' });
    return;
  }
  res.json({
    provider: CAPTCHA_PROVIDER,
    action: TURNSTILE_ACTION,
  });
});

router.post('/', async (req, res) => {
  req.tickRateLimiter(3000);
  const { token } = req.body || {};
  if (typeof token !== 'string' || !token || token.length > 2048) {
    res.status(400).json({ error: 'Missing or invalid Turnstile token.' });
    return;
  }
  if (CAPTCHA_PROVIDER !== 'turnstile') {
    res.status(404).json({ error: 'Turnstile CAPTCHA is not active.' });
    return;
  }
  if (!TURNSTILE_SITE_KEY || !TURNSTILE_SECRET_KEY) {
    res.status(503).json({ error: 'Turnstile is not configured.' });
    return;
  }

  try {
    const siteverifyResponse = await fetch(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          secret: TURNSTILE_SECRET_KEY,
          response: token,
          remoteip: req.ip.ipString,
        }),
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!siteverifyResponse.ok) {
      throw new Error(`Siteverify returned HTTP ${siteverifyResponse.status}`);
    }
    const verification = await siteverifyResponse.json();
    const expectedHostname = (TURNSTILE_HOSTNAME || req.hostname)
      .toLowerCase();
    const hostnameMatches = verification.hostname?.toLowerCase()
      === expectedHostname;
    const actionMatches = !TURNSTILE_ACTION
      || verification.action === TURNSTILE_ACTION;
    if (!verification.success || !hostnameMatches || !actionMatches) {
      const errorCodes = (verification['error-codes'] || []).join(', ')
        || (!verification.success ? 'verification rejected' : 'claim mismatch');
      logger.warn(
        `Turnstile rejected for ${req.ip.ipString}: ${errorCodes}; `
        + `hostname=${verification.hostname || 'missing'} `
        + `expected=${expectedHostname} `
        + `action=${verification.action || 'missing'} `
        + `expectedAction=${TURNSTILE_ACTION || 'any'}`,
      );
      let errorMessage = 'Turnstile verification failed. Please try again.';
      if (!hostnameMatches) {
        errorMessage = 'Turnstile hostname mismatch. Check TURNSTILE_HOSTNAME '
          + 'and the allowed hostnames in Cloudflare.';
      } else if (!actionMatches) {
        errorMessage = 'Turnstile action mismatch. Check TURNSTILE_ACTION '
          + 'and the client build.';
      }
      res.status(400).json({
        error: errorMessage,
      });
      return;
    }

    await recordTurnstileVerification(req.ip.ipString);
    socketEvents.reloadIP(req.ip.ipString);
    res.json({ success: true });
  } catch (error) {
    logger.error(`Turnstile verification error: ${error.message}`);
    res.status(503).json({
      error: 'Turnstile verification is temporarily unavailable.',
    });
  }
});

export default router;
