/*
 * display an avatar
 */
import { getColorFromId, getCharFromId } from '../core/utils.js';
import { cdn } from '../utils/utag.js';
import useLink from './hooks/link.js';
import { getUrlsFromMediaIdAndName } from '../utils/media/utils.js';
import { getVipAvatarGlow } from '../core/vipPersonalization.js';

const Avatar = ({
  uid, isDarkMode, avatarId, vipTier = 0, avatarGlow = null,
}) => {
  const link = useLink();
  const effectiveGlow = getVipAvatarGlow(vipTier, avatarGlow);

  const avatarStyle = {
    backgroundColor: getColorFromId(uid, isDarkMode),
    color: (isDarkMode) ? '#636363' : '#a7a5a5',
  };
  const [image, thumb] = getUrlsFromMediaIdAndName(avatarId, 'avatar');
  if (thumb) {
    avatarStyle.backgroundImage = `url(${cdn`${thumb}`})`;
  }

  return (
    <div
      className={`avatar${
        vipTier > 1 ? ' vip-plus' : vipTier === 1 ? ' vip' : ''
      }${vipTier >= 3 ? ' vip-emperor' : ''}${
        effectiveGlow ? ` glow-${effectiveGlow}` : ''
      }`}
      style={avatarStyle}
      onClick={(image) ? (evt) => {
        evt.stopPropagation();
        if (image) {
          link('PLAYER', {
            reuse: true,
            target: 'blank',
            args: { uri: image },
          });
        }
      } : undefined}
    >
      {!image && getCharFromId(uid)}
    </div>
  );
};

export default Avatar;
