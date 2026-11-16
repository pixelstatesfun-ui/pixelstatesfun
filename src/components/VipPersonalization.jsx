import { createPortal, memo } from 'preact/compat';
import { useEffect, useRef, useState } from 'preact/hooks';
import { t } from 'ttag';

import { useDispatch } from '../store/react-redux/index.js';
import { changeProfile } from '../store/actions/thunks.js';
import {
  VIP_BANNER_PRESETS, isAllowedVipBannerPreset,
} from '../core/vipPersonalization.js';
import FileUpload from './FileUpload.jsx';
import VipBanner from './VipBanner.jsx';
import useProfile from './hooks/useProfile.js';

const VipPersonalization = ({
  vipTier, avatarGlow, nicknameGradient, onClose, onEditAvatar,
}) => {
  const dispatch = useDispatch();
  const uploadRef = useRef();
  const [fetchChange, setFetchChange] = useState(false);
  const [activeTab, setActiveTab] = useState('avatar');
  const [bannerPreset, bannerId] = useProfile((profile) => [
    profile.bannerPreset,
    profile.bannerId,
  ]);
  const selectedGlow = avatarGlow || 'gold';
  const [gradientStart, setGradientStart] = useState('#6ee7ff');
  const [gradientEnd, setGradientEnd] = useState('#c084fc');
  const hasEmperorPerks = vipTier >= 3;

  useEffect(() => {
    if (nicknameGradient) {
      const [start, end] = nicknameGradient.split(',');
      setGradientStart(start);
      setGradientEnd(end);
    }
  }, [nicknameGradient]);

  if (vipTier < 1) {
    return null;
  }

  const saveProfileChange = async (changes) => {
    if (fetchChange) {
      return;
    }
    setFetchChange(true);
    try {
      await dispatch(changeProfile(changes, true));
    } finally {
      setFetchChange(false);
    }
  };

  return createPortal((
    <div className="vip-customize-overlay">
      <section
        className="vip-personalization vip-customize-window"
        role="dialog"
        aria-modal="true"
        aria-label={t`VIP personalization`}
      >
        <header className="vip-customize-titlebar">
          <div>
            <span className="vip-customize-kicker">{t`VIP STUDIO`}</span>
            <h3>{t`Customize profile`}</h3>
          </div>
          <button
            type="button"
            className="vip-customize-close"
            aria-label={t`Close customization`}
            onClick={onClose}
          >×</button>
        </header>
        <nav
          className="vip-customize-tabs"
          aria-label={t`Customization sections`}
        >
          {[
            ['avatar', t`Avatar`],
            ['banner', t`Banner`],
            ...(hasEmperorPerks ? [['nickname', t`Nickname`]] : []),
          ].map(([tab, label]) => (
            <button
              key={tab}
              type="button"
              className={activeTab === tab ? 'active' : ''}
              aria-pressed={activeTab === tab}
              onClick={() => setActiveTab(tab)}
            >{label}</button>
          ))}
        </nav>
        {activeTab === 'avatar' && (
          <section className="vip-customize-panel">
            <h4>{t`Avatar glow`}</h4>
            <p>{t`Choose the glow shown around your profile avatar.`}</p>
            <div className="vip-glow-options">
              {[
                ['silver', t`Silver`],
                ['gold', t`Gold`],
                ['aurora', t`Aurora`],
              ].map(([glow, label]) => (
                <button
                  key={glow}
                  type="button"
                  className={`vip-glow-option glow-${glow}${
                    selectedGlow === glow ? ' selected' : ''
                  }`}
                  disabled={fetchChange}
                  aria-pressed={selectedGlow === glow}
                  onClick={() => saveProfileChange({ avatarGlow: glow })}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="vip-avatar-actions">
              <button
                type="button"
                className="vip-secondary-action"
                disabled={fetchChange}
                onClick={() => saveProfileChange({ avatarGlow: null })}
              >{t`Clear glow`}</button>
              <button
                type="button"
                className="vip-secondary-action"
                onClick={() => {
                  onClose();
                  onEditAvatar();
                }}
              >{t`Change or remove avatar`}</button>
            </div>
          </section>
        )}
        {activeTab === 'banner' && (
          <section className="vip-customize-panel">
            <h4>{t`Profile banner`}</h4>
            <p>{t`Choose a banner design or upload your own.`}</p>
            <div className="vip-banner-options">
              {Object.entries(VIP_BANNER_PRESETS)
                .filter(([preset]) => isAllowedVipBannerPreset(preset, vipTier))
                .map(([preset, option]) => (
                  <button
                    key={preset}
                    type="button"
                    className={`vip-banner-option${
                      bannerPreset === preset && !bannerId ? ' selected' : ''
                    }`}
                    style={{ backgroundImage: option.background }}
                    aria-pressed={bannerPreset === preset && !bannerId}
                    disabled={fetchChange}
                    onClick={() => saveProfileChange({ bannerPreset: preset })}
                  >
                    {option.label}
                  </button>
                ))}
            </div>
            <div className="vip-banner-preview-wrap">
              <VipBanner
                preset={bannerPreset}
                bannerId={bannerId}
                vipTier={vipTier}
              />
            </div>
            {(bannerPreset || bannerId) && (
              <button
                type="button"
                className="vip-secondary-action"
                disabled={fetchChange}
                onClick={() => saveProfileChange(hasEmperorPerks
                  ? { bannerPreset: null, bannerId: null }
                  : { bannerPreset: null })}
              >
                {t`Clear banner`}
              </button>
            )}
            {hasEmperorPerks && (
              <div className="vip-custom-banner">
                <h4>{t`Custom banner (Emperor)`}</h4>
                <FileUpload
                  acceptedTypes="image/*"
                  maxFiles={1}
                  size={44}
                  uploadRef={uploadRef}
                  preflightRoute="bannerpreflight"
                  uploadRoute="bannerupload"
                />
                <button
                  type="button"
                  disabled={fetchChange}
                  onClick={async () => {
                    if (fetchChange) {
                      return;
                    }
                    const files = await uploadRef.current?.();
                    if (files?.length) {
                      await saveProfileChange({ bannerId: files[0].mediaId });
                    }
                  }}
                >
                  {t`Save uploaded banner`}
                </button>
                <p>{t`Upload an image exactly 1200 × 300 pixels.`}</p>
              </div>
            )}
          </section>
        )}
        {activeTab === 'nickname' && hasEmperorPerks && (
          <section className="vip-customize-panel vip-custom-color">
            <h4>{t`Custom nickname gradient (Emperor)`}</h4>
            <div
              className="vip-gradient-preview"
              style={{
                backgroundImage: `linear-gradient(90deg, ${
                  gradientStart
                }, ${gradientEnd})`,
              }}
            />
            <label>
              {t`First gradient color`}
              <input
                type="color"
                value={gradientStart}
                onInput={(event) => setGradientStart(event.currentTarget.value)}
              />
            </label>
            <label>
              {t`Second gradient color`}
              <input
                type="color"
                value={gradientEnd}
                onInput={(event) => setGradientEnd(event.currentTarget.value)}
              />
            </label>
            <button
              type="button"
              disabled={fetchChange}
              onClick={() => saveProfileChange({
                nicknameGradient: `${gradientStart},${gradientEnd}`,
              })}
            >
              {t`Save gradient`}
            </button>
            <button
              type="button"
              disabled={fetchChange || !nicknameGradient}
              onClick={() => saveProfileChange({ nicknameGradient: null })}
            >
              {t`Reset gradient`}
            </button>
          </section>
        )}
      </section>
    </div>
  ), document.body);
};

export default memo(VipPersonalization);
