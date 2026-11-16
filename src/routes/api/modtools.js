/**
 * basic mod api
 * is used by ../components/Modtools
 *
 */

import express from 'express';
import fileUpload from 'express-fileupload';
import { isIP } from 'node:net';

import urlEncoded from '../../middleware/formData.js';
import { requireOidc } from '../../middleware/oidc.js';
import CanvasCleaner from '../../core/CanvasCleaner.js';
import logger, { AuthLogger } from '../../core/logger.js';
import {
  executeTextAction,
  executeIIDAction,
  executeImageAction,
  executePasteColorAction,
  executeProtAction,
  executeRollback,
  executeCleanerAction,
  executeWatchAction,
  demoteUser,
  promoteUser,
  executeQuickAction,
  executeMediaAction,
} from '../../core/adminfunctions.js';
import { getMultipleStates } from '../../core/SharedState.js';
import CooldownManager from '../../core/CooldownManager.js';
import { syncVipRole } from '../../core/DiscordRoles.js';
import {
  getHighUserLvlUsers, findUserById, findUserByVipTarget, setUserVipTier,
  findUserByIdOrName, findUsersByIID,
} from '../../data/sql/User.js';
import {
  getTpidProviders, getUserByDiscordTpid, linkDiscordTpid,
  unlinkDiscordTpid,
} from '../../data/sql/ThreePID.js';
import { THREEPID_PROVIDERS, USERLVL } from '../../core/constants.js';
import socketEvents from '../../socket/socketEvents.js';
import { VIP_ENABLED } from '../../core/config.js';
import { parseVipDuration, VIP_TIER } from '../../core/vip.js';
import {
  createUserNotification, findNotificationTarget,
} from '../../data/sql/Notification.js';


const router = express.Router();

function maskIpAddress(value) {
  if (isIP(value) === 4) {
    return value.replace(/\.\d+$/, '.xxx');
  }
  if (isIP(value) === 6) {
    return `${value.slice(0, value.lastIndexOf(':') + 1)}xxx`;
  }
  return value.replace(
    /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
    (ip) => ip.replace(/\.\d+$/, '.xxx'),
  );
}

function redactIpData(value) {
  if (typeof value === 'string') {
    return maskIpAddress(value);
  }
  if (Array.isArray(value)) {
    return value.map(redactIpData);
  }
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        redactIpData(entryValue),
      ]),
    );
  }
  return value;
}

function rejectTrialModAction(req, res, actions) {
  if (req.user.userlvl !== USERLVL.TRIALMOD) return false;
  res.status(403).send(
    `Trial Mods cannot use ${actions} moderation actions`,
  );
  return true;
}

/*
 * parse multipart/form-data
 * ordinary fields will be under req.body[name]
 * files will be under req.files[name]
 */
router.use(urlEncoded, fileUpload({
  limits: {
    fileSize: 5 * 1024 * 1024,
    fields: 50,
    files: 1,
  },
}));

router.use(requireOidc('modtools', true));

/*
 * make sure User is logged in and at least Mod
 */
router.use(async (req, res, next) => {
  req.tickRateLimiter(1000);
  /*
   * special case for oauth, this user object has only a subset of values
   */
  if (!req.user && req.oidcUserId) {
    req.user = await findUserById(req.oidcUserId);
  }

  if (req.user?.userlvl === USERLVL.TRIALMOD) {
    const originalJson = res.json.bind(res);
    const originalSend = res.send.bind(res);
    res.json = (body) => originalJson(redactIpData(body));
    res.send = (body) => originalSend(
      typeof body === 'string' ? maskIpAddress(body) : body,
    );
  }

  if (!req.user) {
    logger.warn(
      `MODTOOLS> ${req.ip.ipString} tried to access modtools without login`,
    );
    req.tickRateLimiter(3000);
    const { t } = req.ttag;
    next(new Error(t`You are not logged in`));
    return;
  }
  const { userlvl } = req.user;
  if (!userlvl || userlvl < USERLVL.CHATMOD) {
    logger.warn(
      `MODTOOLS: ${req.ip.ipString} / ${req.user.id} tried to access modtools`,
    );
    req.tickRateLimiter(3000);
    const { t } = req.ttag;
    next(new Error(t`You are not allowed to access this page`));
    return;
  }

  if (!req.body?.cleanerstat && !req.body?.livelog) {
    logger.info(
      `MODTOOLS> access ${req.user.name}[${req.user.id}] -  ${req.ip.ipString}`,
    );
  }
  next();
});

