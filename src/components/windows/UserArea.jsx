/*
 * Menu to change user credentials
 */

import {
  useState, useCallback, useMemo, useEffect,
} from 'preact/hooks';
import {
  lazy as preactLazy, memo, Suspense,
} from 'preact/compat';
import {
  useSelector, shallowEqual, useDispatch,
} from '../../store/react-redux/index.js';
import { t } from 'ttag';

import { USERLVL } from '../../core/constants.js';
import { getStaffIconName } from '../../utils/flagMapping.js';
import { cdn, u } from '../../utils/utag.js';
import { getUrlsFromMediaIdAndName } from '../../utils/media/utils.js';
import UserMessages from '../UserMessages.jsx';
import UserNotifications from '../UserNotifications.jsx';
import BadgeList from '../BadgeList.jsx';
import ChangePassword from '../ChangePassword.jsx';
import ChangeName from '../ChangeName.jsx';
import ChangeMail from '../ChangeMail.jsx';
import DeleteAccount from '../DeleteAccount.jsx';
import LogInForm from '../LogInForm.jsx';
import SocialSettings from '../SocialSettings.jsx';
import MyFactions from './MyFactions.jsx';
import { logoutUser } from '../../store/actions/index.js';
import {
  requestLogOut, requestNotifications,
} from '../../store/actions/fetch.js';
import useProfile from '../hooks/useProfile.js';
import WindowContext from '../context/window.js';
import VipBanner from '../VipBanner.jsx';
import VipPersonalization from '../VipPersonalization.jsx';
import { getVipAvatarGlow } from '../../core/vipPersonalization.js';
import { getPixelRank } from '../../core/pixelRanks.js';
import PixelRankBadge from '../PixelRankBadge.jsx';
import TimelapseMaker from '../TimelapseMaker.jsx';

const Converter = preactLazy(
  () => import(/* webpackChunkName: "converter" */ './Converter.jsx'),
);
const Statistics = preactLazy(
  () => import(/* webpackChunkName: "stats" */ './Statistics.jsx'),
);
const Modtools = preactLazy(
  () => import(/* webpackChunkName: "modtools" */ './Modtools.jsx'),
);

const AREAS = {
  CHANGE_NAME: ChangeName,
  CHANGE_MAIL: ChangeMail,
  CHANGE_PASSWORD: ChangePassword,
  DELETE_ACCOUNT: DeleteAccount,
  SOCIAL_SETTINGS: SocialSettings,
};

