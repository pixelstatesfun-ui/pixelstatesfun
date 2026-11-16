import logger from '../../core/logger.js';
import socketEvents from '../../socket/socketEvents.js';
import {
  acceptFactionRequest, deleteFactionRequest, getFactionInfo,
  getFactionPermissionsOfUser, getUserFactionHidden,
} from '../../data/sql/Faction.js';
import { CHANNEL_TYPES, hasFactionPermission } from '../../core/constants.js';
import { invalidateUserFactionCache } from '../../core/factionTerritory.js';

export default async function factionrequestmanage(req, res) {
  req.tickRateLimiter(700);
  const {
    user,
    body: {
      action, factionName, uid,
    },
  } = req;
  if (typeof factionName !== 'string' || !factionName) {
    throw new Error('No faction given');
  }
  if (!Number.isInteger(uid) || uid <= 0) {
    throw new Error('Invalid user');
  }
  const { sqlFid, permissions } = await getFactionPermissionsOfUser(
    user.id, factionName,
  );
  if (!sqlFid) {
    throw new Error('This faction does not exist or you are not a member');
  }
  if (!hasFactionPermission(permissions, 'ACCEPT_MEMBERS')) {
    throw new Error('Insufficient permissions on this faction');
  }

  if (action === 'reject') {
    const success = await deleteFactionRequest(sqlFid, uid);
    if (!success) {
      throw new Error('This join request does not exist');
    }
    res.json({ status: 'ok' });
    return;
  }
  if (action !== 'accept') {
    throw new Error('Invalid action');
  }

  const result = await acceptFactionRequest(uid, factionName);
  if (result !== 0) {
    const errors = {
      1: 'This faction does not exist',
      2: 'This join request does not exist',
      3: 'User is already part of this faction',
      4: 'This faction is full',
      5: 'User has reached the faction limit',
      6: 'User is banned from this faction',
    };
    throw new Error(errors[result] || 'Server Error');
  }

  await invalidateUserFactionCache(uid);
  const [faction, isHidden] = await Promise.all([
    getFactionInfo(factionName),
    getUserFactionHidden(uid, sqlFid),
  ]);
  if (!faction || isHidden === null) {
    throw new Error('Could not load accepted member data');
  }
  faction.isHidden = isHidden;
  for (const role of faction.roles) {
    role.isMember = role.isDefault;
  }
  delete faction.sqlFid;

  const patches = [];
  if (faction.channelId) {
    const ts = Math.floor(Date.now() / 1000);
    const chatPatch = {
      op: 'addnx',
      path: `channels.${CHANNEL_TYPES.FACTION}[0:${faction.channelId}]`,
      value: [
        faction.channelId, faction.name, ts, ts, false, faction.avatarId,
      ],
    };
    socketEvents.patchUserState(uid, 'chat', chatPatch);
    patches.push(['chat', chatPatch]);
    delete faction.channelId;
  }
  const profilePatch = {
    op: 'pushnx',
    path: `factions[name:${factionName}]`,
    value: faction,
  };
  socketEvents.patchUserState(uid, 'profile', profilePatch);
  patches.push(['profile', profilePatch]);

  logger.info(`User ${user.id} accepted ${uid} into faction ${factionName}`);
  res.json({ status: 'ok', patches });
}
