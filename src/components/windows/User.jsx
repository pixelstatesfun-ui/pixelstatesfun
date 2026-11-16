/*
 * User
 */
import { useState, useEffect, useContext } from 'preact/hooks';
import { Fragment } from 'preact';
import { useSelector, useStore } from '../../store/react-redux/index.js';
import { t, jt } from 'ttag';

import IoIosRefresh from '../../icons/IoIosRefresh.svg';
import { cdn } from '../../utils/utag.js';
import { getUrlsFromMediaIdAndName } from '../../utils/media/utils.js';
import WindowContext from '../context/window.js';
import useLink from '../hooks/link.js';
import ClipboardCopyField from '../ClipboardCopyField.jsx';
import { buildPopUpUrl } from './popUpAvailable.js';
import { requestUserInfo } from '../../store/actions/fetch.js';
import { startDm, setUserBlock } from '../../store/actions/thunks.js';
import BadgeList from '../BadgeList.jsx';
import VipBanner from '../VipBanner.jsx';
import { getVipAvatarGlow } from '../../core/vipPersonalization.js';
import { getPixelRank } from '../../core/pixelRanks.js';
import PixelRankBadge from '../PixelRankBadge.jsx';
import PixelRankProgress from '../PixelRankProgress.jsx';
import { getStaffIconName } from '../../utils/flagMapping.js';

/* eslint-disable max-len */