const UserArea = () => {
  const [area, setArea] = useState('NONE');
  const [showVipCustomization, setShowVipCustomization] = useState(false);
  const [activeTab, setActiveTab] = useState('profile');
  const [statisticsTab, setStatisticsTab] = useState('total');
  const [modtoolsTab, setModtoolsTab] = useState(null);
  const [notificationCount, setNotificationCount] = useState(0);
  const userlvl = useSelector((state) => state.user.userlvl);
  const discordLinked = useSelector((state) => state.user.discordLinked);
  const vipTier = useSelector((state) => state.user.vipTier);
  const setStatisticsArgs = useCallback(({ activeTab: nextTab }) => {
    setStatisticsTab(nextTab);
  }, []);
  const ignoreStatisticsTitle = useCallback(() => undefined, []);
  const statisticsContext = useMemo(() => ({
    args: { activeTab: statisticsTab },
    setArgs: setStatisticsArgs,
    setTitle: ignoreStatisticsTitle,
  }), [statisticsTab, setStatisticsArgs, ignoreStatisticsTitle]);
  const setModtoolsArgs = useCallback(({ activeTab: nextTab }) => {
    setModtoolsTab(nextTab);
  }, []);
  const modtoolsContext = useMemo(() => ({
    args: { activeTab: modtoolsTab },
    setArgs: setModtoolsArgs,
    setTitle: ignoreStatisticsTitle,
  }), [modtoolsTab, setModtoolsArgs, ignoreStatisticsTitle]);

  const dispatch = useDispatch();
  useEffect(() => {
    let mounted = true;
    const onNotificationsUpdated = (event) => {
      setNotificationCount(Number(event.detail) || 0);
    };
    requestNotifications().then((response) => {
      if (!mounted) {
        return;
      }
      if (response.errors) {
        console.error(`Could not load notification count: ${response.errors[0]}`);
        return;
      }
      const count = Array.isArray(response) ? response.length : 0;
      setNotificationCount(count);
    }).catch((error) => {
      console.error(`Could not load notification count: ${error.message}`);
    });
    window.addEventListener(
      'user-notifications-updated', onNotificationsUpdated,
    );
    return () => {
      mounted = false;
      window.removeEventListener(
        'user-notifications-updated', onNotificationsUpdated,
      );
    };
  }, []);

  const logout = useCallback(async () => {
    const ret = await requestLogOut();
    if (ret) {
      dispatch(logoutUser());
    }
  }, [dispatch]);

  const [
    name,
    havePassword,
    uid,
  ] = useSelector((state) => [
    state.user.name,
    state.user.havePassword,
    state.user.id,
  ], shallowEqual);
  const [
    totalPixels,
    dailyTotalPixels,
    ranking,
    dailyRanking,
  ] = useSelector((state) => [
    state.ranks.totalPixels,
    state.ranks.dailyTotalPixels,
    state.ranks.ranking,
    state.ranks.dailyRanking,
  ], shallowEqual);
  const pixelRank = getPixelRank(totalPixels);
  const discordLinkSucceeded = new URLSearchParams(
    window.location.search,
  ).get('discordLink') === 'success';

  const done = useCallback(() => setArea('NONE'), []);

  const [
    badges, avatarId, flag, flagLegit, bannerId, bannerPreset, nicknameColor,
    avatarGlow, nicknameGradient,
  ] = useProfile((profile) => [
    profile.badges, profile.avatarId, profile.flag, profile.flagLegit,
    profile.bannerId, profile.bannerPreset, profile.nicknameColor,
    profile.avatarGlow, profile.nicknameGradient,
  ]);

  if (!name) {
    return <LogInForm title={t`Login to access more features and stats.`} />;
  }

  const Area = AREAS[area];
  const effectiveAvatarGlow = getVipAvatarGlow(vipTier, avatarGlow);

  const [, thumbUrl] = getUrlsFromMediaIdAndName(avatarId, 'avatar');
  const tabs = [
    ['profile', t`Profile`],
    ['notifications', t`Notifications`],
    ['statistics', t`Statistics`],
    ['converter', t`Converter`],
    ['factions', t`Factions`],
  ];
  if (totalPixels >= 300000) {
    tabs.push(['timelapse', t`Timelapse`]);
  }
  if (userlvl >= USERLVL.CHATMOD) {
    tabs.push(['modtools', t`ModTools`]);
  }

  return (
    <div className="content userarea">
      <h2>{t`User Area`}</h2>
      <nav className="userarea-tabs" aria-label={t`User area sections`}>
        {tabs.map(([tab, label]) => (
          <button
            type="button"
            key={tab}
            className={`userarea-tab${activeTab === tab ? ' active' : ''}`}
            aria-pressed={activeTab === tab}
            onClick={() => {
              setActiveTab(tab);
              setArea('NONE');
            }}
          >
            {label}
            {tab === 'notifications' && notificationCount > 0 && (
              <span className="userarea-notification-count">
                ({notificationCount})
              </span>
            )}
          </button>
        ))}
      </nav>

      {activeTab === 'profile' && (
        <section className="userarea-panel">
          <div className={`userarea-hero${
            vipTier >= 3 ? ' vip-emperor'
              : vipTier > 1 ? ' vip-plus' : vipTier === 1 ? ' vip' : ''
          }${effectiveAvatarGlow ? ` glow-${effectiveAvatarGlow}` : ''}`}>
            {vipTier > 0 && (
              <button
                type="button"
                className="userarea-banner-edit"
                aria-label={t`Click to customize your profile banner`}
                title={t`Click to customize your profile banner`}
                onClick={() => setShowVipCustomization(true)}
              >
                <VipBanner
                  preset={bannerPreset}
                  bannerId={bannerId}
                  vipTier={vipTier}
                />
              </button>
            )}
            <button
              type="button"
              className={`userarea-avatar${
                thumbUrl ? ' has-image' : ''
              }${vipTier > 1 ? ' vip-plus' : vipTier === 1 ? ' vip' : ''
              }${vipTier >= 3 ? ' vip-emperor' : ''}${
                effectiveAvatarGlow ? ` glow-${effectiveAvatarGlow}` : ''
              }`}
              style={thumbUrl
                ? { backgroundImage: `url(${cdn`${thumbUrl}`})` }
                : undefined}
              aria-label={t`Change or remove avatar`}
              title={t`Change or remove avatar`}
              onClick={(evt) => {
                evt.stopPropagation();
                if (vipTier > 0) {
                  setShowVipCustomization(true);
                } else {
                  setArea('SOCIAL_SETTINGS');
                }
              }}
            >
              {!thumbUrl && (name.trim().charAt(0).toUpperCase() || '?')}
            </button>
            <div className="userarea-identity">
              {(flag) && (
                <img
                  className={`userarea-flag${
                    getStaffIconName(flag) ? ' staff-icon' : ''
                  }`}
                  src={flagLegit
                    ? cdn`/cf/${getStaffIconName(flag) || flag}.${
                      getStaffIconName(flag) ? 'png' : 'gif'
                    }`
                    : cdn`${getUrlsFromMediaIdAndName(flag)[0]}`}
                  alt=""
                />
              )}
              <PixelRankBadge rank={pixelRank} size={22} />
              <strong
                className="userarea-name"
                style={nicknameGradient
                  ? {
                      backgroundImage: `linear-gradient(90deg, ${
                        nicknameGradient.split(',').join(', ')
                      })`,
                      backgroundClip: 'text',
                      color: 'transparent',
                      WebkitTextFillColor: 'transparent',
                    }
                  : nicknameColor ? { color: nicknameColor } : undefined}
              >{name}</strong>
              <span className="userarea-uid">UID #{uid}</span>
              {vipTier > 0 && (
                <span
                  className={`vip-profile-badge${
                    vipTier > 1 ? ' premium' : ''
                  }${vipTier >= 3 ? ' emperor' : ''}`}
                >
                  {vipTier >= 3 ? 'Emperor' : vipTier > 1 ? 'King' : 'Prince'}
                </span>
              )}
            </div>
          </div>
          {showVipCustomization && vipTier > 0 && (
            <VipPersonalization
              vipTier={vipTier}
              avatarGlow={effectiveAvatarGlow}
              nicknameGradient={nicknameGradient}
              onClose={() => setShowVipCustomization(false)}
              onEditAvatar={() => setArea('SOCIAL_SETTINGS')}
            />
          )}
          <UserMessages />
          <div className="userarea-stats">
            <div className="userarea-stat">
              <span>{t`Daily rating`}</span>
              <strong>#{dailyRanking || 'N/A'}</strong>
            </div>
            <div className="userarea-stat">
              <span>{t`Total rating`}</span>
              <strong>#{ranking || 'N/A'}</strong>
            </div>
            <div className="userarea-stat">
              <span>{t`Pixels today`}</span>
              <strong>{dailyTotalPixels.toLocaleString()}</strong>
            </div>
            <div className="userarea-stat">
              <span>{t`Pixels placed`}</span>
              <strong>{totalPixels.toLocaleString()}</strong>
            </div>
          </div>
          {discordLinkSucceeded && (
            <p className="userarea-discord-success" role="status">
              {t`Discord account linked successfully.`}
            </p>
          )}
          {!discordLinked && (
            <div className="userarea-discord-link">
              <div>
                <strong>{t`Connect your Discord account`}</strong>
                <span>
                  {t`Discord is optional for gameplay, required for staff/VIP.`}
                </span>
              </div>
              <a
                className="userarea-discord-button"
                href={u`/tp/link/discord?returnTo=${encodeURIComponent(
                  `${window.location.pathname}${window.location.search}${
                    window.location.hash
                  }`,
                )}`}
              >
                <img
                  className="userarea-discord-icon"
                  src={cdn`/discordlogo.svg`}
                  alt=""
                />
                {t`Link Discord!`}
              </a>
            </div>
          )}
          <BadgeList badges={badges} />
          <div className="userarea-actions">
            <button type="button" onClick={logout}>{t`Log out`}</button>
            <button type="button" onClick={() => setArea('CHANGE_NAME')}>
              {t`Change Nickname`}
            </button>
            <button type="button" onClick={() => setArea('CHANGE_MAIL')}>
              {t`Login Methods`}
            </button>
            <button
              type="button"
              onClick={() => setArea('CHANGE_PASSWORD')}
              className={!havePassword ? 'userarea-action-attention' : ''}
            >
              {havePassword ? t`Change Password` : t`Set Password`}
            </button>
            <button type="button" onClick={() => setArea('SOCIAL_SETTINGS')}>
              {t`Social Settings`}
            </button>
            <button type="button" onClick={() => setArea('DELETE_ACCOUNT')}>
              {t`Delete Account`}
            </button>
          </div>
          {(Area) && <Area key="area" done={done} />}
        </section>
      )}

      {activeTab === 'statistics' && (
        <section className="userarea-panel userarea-rating">
          <h3>{t`Your rating`}</h3>
          <div className="userarea-stats">
            <div className="userarea-stat">
              <span>{t`Daily rating`}</span>
              <strong>#{dailyRanking || 'N/A'}</strong>
            </div>
            <div className="userarea-stat">
              <span>{t`Total rating`}</span>
              <strong>#{ranking || 'N/A'}</strong>
            </div>
            <div className="userarea-stat">
              <span>{t`Pixels today`}</span>
              <strong>{dailyTotalPixels.toLocaleString()}</strong>
            </div>
            <div className="userarea-stat">
              <span>{t`Pixels placed`}</span>
              <strong>{totalPixels.toLocaleString()}</strong>
            </div>
          </div>
          <Suspense fallback={<p>{t`Loading statistics...`}</p>}>
            <WindowContext.Provider value={statisticsContext}>
              <Statistics />
            </WindowContext.Provider>
          </Suspense>
        </section>
      )}

      {activeTab === 'notifications' && (
        <section className="userarea-panel">
          <UserNotifications />
        </section>
      )}

      {activeTab === 'converter' && (
        <section className="userarea-panel">
          <Suspense fallback={<p>{t`Loading Converter...`}</p>}>
            <Converter />
          </Suspense>
        </section>
      )}

      {activeTab === 'factions' && (
        <section className="userarea-panel">
          <MyFactions />
        </section>
      )}

      {activeTab === 'timelapse' && totalPixels >= 300000 && (
        <TimelapseMaker />
      )}

      {activeTab === 'modtools' && userlvl >= USERLVL.CHATMOD && (
        <section className="userarea-panel userarea-modtools">
          <Suspense fallback={<p>{t`Loading ModTools...`}</p>}>
            <WindowContext.Provider value={modtoolsContext}>
              <Modtools />
            </WindowContext.Provider>
          </Suspense>
        </section>
      )}

    </div>
  );
};

export default memo(UserArea);