/*
 * Post for chatmod + cleaner + janny + mod + admin
 */
router.post('/', async (req, res, next) => {
  try {
    if (req.body.livelog) {
      const ret = await AuthLogger.printLogs(
        req.user.userlvl, parseInt(req.body.lastts, 10) || 0,
      );
      res.json(ret);
      return;
    }
    if (req.body.mediaaction) {
      const { mediaidormbid, mediaaction, reason } = req.body;
      const msg = await executeMediaAction(
        mediaaction, mediaidormbid, reason, req.user,
      );
      res.send(msg);
      return;
    }
    next();
  } catch (err) {
    next(err);
  }
});

/*
 * just janny + mod + admin past here, no chatmods
 */
router.use(async (req, res, next) => {
  if (req.user.userlvl < USERLVL.JANNY) {
    const { t } = req.ttag;
    res.status(403).send(t`Just janny, mod or admin can do that`);
    return;
  }
  next();
});

/*
 * Post for janny + mod + admin
 */
router.post('/', async (req, res, next) => {
  try {
    if (req.body.protaction) {
      const {
        protaction, ulcoor, brcoor, canvasid,
      } = req.body;
      const [ret, msg] = await executeProtAction(
        protaction,
        ulcoor,
        brcoor,
        canvasid,
        req.user,
      );
      res.status(ret).send(msg);
      return;
    }
    if (req.body.rollbackdate) {
      if (rejectTrialModAction(req, res, 'canvas wipe')) return;
      // rollbackdate is date as YYYYMMdd
      // rollbacktime is time as hhmm
      const {
        rollbackdate, rollbacktime, ulcoor, brcoor, canvasid,
      } = req.body;
      if (req.user.userlvl < USERLVL.MOD) {
        /*
         * jannies can only rollback to yesterday max
         */
        let yesterday = new Date(Date.now() - 24 * 3600 * 1000);
        let yesterdayDay = yesterday.getUTCDate();
        let yesterdayMonth = yesterday.getUTCMonth() + 1;
        if (yesterdayDay < 10) yesterdayDay = `0${String(yesterdayDay)}`;
        if (yesterdayMonth < 10) yesterdayMonth = `0${String(yesterdayMonth)}`;
        // eslint-disable-next-line max-len
        yesterday = `${yesterday.getUTCFullYear()}${yesterdayMonth}${yesterdayDay}`;
        if (parseInt(rollbackdate, 10) < parseInt(yesterday, 10)) {
          res.status(403).send('You can not rollback further than yesterday');
          return;
        }
        let today = new Date();
        let todayDay = today.getUTCDate();
        let todayMonth = today.getUTCMonth() + 1;
        if (todayDay < 10) todayDay = `0${String(todayDay)}`;
        if (todayMonth < 10) todayMonth = `0${String(todayMonth)}`;
        today = `${today.getUTCFullYear()}${todayMonth}${todayDay}`;
        if (parseInt(rollbackdate, 10) > parseInt(today, 10)
          || (rollbackdate === today && today.getUTCHours() < 1)
        ) {
          res.status(403).send('You can not rollback to this time');
          return;
        }
      }
      const [ret, msg] = await executeRollback(
        rollbackdate,
        rollbacktime,
        ulcoor,
        brcoor,
        canvasid,
        req.user,
      );
      res.status(ret).send(msg);
      return;
    }
    next();
  } catch (err) {
    next(err);
  }
});

/*
 * just mods + admins past here, no Jannies
 */
router.use(async (req, res, next) => {
  if (req.user.userlvl < USERLVL.TRIALMOD) {
    const { t } = req.ttag;
    res.status(403).send(t`Just Trial Mods, mods and admins can do that`);
    return;
  }
  next();
});

/*
 * post just for admin + mod
 */