const User = () => {
  /*
   * {
   *   uid,
   *   name,
   *   age: number of age in days,
   *   avatarId,
   *   vipTier,
   *   bannerPreset,
   *   bannerId,
   *   nicknameColor,
    *   avatarGlow,
    *   nicknameGradient,
   *   flag,
   *   flagLegit,
   *   isPrivate,
   *   activeFactionRoleName,
   *   activeFactionTitle,
   *   activeFactionRoleFlag,
   *   totalPixels,
   *   dailyTotalPixels,
   *   ranking,
   *   dailyRanking,
   *   factions: [{
   *     title,
   *     name,
   *   }, ...],
   *   badges: [{
   *     id,
   *     name,
   *     description,
   *     ts,
   *   }, ...],
   * } | null
   */
  const [userData, setUserData] = useState(null);
  const [errors, setErrors] = useState([]);
  const pixelRank = userData
    ? (userData.pixelRank || getPixelRank(userData.totalPixels)) : null;

  const { args: { username: uidOrUsername } } = useContext(WindowContext);

  const link = useLink();

  /* fetch name only to check if we are logged in */
  const ownUid = useSelector((state) => state.user.id);
  const blocked = useSelector((state) => state.chat.blocked);
  const store = useStore();

  useEffect(() => {
    (async () => {
      if (userData) {
        return;
      }
      const reqUserData = await requestUserInfo(uidOrUsername);
      if (reqUserData.errors) {
        setErrors(reqUserData.errors);
        return;
      }
      setErrors([]);
      setUserData(reqUserData);
    })();
  }, [userData, uidOrUsername]);

  if (!userData) {
    return (
      <div className="content" key="loading">
        {errors.map((error) => (
          <p key={error} className="errormessage">
            <span>{t`Error`}</span>:&nbsp;{error}</p>
        ))}
        {!errors.length && (<h3>{t`Loading...`}</h3>)}
      </div>
    );
  }

  const { uid } = userData;
  const effectiveAvatarGlow = getVipAvatarGlow(
    userData.vipTier, userData.avatarGlow,
  );

  const [mediaUrl, thumbUrl] = getUrlsFromMediaIdAndName(
    userData.avatarId, 'avatar',
  );

  let activeFactionTitle = null;
  let activeFactionRoleName = null;
  if (userData.activeFactionRoleName) {
    if (userData.activeFactionTitle) {
      activeFactionTitle = <strong>&quot;{userData.activeFactionTitle}&quot;</strong>;
    } else {
      activeFactionTitle = t`a hidden faction`;
    }
    activeFactionRoleName = <strong>&quot;{userData.activeFactionRoleName}&quot;</strong>;
  }

  let isBlocked = false;
  if (ownUid) {
    isBlocked = blocked.some((b) => b[0] === uid);
  }

  return (
    <div className="content userarea public-user-profile" key="userpage">
      <section className="userarea-panel">
        <div className={`userarea-hero${
          userData.vipTier >= 3 ? ' vip-emperor'
            : userData.vipTier > 1 ? ' vip-plus'
              : userData.vipTier === 1 ? ' vip' : ''
        }${effectiveAvatarGlow ? ` glow-${effectiveAvatarGlow}` : ''}`}>
          {(userData.vipTier > 0) && (
            <VipBanner
              preset={userData.bannerPreset}
              bannerId={userData.bannerId}
              vipTier={userData.vipTier}
            />
          )}
          {(thumbUrl) && (
            <div
              className={`avatar-big${
                userData.vipTier > 1 ? ' vip-plus' : userData.vipTier === 1 ? ' vip' : ''
              }${userData.vipTier >= 3 ? ' vip-emperor' : ''}${
                effectiveAvatarGlow
                  ? ` glow-${effectiveAvatarGlow}` : ''}`}
              style={{ backgroundImage: `url(${cdn`${thumbUrl}`})` }}
              onClick={(evt) => {
                evt.stopPropagation();
                link('PLAYER', {
                  reuse: true,
                  target: 'blank',
                  args: { uri: mediaUrl },
                });
              }}
            />
          )}
          <div className="userarea-identity">
            {(userData.flag) && (
              <img
                className={`userarea-flag${
                  getStaffIconName(userData.flag) ? ' staff-icon' : ''
                }`}
                src={userData.flagLegit
                  ? cdn`/cf/${getStaffIconName(userData.flag) || userData.flag}.${
                    getStaffIconName(userData.flag) ? 'png' : 'gif'
                  }`
                  : cdn`${getUrlsFromMediaIdAndName(userData.flag)[0]}`}
                alt=""
              />
            )}
            {pixelRank && <PixelRankBadge rank={pixelRank} size={22} />}
            <strong
              className="userarea-name"
              style={userData.nicknameGradient
                ? {
                    backgroundImage: `linear-gradient(90deg, ${
                      userData.nicknameGradient.split(',').join(', ')
                    })`,
                    backgroundClip: 'text',
                    color: 'transparent',
                    WebkitTextFillColor: 'transparent',
                  }
                : userData.nicknameColor
                  ? { color: userData.nicknameColor } : undefined}
            >
              {userData.activeFactionTag && (
                <span className="userarea-faction-tag">
                  [{userData.activeFactionTag}]&nbsp;
                </span>
              )}
              {userData.name}
            </strong>
            <span className="userarea-uid">#{uid}</span>
            {userData.vipTier > 0 && (
              <span
                className={`vip-profile-badge${
                  userData.vipTier > 1 ? ' premium' : ''
                }${userData.vipTier >= 3 ? ' emperor' : ''}`}
              >
                {userData.vipTier >= 3
                  ? 'Emperor' : userData.vipTier > 1 ? 'King' : 'Prince'}
              </span>
            )}
          </div>
        </div>
        {(userData.activeFactionRoleName) && (
          <p>
            {jt`Represents ${activeFactionTitle} as ${activeFactionRoleName}`}
            {(userData.activeFactionRoleFlag) && (
              <img
                className="chatflag presentation"
                src={cdn`${getUrlsFromMediaIdAndName(userData.activeFactionRoleFlag)[0]}`}
                alt=""
              />
            )}.&nbsp;
          </p>
        )}
        <div className="userarea-stats">
          <div className="userarea-stat">
            <span>{t`Today Placed Pixels`}</span>
            <strong>{userData.dailyTotalPixels.toLocaleString()}</strong>
          </div>
          <div className="userarea-stat">
            <span>{t`Daily Rank`}</span>
            <strong>{userData.dailyRanking ? `#${userData.dailyRanking}` : 'N/A'}</strong>
          </div>
          <div className="userarea-stat">
            <span>{t`Placed Pixels`}</span>
            <strong>{userData.totalPixels.toLocaleString()}</strong>
          </div>
          <div className="userarea-stat">
            <span>{t`Total Rank`}</span>
            <strong>{userData.ranking ? `#${userData.ranking}` : 'N/A'}</strong>
          </div>
          <div className="userarea-stat">
            <span>{t`Age`}</span>
            <strong>{userData.age} {t`days`}</strong>
          </div>
        </div>
        <PixelRankProgress rank={pixelRank} />
        <BadgeList badges={userData.badges} />
        {(userData.factions.length > 0) && (
          <table>
            <thead>
              <tr>
                <th>{t`Factions`}</th>
              </tr>
            </thead>
            <tbody>
              {userData.factions.map(({ title, name }) => (
                <tr key={name}>
                  <td>
                    <span
                      role="button"
                      tabIndex={-1}
                      className="modallink"
                      onClick={(evt) => {
                        evt.stopPropagation();
                        link('FACTION', {
                          target: 'blank',
                          args: { name },
                        });
                      }}
                    >
                      {`${title} [${name}]`}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {errors.map((error) => (
          <p key={error} className="errormessage">
            <span>{t`Error`}</span>:&nbsp;{error}</p>
        ))}
        <div className="form-actions">
          <ClipboardCopyField
            hideField="true"
            text={window.location.origin + buildPopUpUrl('USER', {
              username: uid,
            })}
          />
          <button
            type="button"
            title={t`Refresh`}
            onClick={() => {
              setUserData(null);
              setErrors([]);
            }}
          ><IoIosRefresh /></button>
          {(ownUid !== 0 && ownUid && ownUid !== uid) && (
            <Fragment key="user-actions">
              <button
                type="button"
                title={(isBlocked) ? t`Unblock` : t`Block`}
                onClick={() => {
                  setErrors([]);
                  store.dispatch(setUserBlock(uid, userData.name, !isBlocked));
                }}
              >
                {(isBlocked) ? t`Unblock` : t`Block`}
              </button>
              <button
                type="button"
                title={t`DM`}
                onClick={async (evt) => {
                  evt.stopPropagation();
                  const { chat: { channels } } = store.getState();
                  const cids = Object.keys(channels);
                  for (let i = 0; i < cids.length; i += 1) {
                    const cid = cids[i];
                    if (channels[cid].length === 4 && channels[cid][3] === uid) {
                      link('CHAT', {
                        target: 'parent',
                        args: { chatChannel: cid },
                      });
                      return;
                    }
                  }
                  const error = await store.dispatch(
                    startDm({ userId: uid }, (cid) => {
                      link('CHAT', {
                        target: 'parent',
                        args: { chatChannel: cid },
                      });
                    }, false),
                  );
                  if (error) {
                    setErrors([error]);
                  }
                }}
              >
                {t`DM`}
              </button>
            </Fragment>
          )}
        </div>
      </section>
    </div>
  );
};

export default User;
