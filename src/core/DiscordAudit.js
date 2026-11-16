import {
  MOD_AUDIT_WEBHOOK_URL, USER_AUDIT_WEBHOOK_URL,
} from './config.js';
import { USERLVL } from './constants.js';

const STAFF_ACTIONS = new Set([
  'livelog', 'cleanerstat', 'modlist', 'gamestate',
]);

const CONTEXT_KEY = new RegExp(
  '^(?:action|.*action|.*target|.*user(?:name|id)?|userlvl|iid|bid|'
  + 'iidoruser|identifiers|ulcoor|brcoor|coords|canvasid|channelid|'
  + 'messageid|message|reason|.*id|.*name|.*tag|.*role|.*faction|'
  + 'time|maxrows|'
  + 'maxentities|clr|colorindex|vip(?:action|target|tier|duration)|'
  + 'mediaidormbid|rollbackdate|rollbacktime|protaction|cleaneraction|'
  + 'quickaction|pastecolor|imageaction|textaction|makemod|remmod|'
  + 'managevip|modlist|gamestate|.*whitelist.*)$',
  'i',
);
const SENSITIVE_KEY = new RegExp(
  'pass(?:word)?|token|secret|captcha|turnstile|cookie|authorization|'
  + 'file|image|upload|text|reason|message|email',
  'i',
);
const MUTATING_GETS = new Set([
  '/api/auth/logout',
  '/api/auth/resend_verify',
]);

function cleanValue(value) {
  if (typeof value !== 'string' && typeof value !== 'number'
    && typeof value !== 'boolean'
  ) {
    return null;
  }
  return String(value).replace(/[\r\n]/g, ' ').slice(0, 160);
}

function getSafeWebhookUrl(value) {
  if (typeof value !== 'string') {
    return null;
  }
  try {
    const webhook = new URL(value);
    if (webhook.protocol !== 'https:'
      || !['discord.com', 'discordapp.com'].includes(webhook.hostname)
      || webhook.port
      || webhook.username
      || webhook.password
      || webhook.search
      || webhook.hash
      || !/^\/api\/webhooks\/\d+\/[A-Za-z0-9._-]+\/?$/.test(webhook.pathname)
    ) {
      return null;
    }
    return webhook.href;
  } catch {
    return null;
  }
}

function getContext(body, includeStaffText) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return {};
  }
  const context = {};
  Object.entries(body).slice(0, 40).forEach(([key, value]) => {
    const isMessageId = /^messageid$/i.test(key);
    const isStaffText = includeStaffText && /^(?:message|reason)$/i.test(key);
    if (!CONTEXT_KEY.test(key)
      || (SENSITIVE_KEY.test(key) && !isMessageId && !isStaffText)
    ) {
      return;
    }
    const safeValue = cleanValue(value);
    if (safeValue !== null) {
      context[key] = safeValue;
    }
  });
  return context;
}

function getStaffAction(path, body) {
  if (path === '/api/chatmoderation/delete') {
    return 'delete chat content';
  }
  if (path !== '/api/modtools' && path !== '/api/modtools/') {
    return null;
  }
  if (!body || typeof body !== 'object') {
    return null;
  }
  const bodyKeys = Object.keys(body);
  if (bodyKeys.some((key) => STAFF_ACTIONS.has(key))) {
    return null;
  }
  const keys = bodyKeys;
  if (!keys.length) {
    return null;
  }
  return keys.slice(0, 5).join(', ');
}

function getAuditTarget(req) {
  const user = req.auditActor || req.user;
  const staffAction = getStaffAction(req.auditPath, req.body);
  if (user && user.userlvl >= USERLVL.CHATMOD && staffAction) {
    return {
      url: MOD_AUDIT_WEBHOOK_URL,
      channel: 'moderator/admin',
      actor: `${user.name || 'Unknown'} [${user.id}] (level ${user.userlvl})`,
      action: staffAction,
    };
  }

  const mutatingRequest = req.method === 'POST'
    ? true
    : req.method === 'GET' && MUTATING_GETS.has(req.auditPath);
  if (!mutatingRequest) {
    return null;
  }

  const path = req.auditPath;
  if (path === '/api/modtools' || path === '/api/modtools/'
    || path === '/api/chatmoderation/delete'
  ) {
    return null;
  }

  return {
    url: USER_AUDIT_WEBHOOK_URL,
    channel: 'user activity',
    actor: user
      ? `${user.name || 'Unknown'} [${user.id}]`
      : 'Anonymous',
    action: `${req.method} ${path}`,
  };
}

async function sendAudit(target, req, status) {
  const webhookUrl = getSafeWebhookUrl(target.url);
  if (!webhookUrl || !target.action) {
    if (target.url) {
      console.error(
        `Discord ${target.channel} audit webhook URL is invalid`,
      );
    }
    return;
  }

  const context = getContext(
    req.body,
    target.channel === 'moderator/admin',
  );
  const fields = [
    { name: 'Actor', value: target.actor.slice(0, 1024), inline: true },
    { name: 'Action', value: target.action.slice(0, 1024), inline: true },
    { name: 'HTTP result', value: String(status), inline: true },
  ];
  if (Object.keys(context).length) {
    fields.push({
      name: 'Request context',
      value: JSON.stringify(context).slice(0, 1024),
      inline: false,
    });
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      redirect: 'error',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ['allowed_mentions']: { parse: [] },
        embeds: [{
          title: `${target.channel} activity`,
          color: target.channel === 'moderator/admin' ? 0xD83C3E : 0x5865F2,
          author: {
            name: target.actor.slice(0, 256),
          },
          description: `**${target.action.slice(0, 1024)}**`,
          fields,
          footer: {
            text: 'PixelStates security audit',
          },
          timestamp: new Date().toISOString(),
        }],
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      console.error(
        `Discord ${target.channel} audit delivery failed with HTTP `
        + `${response.status}`,
      );
    }
  } catch (error) {
    console.error(
      `Discord ${target.channel} audit delivery failed `
      + `(${error.name || 'Error'})`,
    );
  }
}

export default function auditApiRequest(req, res, next) {
  req.auditPath = req.originalUrl.split('?')[0];
  if (req.user) {
    req.auditActor = {
      id: req.user.id,
      name: req.user.name,
      userlvl: req.user.userlvl,
    };
  }
  res.once('finish', () => {
    try {
      const target = getAuditTarget(req);
      if (target) {
        sendAudit(target, req, res.statusCode).catch((error) => {
          console.error(
            `Discord ${target.channel} audit delivery failed `
            + `(${error.name || 'Error'})`,
          );
        });
      }
    } catch (error) {
      console.error(`Discord API audit failed (${error.name || 'Error'})`);
    }
  });
  next();
}
