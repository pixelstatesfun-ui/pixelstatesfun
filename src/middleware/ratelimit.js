/*
 * rate limiter,
 * must have req.ip available
 */
import { spawn } from 'child_process';

import MassRateLimiter from '../utils/MassRateLimiter.js';
import { AVAILABLE_POPUPS, MINUTE } from '../core/constants.js';
import { RATE_LIMIT_CMD } from '../core/config.js';

const rateLimiter = new MassRateLimiter(5 * MINUTE, 2 * MINUTE);
const pagePaths = new Set([
  '/',
  '/globe',
  ...AVAILABLE_POPUPS.map((popup) => `/${popup.toLowerCase()}`),
]);

function shouldSkipRateLimit(req) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;
  if (req.path.startsWith('/api/') || req.path === '/api') return false;
  return pagePaths.has(req.path)
    || /\.[a-z\d]{1,8}$/i.test(req.path);
}

function onTrigger(ipString) {
  console.warn(`User ${ipString} triggered Request RateLimit.`);
  if (RATE_LIMIT_CMD) {
    const args = RATE_LIMIT_CMD.split(' ');
    let cmd = args.shift();
    args.push(ipString);
    cmd = spawn(cmd, args);
    cmd.stdout.on('data', (data) => {
      console.log(`RateLimit Trigger: ${data}`);
    });
    cmd.stderr.on('data', (data) => {
      console.error(`RateLimit Trigger Error: ${data}`);
    });
  }
}

export default (req, res, next) => {
  const skipRateLimit = shouldSkipRateLimit(req);
  const rateLimitKey = `${req.ip.ipString}:${req.method}:${req.path}`;
  if (!skipRateLimit && rateLimiter.isTriggered(rateLimitKey)) {
    res.status(429).send(`<!DOCTYPE html>
<html>
  <head><title>Too fast</title></head>
  <body>Calm Down a bit.</body>
</html>`);
    return;
  }
  req.tickRateLimiter = (deltaTime) => {
    if (skipRateLimit) return;
    /*
     * Rate limits are isolated by endpoint so activity in one part of the
     * interface cannot block unrelated pages and API requests.
     */
    rateLimiter.tick(rateLimitKey, deltaTime, null, onTrigger);
  };
  next();
};