router.post('/', async (req, res, next) => {
  try {
    if (req.body.cleanerstat) {
      if (rejectTrialModAction(req, res, 'canvas cleaner')) return;
      const ret = CanvasCleaner.reportStatus();
      res.json(ret);
      return;
    }
    if (req.body.cleanercancel) {
      if (rejectTrialModAction(req, res, 'canvas cleaner')) return;
      const ret = CanvasCleaner.stop();
      res.send(ret);
      return;
    }
    if (req.body.watchaction) {
      if (req.user.userlvl < USERLVL.TRIALMOD) {
        res.status(403).send('Only Trial Mods and above can use Watch');
        return;
      }
      const {
        watchaction, ulcoor, brcoor, time, iid, canvasid, clr,
        maxrows, maxentities,
      } = req.body;
      // eslint-disable-next-line max-len
      logger.info(`MODTOOLS>WATCH>${req.user.name}[${req.user.id}]> ${watchaction} ${ulcoor} ${brcoor} ${time} ${iid}`);
      const ret = await executeWatchAction(
        watchaction,
        ulcoor,
        brcoor,
        /* time is interval in ms */
        time,
        iid,
        canvasid,
        clr,
        maxrows,
        maxentities,
      );
      res.json(ret);
      return;
    }
    if (req.body.iidaction) {
      const {
        iidaction, iid, bid, iidoruser,
        identifiers, reason, time, username, discordid,
      } = req.body;
      if (req.user.userlvl === USERLVL.TRIALMOD) {
        const restrictedAction = {
          givecaptcha: 'force captchas',
          changeusername: 'change usernames',
          baniid: 'ban by IID',
        }[iidaction];
        if (restrictedAction
          && rejectTrialModAction(req, res, restrictedAction)
        ) return;
        if (iidaction === 'ban'
          && String(identifiers || '').split(/\r?\n/).some((identifier) => (
            /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i
              .test(identifier.trim())
          ))) {
          if (rejectTrialModAction(req, res, 'ban by IID')) return;
        }
      }
      if (iidaction === 'linkdiscord') {
        if (req.user.userlvl < USERLVL.MOD) {
          res.status(403).send(
            'Only moderators and admins can link Discord accounts',
          );
          return;
        }
        const target = (typeof iidoruser === 'string')
          ? iidoruser.trim() : '';
        const discordId = (typeof discordid === 'string')
          ? discordid.trim() : '';
        if (!target || target.length > 100
          || /[\p{Cc}]/u.test(target)
          || !/^\d{17,20}$/.test(discordId)
        ) {
          res.status(400).send(
            'Enter a valid account identifier and Discord ID',
          );
          return;
        }

        let targetUser;
        if (/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(target)) {
          const matchingUsers = await findUsersByIID(target);
          if (matchingUsers.length > 1) {
            res.status(409).send(
              'This IID is associated with multiple accounts; '
              + 'use a User ID or nickname',
            );
            return;
          }
          [targetUser] = matchingUsers;
        } else {
          targetUser = await findUserByIdOrName(target);
        }
        if (!targetUser) {
          res.status(404).send(
            discordId
              ? 'No account is linked to that Discord ID'
              : 'Could not find an account for that ID, IID, or nickname',
          );
          return;
        }
        const linkResult = await linkDiscordTpid(
          targetUser.id, discordId, true,
        );
        if (linkResult === 'discord_in_use') {
          res.status(409).send(
            'That Discord ID is already linked to another account',
          );
          return;
        }
        logger.info(
          `MODTOOLS>LINK_DISCORD>${req.user.name}[${req.user.id}] `
          + `linked Discord ID to ${targetUser.name}[${targetUser.id}]`,
        );
        socketEvents.reloadUser(targetUser.id);
        res.send(
          `Discord ID linked to ${targetUser.name} [${targetUser.id}]`,
        );
        return;
      }
      if (iidaction === 'unlinkdiscord') {
        if (req.user.userlvl < USERLVL.MOD) {
          res.status(403).send(
            'Only moderators and admins can unlink Discord accounts',
          );
          return;
        }
        const target = (typeof iidoruser === 'string')
          ? iidoruser.trim() : '';
        const discordId = (typeof discordid === 'string')
          ? discordid.trim() : '';
        if ((!target && !discordId)
          || (!discordId && (target.length > 100 || /[\p{Cc}]/u.test(target)))
          || (discordId && !/^\d{17,20}$/.test(discordId))
        ) {
          res.status(400).send(
            'Enter either an account identifier or a valid Discord ID',
          );
          return;
        }

        let targetUser;
        if (discordId) {
          targetUser = await getUserByDiscordTpid(discordId);
        } else if (/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(target)) {
          const matchingUsers = await findUsersByIID(target);
          if (matchingUsers.length > 1) {
            res.status(409).send(
              'This IID is associated with multiple accounts; '
              + 'use a User ID or nickname',
            );
            return;
          }
          [targetUser] = matchingUsers;
        } else {
          targetUser = await findUserByIdOrName(target);
        }
        if (!targetUser) {
          res.status(404).send(
            'Could not find an account for that ID, IID, or nickname',
          );
          return;
        }

        const result = await unlinkDiscordTpid(
          targetUser.id, Boolean(targetUser.password),
        );
        if (result.status === 'not_linked') {
          res.status(404).send('This account has no linked Discord account');
          return;
        }
        if (result.status === 'last_login_method') {
          res.status(409).send(
            'Cannot unlink Discord because the account would have no login method',
          );
          return;
        }

        logger.info(
          `MODTOOLS>UNLINK_DISCORD>${req.user.name}[${req.user.id}] `
          + `unlinked Discord from ${targetUser.name}[${targetUser.id}]`,
        );
        socketEvents.reloadUser(targetUser.id);
        res.send(
          `Discord account unlinked from ${targetUser.name} `
          + `[${targetUser.id}]`,
        );
        return;
      }
      if (iidaction === 'giveNotif') {
        if (req.user.userlvl < USERLVL.MOD) {
          res.status(403).send(req.ttag.t`Just mods and admins can do that`);
          return;
        }
        const targetValue = (typeof iidoruser === 'string')
          ? iidoruser.trim() : '';
        const message = (typeof reason === 'string') ? reason.trim() : '';
        const validIID = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i
          .test(targetValue);
        const validID = /^[1-9]\d*$/.test(targetValue)
          && Number.isSafeInteger(Number(targetValue));
        const validNickname = targetValue.length > 0
          && targetValue.length <= 32
          && !/^\d+$/.test(targetValue)
          && !/\p{Cc}/u.test(targetValue);
        if ((!validIID && !validID && !validNickname)
          || targetValue.length > 100 || !message || message.length > 500
        ) {
          const { t } = req.ttag;
          res.status(400).send(
            t`Enter a valid target and a message of 500 characters or less`,
          );
          return;
        }
        const target = await findNotificationTarget(targetValue);
        if (!target) {
          res.status(404).send(req.ttag.t`User not found`);
          return;
        }
        await createUserNotification(
          target.id,
          req.user.id,
          req.user.name,
          req.user.userlvl,
          message,
        );
        const safeMessage = message.replace(/[\r\n]/g, ' ').slice(0, 500);
        logger.info(
          `MODTOOLS>GiveNotif>${req.user.name}[${req.user.id}]> `
          + `${target.name}[${target.id}] message=${safeMessage}`,
        );
        res.send(req.ttag.t`Notification sent to ${target.name}`);
        return;
      }
      const loggedTarget = (iidaction === 'checkFlag'
        || iidaction === 'checktwink' || iidaction === 'checkproxy')
        ? String(iidoruser || '').replace(/[\r\n]/g, ' ').slice(0, 100)
        : iidoruser;
      // eslint-disable-next-line max-len
      logger.info(`MODTOOLS>IID>${req.user.name}[${req.user.id}]> ${iidaction} ${iid} ${bid} ${loggedTarget} ${identifiers}`);
      const ret = await executeIIDAction(
        iidaction,
        iid,
        bid,
        iidoruser,
        identifiers,
        reason,
        time,
        username,
        req.user,
      );
      if (['checkFlag', 'checktwink', 'checkIID', 'checkproxy', 'searchalts']
        .includes(iidaction)
        || iidaction === 'listonline'
      ) {
        res.json(typeof ret === 'string' ? { error: ret } : ret);
      } else {
        res.send(ret);
      }
      return;
    }
    if (req.body.cleaneraction) {
      if (rejectTrialModAction(req, res, 'canvas wipe')) return;
      const {
        cleaneraction, ulcoor, brcoor, canvasid, templatecolors,
      } = req.body;
      const [ret, msg] = await executeCleanerAction(
        cleaneraction,
        ulcoor,
        brcoor,
        canvasid,
        req.user,
        templatecolors,
      );
      res.status(ret).send(msg);
      return;
    }
    if (req.body.pastecolor) {
      if (rejectTrialModAction(req, res, 'canvas wipe')) return;
      const {
        ulcoor, brcoor, colorindex, canvasid,
      } = req.body;
      const [ret, msg] = await executePasteColorAction(
        ulcoor,
        brcoor,
        colorindex,
        canvasid,
        req.user,
      );
      res.status(ret).send(msg);
      return;
    }
    if (req.body.imageaction) {
      if (rejectTrialModAction(req, res, 'canvas wipe')) return;
      const { imageaction, coords, canvasid } = req.body;
      const [ret, msg] = await executeImageAction(
        imageaction,
        req.files?.image?.data,
        coords,
        canvasid,
        req.user,
      );
      res.status(ret).send(msg);
      return;
    }
    next();
  } catch (err) {
    next(err);
  }
});


