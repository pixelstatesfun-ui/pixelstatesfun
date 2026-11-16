/*
 *
 * change stuff in a users profile
 *
 */
import logger from '../../core/logger.js';
import socketEvents from '../../socket/socketEvents.js';
import {
  getMediaDimensions, getMediaType,
} from '../../data/sql/Media.js';
import {
  setUserAvatar, setActiveFactionRole, setUserPersonalization,
} from '../../data/sql/Profile.js';
import { getActiveVipTier } from '../../data/sql/User.js';
import {
  hasVipBannerDimensions,
  isAllowedVipBannerPreset,
  isVipEmperorTier,
  isVipTier,
  isValidVipNicknameColor,
  isValidVipAvatarGlow,
  isValidVipNicknameGradient,
} from '../../core/vipPersonalization.js';

export default async function profilechange(req, res) {
  req.tickRateLimiter(3000);
  const { ttag: { t }, user, body: profile } = req;

  if (!profile || typeof profile !== 'object') {
    throw new Error('Invalid request, no profile object included');
  }

  if (Object.prototype.hasOwnProperty.call(profile, 'customFlag')) {
    throw new Error(t`Flags are assigned automatically`);
  }

  const { avatarId, activeFactionRole } = profile;
  let changed = false;
  const profileChanges = {};

  if (avatarId === null || typeof avatarId === 'string') {
    changed = true;
    profileChanges.avatarId = avatarId;
    if (avatarId) {
      const isLegitMedia = await getMediaType(avatarId) === 'image';
      if (!isLegitMedia) {
        throw new Error(t`Avatar can only be an image`);
      }
    }
    const success = await setUserAvatar(user.id, avatarId);
    if (!success) {
      throw new Error(t`Could not set your avatar`);
    }
    logger.info(`AUTH: User ${user.name} changed avatar to ${avatarId}`);
  }

  if (activeFactionRole === null || typeof activeFactionRole === 'string') {
    changed = true;
    profileChanges.activeFactionRole = activeFactionRole;
    const success = await setActiveFactionRole(user.id, activeFactionRole);
    if (!success) {
      throw new Error(t`Could not set your faction role`);
    }
    logger.info(
      `AUTH: User ${user.name} changed active faction to ${activeFactionRole}`,
    );
  }

  const personalization = {};
  const hasVipChanges = [
    'bannerPreset', 'bannerId', 'nicknameColor', 'avatarGlow',
    'nicknameGradient',
  ].some((key) => Object.prototype.hasOwnProperty.call(profile, key));
  const activeVipTier = hasVipChanges
    ? await getActiveVipTier(user.id)
    : 0;
  if (Object.prototype.hasOwnProperty.call(profile, 'bannerPreset')) {
    if (!isVipTier(activeVipTier)) {
      throw new Error(t`VIP is required to select a profile banner`);
    }
    if (!isAllowedVipBannerPreset(profile.bannerPreset, activeVipTier)) {
      throw new Error(t`Invalid profile banner`);
    }
    personalization.bannerPreset = profile.bannerPreset;
    profileChanges.bannerPreset = profile.bannerPreset;
    profileChanges.bannerId = null;
  }

  if (Object.prototype.hasOwnProperty.call(profile, 'bannerId')) {
    if (!isVipEmperorTier(activeVipTier) && profile.bannerId) {
      throw new Error(t`Emperor is required to use a custom profile banner`);
    }
    if (profile.bannerId !== null && typeof profile.bannerId !== 'string') {
      throw new Error(t`Invalid profile banner`);
    }
    if (profile.bannerId) {
      const dimensions = await getMediaDimensions(profile.bannerId);
      if (dimensions?.type !== 'image'
        || !hasVipBannerDimensions(dimensions.width, dimensions.height)
      ) {
        throw new Error(
          t`Custom banners must be images exactly 1200 by 300 pixels`,
        );
      }
    }
    personalization.bannerId = profile.bannerId;
    profileChanges.bannerId = profile.bannerId;
    profileChanges.bannerPreset = null;
  }

  if (Object.prototype.hasOwnProperty.call(profile, 'bannerPreset')
    && Object.prototype.hasOwnProperty.call(profile, 'bannerId')
    && (profile.bannerPreset !== null || profile.bannerId !== null)
  ) {
    throw new Error(t`Choose one profile banner`);
  }

  if (Object.prototype.hasOwnProperty.call(profile, 'nicknameColor')) {
    if (!isVipEmperorTier(activeVipTier) && profile.nicknameColor) {
      throw new Error(t`Emperor is required to use a custom nickname color`);
    }
    if (!isValidVipNicknameColor(profile.nicknameColor)) {
      throw new Error(t`Nickname color must be a six-digit HEX color`);
    }
    personalization.nicknameColor = profile.nicknameColor;
    profileChanges.nicknameColor = profile.nicknameColor;
  }

  if (Object.prototype.hasOwnProperty.call(profile, 'avatarGlow')) {
    if (!isVipTier(activeVipTier)) {
      throw new Error(t`VIP is required to customize an avatar glow`);
    }
    if (!isValidVipAvatarGlow(profile.avatarGlow)) {
      throw new Error(t`Invalid avatar glow for your VIP tier`);
    }
    personalization.avatarGlow = profile.avatarGlow || 'gold';
    profileChanges.avatarGlow = profile.avatarGlow || 'gold';
  }

  if (Object.prototype.hasOwnProperty.call(profile, 'nicknameGradient')) {
    if (!isVipEmperorTier(activeVipTier) && profile.nicknameGradient) {
      throw new Error(t`Emperor is required to customize a nickname gradient`);
    }
    if (!isValidVipNicknameGradient(profile.nicknameGradient)) {
      throw new Error(t`Invalid nickname gradient colors`);
    }
    personalization.nicknameGradient = profile.nicknameGradient || null;
    personalization.nicknameColor = null;
    profileChanges.nicknameGradient = profile.nicknameGradient || null;
    profileChanges.nicknameColor = null;
  }

  if (Object.keys(personalization).length) {
    const success = await setUserPersonalization(user.id, personalization);
    if (!success) {
      throw new Error(t`Could not update your VIP profile settings`);
    }
    changed = true;
  }

  if (!changed) {
    throw new Error('You did not define anything to change');
  }

  const changedKeys = Object.keys(profileChanges);
  for (let i = 0; i < changedKeys.length; i += 1) {
    const key = changedKeys[i];
    const value = profileChanges[key];
    socketEvents.patchUserState(user.id, 'profile', {
      op: 'set',
      path: key,
      value,
    });
  }
  if (Object.keys(personalization).length) {
    socketEvents.reloadUser(user.id);
  }

  res.json({
    status: 'ok',
  });
}
