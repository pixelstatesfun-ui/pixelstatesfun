/*
 * create a faction
 */
import logger from '../../core/logger.js';
import socketEvents from '../../socket/socketEvents.js';
import {
  validateFactionName, validateFactionTag, validateFactionTitle, validateDescription,
} from '../../utils/validation.js';
import {
  createFaction, getFactionInfo, setFactionBanner,
} from '../../data/sql/Faction.js';
import { getMediaType } from '../../data/sql/Media.js';
import { getUserRanks } from '../../data/redis/ranks.js';
import { invalidateUserFactionCache } from '../../core/factionTerritory.js';
import {
  MAX_FACTIONS_PER_USER, MAX_OWNED_FACTIONS_PER_USER, CHANNEL_TYPES,
} from '../../core/constants.js';

export default async function factioncreate(req, res) {
  const { ttag: { gettext, t }, user, body: factionData } = req;
  const { avatarId, bannerId } = factionData;
  let {
    isPrivate, isPublic,
    name, tag, title, description,
  } = factionData;

  name = name?.toLowerCase();
  tag = tag?.trim()?.toUpperCase();
  title = title?.trim();
  description = description?.trim();
  isPrivate = !!isPrivate;
  isPublic = !!isPublic;

  const errors = [];
  const [totalPixels] = await getUserRanks(user.id);
  if (totalPixels < 50000) {
    errors.push(t`You need at least 50,000 placed pixels to create a faction.`);
  }
  let validationError = gettext(validateFactionName(name));
  if (validationError) errors.push(validationError);
  validationError = gettext(validateFactionTag(tag));
  if (validationError) errors.push(validationError);
  validationError = gettext(validateFactionTitle(title));
  if (validationError) errors.push(validationError);
  validationError = gettext(validateDescription(description));
  if (validationError) errors.push(validationError);
  if (typeof avatarId !== 'string') {
    errors.push(t`No Avatar given`);
  }
  if (typeof bannerId !== 'string') {
    errors.push(t`No Banner given`);
  }

  if (errors.length) {
    res.status(400).json({ errors });
    return;
  }

  const avatarType = await getMediaType(avatarId);
  const bannerType = await getMediaType(bannerId);
  if (avatarType !== 'image') errors.push(t`Faction avatar must be a valid image.`);
  if (bannerType !== 'image') errors.push(t`Faction banner must be a valid image.`);
  if (errors.length) {
    res.status(400).json({ errors });
    return;
  }
  logger.info(
    `Faction create avatar check user=${user.id} `
    + `avatarId=${avatarId} type=${avatarType}`,
  );

  const createRet = await createFaction(
    user.id, name, tag, title, description, isPrivate, isPublic, avatarId,
  );
  if (createRet !== 0) {
    logger.warn(
      `Faction create failed user=${user.id} name=${name} `
      + `result=${createRet} avatarId=${avatarId} type=${avatarType}`,
    );
  }
  switch (createRet) {
    case 0:
      break;
    case 1:
      throw new Error(
        t`You can only have ${MAX_FACTIONS_PER_USER} factions in total`,
      );
    case 2:
      throw new Error(
        // eslint-disable-next-line max-len
        t`You can only be owner of ${MAX_OWNED_FACTIONS_PER_USER} factions in total`,
      );
    case 4:
      throw new Error(t`Avatar not given or not an image`);
    case 5:
      throw new Error(t`Name already in use.`);
    case 6:
      throw new Error(t`Tag already in use.`);
    default:
      throw new Error(t`Server Error`);
  }

  const factionInfo = await getFactionInfo(name);
  if (!factionInfo) {
    /* no reason why this should even happen */
    throw new Error(t`Server Error`);
  }
  if (!await setFactionBanner(factionInfo.sqlFid, bannerId)) {
    throw new Error(t`Could not save faction banner.`);
  }
  factionInfo.bannerId = bannerId;
  await invalidateUserFactionCache(user.id);

  /*
   * turn info object into faction object for user profile
   */
  factionInfo.isHidden = false;
  for (let i = 0; i < factionInfo.roles.length; i += 1) {
    const role = factionInfo.roles[i];
    role.isMember = true;
  }
  delete factionInfo.sqlFid;

  const patches = [];
  if (factionInfo.channelId) {
    const chatPatch = {
      op: 'addnx',
      path: `channels.${CHANNEL_TYPES.FACTION}[0:${factionInfo.channelId}]`,
      value: [
        factionInfo.channelId, factionInfo.name, Date.now(), Date.now(),
        false, factionInfo.avatarId,
      ],
    };
    socketEvents.patchUserState(user.id, 'chat', chatPatch);
    delete factionInfo.channelId;
    patches.push(['chat', chatPatch]);
  }

  const profilePatch = {
    op: 'pushnx',
    path: `factions[name:${name}]`,
    value: factionInfo,
  };
  socketEvents.patchUserState(user.id, 'profile', profilePatch);
  patches.push(['profile', profilePatch]);

  logger.info(`User ${user.id} created new faction ${name}`);
  res.json({
    status: 'ok',
    name,
    patches,
  });
}
