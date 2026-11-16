/*
 * print all informations about user
 *
 */
import { getBadgesOfUser } from '../../data/sql/Goodies.js';
import { getUserInfo } from '../../data/sql/User.js';
import { getUserRanks } from '../../data/redis/ranks.js';
import mapFlag from '../../utils/flagMapping.js';

export default async function userinfo(req, res) {
  /* user can be undefined when not logged in */
  const { ttag: { t }, body: { uidOrUsername } } = req;

  if (!uidOrUsername || (
    typeof uidOrUsername !== 'string' && typeof uidOrUsername !== 'number'
  )) {
    throw new Error('No user given');
  }

  const userData = await getUserInfo(uidOrUsername);

  if (!userData) {
    throw new Error('No such user exists');
  }
  if (userData.isPrivate) {
    throw new Error(t`This user is private`);
  }

  [userData.flagLegit, userData.flag] = mapFlag(
    userData.userlvl, userData.country, userData.flagUnlocked,
  );
  delete userData.country;
  delete userData.flagUnlocked;

  const { uid } = userData;

  const [badges, ranks] = await Promise.all([
    getBadgesOfUser(uid),
    getUserRanks(uid),
  ]);
  userData.badges = badges;

  if (ranks) {
    const [
      totalPixels,
      dailyTotalPixels,
      ranking,
      dailyRanking,
    ] = ranks;
    userData.totalPixels = totalPixels;
    userData.dailyTotalPixels = dailyTotalPixels;
    userData.ranking = ranking;
    userData.dailyRanking = dailyRanking;
  } else {
    userData.totalPixels = 0;
    userData.dailyTotalPixels = 0;
    userData.ranking = 0;
    userData.dailyRanking = 0;
  }

  res.json(userData);
}