/*
 * just admins past here, no Mods
 */
router.use(async (req, res, next) => {
  if (req.user.userlvl < USERLVL.ADMIN) {
    const { t } = req.ttag;
    res.status(403).send(t`Just admins can do that`);
    return;
  }
  next();
});

/*
 * Post just for admin
 */
router.post('/', async (req, res, next) => {
  try {
    if (req.body.textaction) {
      /*
       * it can also be used for resetting users that got hacked, the naming
       * is old
       */
      const ret = await executeTextAction(
        req.body.textaction,
        req.body.text,
        req.user,
      );
      res.send(ret);
      return;
    }
    if (req.body.modlist) {
      const ret = await getHighUserLvlUsers();
      res.json(ret);
      return;
    }
    if (req.body.gamestate) {
      const ret = await getMultipleStates([
        'needVerification', 'malwareCheck',
      ]);
      res.json(ret);
      return;
    }
    if (req.body.remmod) {
      const ret = await demoteUser(req.body.remmod);
      res.send(ret);
      return;
    }
    if (req.body.makemod) {
      const ret = await promoteUser(
        req.body.makemod, parseInt(req.body.userlvl, 10),
      );
      res.json(ret);
      return;
    }
    if (req.body.managevip) {
      if (req.user.userlvl < USERLVL.ADMIN) {
        res.status(403).send('Only admins can change VIP tiers');
        return;
      }
      if (!VIP_ENABLED) {
        res.status(403).send(
          'VIP features are disabled by server configuration',
        );
        return;
      }
      const {
        vipaction, viptarget, viptier, vipduration, vipreason,
      } = req.body;
      const reason = (typeof vipreason === 'string')
        ? vipreason.replace(/[\r\n]/g, ' ').trim().slice(0, 200)
        : '';
      if (!['grant', 'revoke'].includes(vipaction)
        || typeof viptarget !== 'string' || !viptarget.trim()
        || viptarget.length > 100 || !reason
      ) {
        res.status(400).send('Enter a valid target, action, and reason');
        return;
      }
      const target = await findUserByVipTarget(viptarget);
      if (!target) {
        res.status(404).send('User not found');
        return;
      }

      const tier = (vipaction === 'revoke')
        ? VIP_TIER.NONE
        : Number(viptier);
      if (vipaction === 'grant'
        && ![
          VIP_TIER.PRINCE, VIP_TIER.KING, VIP_TIER.EMPEROR,
        ].includes(tier)
      ) {
        res.status(400).send('Select a valid VIP tier');
        return;
      }
      if (vipaction === 'grant') {
        const linkedProviders = await getTpidProviders(
          target.id, [THREEPID_PROVIDERS.DISCORD],
        );
        if (!linkedProviders.has(THREEPID_PROVIDERS.DISCORD)) {
          res.status(409).send(
            'Discord must be linked before granting VIP',
          );
          return;
        }
      }
      let expires = null;
      if (vipaction === 'grant') {
        const durationMs = parseVipDuration(vipduration);
        if (durationMs === undefined) {
          res.status(400).send(
            'Enter a duration such as 30d, 12h, or permanent',
          );
          return;
        }
        if (durationMs !== null) {
          expires = new Date(Date.now() + durationMs);
        }
      }
      const updated = await setUserVipTier(target.id, tier, expires);
      if (!updated) {
        res.status(404).send('User not found or tier update failed');
        return;
      }
      const roleSync = await syncVipRole(target.id, tier);
      if (!roleSync.success) {
        logger.error(
          `MODTOOLS>VIP>Discord role sync failed for ${target.id}: ${roleSync.reason}`,
        );
      }

      const tierLabel = tier === VIP_TIER.EMPEROR
        ? 'Emperor (VIP++)'
        : tier === VIP_TIER.KING
          ? 'King (VIP+)' : 'Prince (VIP)';
      const notification = (vipaction === 'grant')
        ? `Your ${tierLabel} membership was granted by staff${
          expires ? ` until ${expires.toISOString()}` : ' permanently'
        }. Reason: ${reason}`
        : `Your VIP membership was revoked by staff. Reason: ${reason}`;
      try {
        await createUserNotification(
          target.id,
          req.user.id,
          req.user.name,
          req.user.userlvl,
          notification,
        );
      } catch (error) {
        logger.error(
          `MODTOOLS>VIP>failed to notify user ${target.id}: ${error.message}`,
        );
      }
      socketEvents.reloadUser(target.id);
      socketEvents.notifyVipUser(target.id, notification);
      logger.info(
        `MODTOOLS>VIP>${req.user.name}[${req.user.id}] ${vipaction} `
        + `${target.name}[${target.id}] tier=${tier} `
        + `expires=${expires?.toISOString() || 'permanent'} reason=${reason}`,
      );
      const result = (vipaction === 'grant')
        ? `${tierLabel} granted`
        : 'VIP revoked';
      const syncWarning = roleSync.success
        ? '' : ` (Discord role warning: ${roleSync.reason})`;
      res.send(`${result} for ${target.name}${syncWarning}`);
      return;
    }
    if (req.body.getcooldowninfo) {
      if (req.user.userlvl < USERLVL.ADMIN) {
        res.status(403).send('Only admins can view cooldown settings');
        return;
      }
      const canvasId = req.body.canvasid || null;
      res.json({
        chaos: CooldownManager.getChaosState(),
        permanent: CooldownManager.getPermanentState(canvasId),
      });
      return;
    }
    if (req.body.startchaos) {
      if (req.user.userlvl < USERLVL.ADMIN) {
        res.status(403).send('Only admins can start Chaos Event');
        return;
      }
      const {
        usercd, vipcd, duration, basecd, vipbasecd, vippluscd, vippluspluscd,
      } = req.body;
      const result = await CooldownManager.startChaos({
        userCooldown: Number(usercd),
        vipCooldown: Number(vipcd),
        durationMinutes: Number(duration),
        baseCooldown: basecd ? Number(basecd) : null,
        vipBaseCooldown: vipbasecd ? Number(vipbasecd) : null,
        vipPlusCooldown: vippluscd ? Number(vippluscd) : null,
        vipPlusPlusCooldown: vippluspluscd ? Number(vippluspluscd) : null,
        adminUser: req.user,
      });
      res.send(result);
      return;
    }
    if (req.body.stopchaos) {
      if (req.user.userlvl < USERLVL.ADMIN) {
        res.status(403).send('Only admins can stop Chaos Event');
        return;
      }
      const result = await CooldownManager.stopChaos(req.user);
      res.send(result);
      return;
    }
    if (req.body.setpermanentcooldown) {
      if (req.user.userlvl < USERLVL.ADMIN) {
        res.status(403).send('Only admins can change permanent cooldowns');
        return;
      }
      const {
        usercd, vipcd, basecd, vipbasecd, vippluscd, vippluspluscd, cds,
      } = req.body;
      const result = await CooldownManager.setPermanentCooldown({
        userCooldown: Number(usercd),
        vipCooldown: Number(vipcd),
        canvasId: req.body.canvasid || null,
        cooldownReserve: Number(cds),
        baseCooldown: basecd ? Number(basecd) : null,
        vipBaseCooldown: vipbasecd ? Number(vipbasecd) : null,
        vipPlusCooldown: vippluscd ? Number(vippluscd) : null,
        vipPlusPlusCooldown: vippluspluscd ? Number(vippluspluscd) : null,
        adminUser: req.user,
      });
      res.send(result);
      return;
    }
    if (req.body.resetpermanentcooldown) {
      if (req.user.userlvl < USERLVL.ADMIN) {
        res.status(403).send('Only admins can reset permanent cooldowns');
        return;
      }
      const result = await CooldownManager.resetPermanentCooldown(
        req.user,
        req.body.canvasid || null,
      );
      res.send(result);
      return;
    }
    if (req.body.quickaction) {
      const ret = await executeQuickAction(req.body.quickaction, req.user);
      res.send(ret);
      return;
    }
    next();
  } catch (err) {
    next(err);
  }
});

router.use(async (req, res, next) => {
  next(new Error('Invalid request'));
});


router.use((err, req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }
  res.status(400).send(err.message);
  logger.error(
    // eslint-disable-next-line max-len
    `MODTOOLS> ${req.ip.ipString} / ${req.user.id} encountered error on using modtools: ${err.message}`,
  );
});

export default router;
