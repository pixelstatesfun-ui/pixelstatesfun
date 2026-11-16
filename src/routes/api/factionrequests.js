import {
  getFactionPermissionsOfUser, getFactionRequests,
} from '../../data/sql/Faction.js';
import { hasFactionPermission } from '../../core/constants.js';

export default async function factionrequests(req, res) {
  req.tickRateLimiter(2000);
  const { user, body: { name } } = req;
  if (typeof name !== 'string' || !name) {
    throw new Error('No faction given');
  }
  const { sqlFid, permissions } = await getFactionPermissionsOfUser(
    user.id, name,
  );
  if (!sqlFid) {
    throw new Error('This faction does not exist or you are not a member');
  }
  if (!hasFactionPermission(permissions, 'ACCEPT_MEMBERS')) {
    throw new Error('Insufficient permissions on this faction');
  }
  const requests = await getFactionRequests(sqlFid);
  if (!requests) {
    throw new Error('Could not load faction join requests');
  }
  res.json(requests);
}
