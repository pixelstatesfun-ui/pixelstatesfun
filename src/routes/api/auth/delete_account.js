/*
 * request password change
 */

import { AuthLogger } from '../../../core/logger.js';
import socketEvents from '../../../socket/socketEvents.js';
import { deleteUser } from '../../../data/sql/User.js';
import { getIIDofIP } from '../../../data/sql/IP.js';
import { getBanInfos } from '../../../data/sql/Ban.js';
import { deleteUserFromRanks } from '../../../data/redis/cooldown.js';
import { clearCookie } from '../../../middleware/session.js';

import pool from '../../../data/sql/mariadb.js';

export default async (req, res) => {
  const { ttag: { t }, user, ip } = req;

  if (!user) {
    res.status(401).json({ errors: ['You must be logged in.'] });
    return;
  }

  const userAllowance = await user.getAllowance(true);
  const ipAllowance = ip ? await ip.getAllowance(true) : { isBanned: false };
  if (userAllowance.isBanned || ipAllowance.isBanned) {
    res.status(403).json({
      errors: ['Banned accounts cannot be deleted.'],
    });
    return;
  }

  const ipStr = ip?.ipString || req.ip || '127.0.0.1';
  const ipCountry = ip?.country || 'XX';
  const iid = await getIIDofIP(ipStr);

  // Check ban by UID, IP, and IID using Ban model
  const activeBans = await getBanInfos([ipStr], [user.id], iid ? [iid] : null, null, false, true);
  if (activeBans && activeBans.length > 0) {
    res.status(403).json({
      errors: ['Banned accounts cannot be deleted.'],
    });
    return;
  }

  const bannedRows = await pool.query(
    'SELECT b.id FROM Bans b '
    + 'LEFT JOIN UserBans ub ON ub.bid = b.id '
    + 'LEFT JOIN IPBans ib ON ib.bid = b.id '
    + 'WHERE (ub.uid = ? OR (ib.ip IS NOT NULL AND ib.ip = INET6_ATON(?))) '
    + 'AND (b.flags & 0x01) != 0 '
    + 'AND (b.expires > NOW() OR b.expires IS NULL) LIMIT 1',
    [user.id, ipStr],
  );
  if (bannedRows.length) {
    res.status(403).json({
      errors: ['Banned accounts cannot be deleted.'],
    });
    return;
  }

  const dmChannels = await deleteUser(user.id);

  AuthLogger.deleteUser(user, iid, ipCountry);

  if (!dmChannels) {
    res.status(500);
    res.json({
      errors: [t`Server error while deleting user.`],
    });
    return;
  }
  if (dmChannels.length) {
    dmChannels.forEach(({ dmuid }) => {
      socketEvents.reloadUser(dmuid);
    });
  }
  clearCookie(req, res);

  socketEvents.reloadUser(user.id);

  deleteUserFromRanks(user.id);

  res.json({
    success: true,
  });
};
