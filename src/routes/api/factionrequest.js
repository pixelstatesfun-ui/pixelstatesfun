import { createFactionRequest } from '../../data/sql/Faction.js';

export default async function factionrequest(req, res) {
  req.tickRateLimiter(2000);
  const { user, ip: { ipString }, body: { name } } = req;
  if (typeof name !== 'string' || !name) {
    throw new Error('No faction given');
  }
  const result = await createFactionRequest(user.id, ipString, name);
  switch (result) {
    case 0:
      res.json({ status: 'ok' });
      return;
    case 1:
      throw new Error('This faction does not exist');
    case 2:
      throw new Error('You are already part of this faction');
    case 3:
      throw new Error('You are banned from this faction');
    case 4:
      throw new Error('You already requested to join this faction');
    case 5:
      throw new Error('This faction accepts direct public joins');
    case 6:
      throw new Error('This faction is private');
    case 7:
      throw new Error('This faction has reached the join request limit');
    default:
      throw new Error('Server Error');
  }
}
