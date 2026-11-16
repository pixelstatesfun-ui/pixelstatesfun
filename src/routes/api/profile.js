/*
 * get profile information of user
 */
import { getBadgesOfUser } from '../../data/sql/Goodies.js';
import { getFactionsOfUser } from '../../data/sql/Faction.js';
import { getUserPersonalization } from '../../data/sql/Profile.js';
import { getActiveVipTier } from '../../data/sql/User.js';
import mapFlag from '../../utils/flagMapping.js';

export default async (req, res) => {
  const {
    user: {
      id: uid, userlvl,
      nameData: { avatarId },
    },
    ip: { country },
  } = req;
  const [
    badges,
    factionObject,
    personalization,
    vipTier,
  ] = await Promise.all([
    getBadgesOfUser(uid),
    getFactionsOfUser(uid, true),
    getUserPersonalization(uid),
    getActiveVipTier(uid),
  ]);
  const [flagLegit, flag] = mapFlag(
    userlvl, country, req.user.flagUnlocked,
  );
  if (vipTier < 1) {
    personalization.bannerPreset = null;
    personalization.bannerId = null;
    personalization.nicknameColor = null;
    personalization.avatarGlow = null;
    personalization.nicknameGradient = null;
  } else {
    personalization.avatarGlow = personalization.avatarGlow || 'gold';
    if (vipTier < 2) {
      personalization.bannerId = null;
      personalization.nicknameColor = null;
      personalization.nicknameGradient = null;
    }
  }
  res.status(200).json({
    badges,
    ...factionObject,
    ...personalization,
    flag,
    flagLegit,
    avatarId,
  });
};
