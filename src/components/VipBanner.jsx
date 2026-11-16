import { memo } from 'preact/compat';
import { cdn } from '../utils/utag.js';
import { getUrlFromMediaIdAndName } from '../utils/media/utils.js';
import {
  VIP_BANNER_PRESETS, isAllowedVipBannerPreset,
} from '../core/vipPersonalization.js';

const VipBanner = ({
  preset, bannerId, vipTier = 0, className = '',
}) => {
  let backgroundImage;
  const bannerPreset = VIP_BANNER_PRESETS[preset];
  if (bannerId && vipTier >= 3) {
    backgroundImage = `url(${cdn`${getUrlFromMediaIdAndName(
      bannerId, 'banner',
    )}`})`;
  } else if (bannerPreset && isAllowedVipBannerPreset(preset, vipTier)) {
    backgroundImage = bannerPreset.background;
  } else {
    return null;
  }

  return (
    <div
      className={`vip-profile-banner${className ? ` ${className}` : ''}`}
      style={{ backgroundImage }}
      aria-hidden="true"
    />
  );
};

export default memo(VipBanner);
