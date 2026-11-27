/*
 * Unified Faction Infobox component shared between Faction List (FactionBrowser)
 * and Statistics Leaderboard clicks (Faction.jsx), modeled on the cleaner Faction List profile card.
 */
/* eslint-disable max-len */

import { useState } from 'preact/hooks';
import { t } from 'ttag';
import { cdn } from '../../utils/utag.js';
import { getUrlsFromMediaIdAndName } from '../../utils/media/utils.js';
import useLink from '../hooks/link.js';

const ROLE_NAMES = {
  owner: t`Owner`,
  leader: t`Leader`,
  deputy: t`Deputy`,
  officer: t`Officer`,
  member: t`Member`,
};

function resolveMedia(id) {
  if (!id) return null;
  if (String(id).startsWith('/') || String(id).startsWith('http')) {
    return cdn`${id}`;
  }
  const [url] = getUrlsFromMediaIdAndName(id, 'avatar');
  return url ? cdn`${url}` : null;
}

const FactionProfileView = ({
  profile,
  onBack = null,
  backLabel = null,
  userId = null,
  myFaction = null,
  busy = false,
  applicationSent = false,
  onJoinOrApply = null,
  canProposeNap = false,
  onProposeNap = null,
  napsEnabled = true,
  profileNaps = [],
  canManageNaps = false,
  onNapAction = null,
  error = '',
  extraActions = null,
}) => {
  const [copied, setCopied] = useState(false);
  const link = useLink();

  if (!profile) return null;

  const isPrivate = Boolean(profile.isPrivate);
  const sameFaction = myFaction && Number(myFaction.id) === Number(profile.id);
  const avatarSrc = resolveMedia(profile.flag || profile.avatarId || profile.avatar);
  const bannerSrc = resolveMedia(profile.bannerId || profile.banner);
  const displayName = profile.title || profile.name;
  const tagText = profile.tag || '';

  const copyTag = async () => {
    const str = `[${tagText}]`;
    try {
      await navigator.clipboard.writeText(str);
    } catch {
      const field = document.createElement('textarea');
      field.value = str;
      document.body.appendChild(field);
      field.select();
      document.execCommand('copy');
      field.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  return (
    <section className="faction-browser faction-unified-infobox">
      {onBack && (
        <button type="button" className="faction-back" onClick={onBack}>
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path fill="currentColor" d="m14.5 5-7 7 7 7" />
          </svg>
          {backLabel || t`Back to list`}
        </button>
      )}

      <article className="faction-profile-card faction-unified-card">
        {bannerSrc && (
          <div
            className="faction-unified-banner"
            style={{ backgroundImage: `url("${bannerSrc}")` }}
          />
        )}

        <div className="faction-unified-hero">
          {avatarSrc ? (
            <img className="faction-profile-avatar large" src={avatarSrc} alt="" />
          ) : (
            <div className="faction-profile-avatar faction-profile-avatar-empty large">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 3 20 7.5v9L12 21l-8-4.5v-9L12 3Zm0 2.3L6 8.7v6.6l6 3.4 6-3.4V8.7l-6-3.4Z" />
              </svg>
            </div>
          )}

          <div className="faction-unified-identity">
            <div className="faction-unified-title-row">
              <h2>{displayName}</h2>
              {profile.rankTitle && (
                <span className="faction-badge">{profile.rankTitle}</span>
              )}
            </div>
            {tagText && (
              <button
                type="button"
                className="faction-profile-tag"
                onClick={copyTag}
                title={t`Copy faction tag`}
              >
                [{tagText}] <span>{copied ? t`Copied` : t`Copy`}</span>
              </button>
            )}
            {Array.isArray(profile.alliances) && profile.alliances.length > 0 && (
              <div className="faction-unified-pacts">
                {profile.alliances.map((pact, idx) => (
                  <span key={pact.id} className="faction-unified-pact-entry">
                    {idx > 0 && <span aria-hidden="true"> · </span>}
                    <span className={`faction-badge faction-badge-${pact.allianceType || 'alliance'}`}>
                      {pact.allianceType === 'union'
                        ? t`Union`
                        : pact.allianceType === 'coalition'
                          ? t`Coalition`
                          : t`Bilateral`}
                    </span>{' '}
                    <span>{pact.name}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {!isPrivate && (
          <p className="faction-profile-description">
            {profile.description || t`No description yet.`}
          </p>
        )}

        <div className="faction-unified-stats-grid">
          <div className="faction-unified-stat">
            <span className="stattext">{t`Members`}</span>
            <strong className="statvalue">{profile.memberCount ?? profile.members?.length ?? 0}</strong>
          </div>
          {Number.isFinite(Number(profile.totalPixels)) && (
            <div className="faction-unified-stat">
              <span className="stattext">{t`Total Pixels`}</span>
              <strong className="statvalue">{Number(profile.totalPixels).toLocaleString()}</strong>
            </div>
          )}
          {Number.isFinite(Number(profile.todayPixels ?? profile.dailyPixels)) && (
            <div className="faction-unified-stat">
              <span className="stattext">{t`Daily Pixels`}</span>
              <strong className="statvalue">{Number(profile.todayPixels ?? profile.dailyPixels).toLocaleString()}</strong>
            </div>
          )}
        </div>

        <div className="form-actions faction-unified-actions">
          {!isPrivate && userId && !myFaction && onJoinOrApply && (
            <button
              type="button"
              disabled={busy || applicationSent}
              onClick={() => onJoinOrApply(profile)}
            >
              {applicationSent
                ? t`Application sent`
                : (profile.openJoin || profile.isPublic) ? t`Join` : t`Apply`}
            </button>
          )}
          {extraActions}
        </div>
      </article>

      {!isPrivate && (
        <section className="faction-profile-roster">
          <h3>{t`Members`}</h3>
          {profile.members?.length ? (
            <div className="faction-roster-table" role="table" aria-label={t`Faction members`}>
              <div className="faction-roster-head" role="row">
                <span role="columnheader">{t`Player`}</span>
                <span role="columnheader">{t`Role`}</span>
              </div>
              {profile.members.map((member) => (
                <button
                  key={member.id || member.uid}
                  type="button"
                  className="faction-roster-row"
                  onClick={() => link('USER', {
                    target: 'parent',
                    args: { username: member.id || member.uid },
                  })}
                  role="row"
                >
                  <span className="faction-roster-identity" role="cell">
                    {member.avatar ? (
                      <img src={resolveMedia(member.avatar)} alt="" loading="lazy" />
                    ) : (
                      <span className="faction-roster-avatar-empty" aria-hidden="true">
                        <svg viewBox="0 0 24 24" width="18" height="18">
                          <path fill="currentColor" d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-8 9a8 8 0 0 1 16 0H4Z" />
                        </svg>
                      </span>
                    )}
                    <span className="faction-roster-name">
                      {member.memberTag && <small>[{member.memberTag}]</small>}
                      <strong>{member.name}</strong>
                    </span>
                  </span>
                  <span className={`faction-role-badge role-${member.role || 'member'}`} role="cell">
                    {ROLE_NAMES[member.role] || ROLE_NAMES.member}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className="faction-empty">{t`No members to display.`}</p>
          )}
        </section>
      )}

      {(profileNaps.length > 0 || (myFaction && !sameFaction && onProposeNap)) && (
        <section className="faction-profile-naps">
          <div className="faction-section-title">
            <h3>{t`NAP & Treaties`}</h3>
            {napsEnabled && myFaction && !sameFaction && canManageNaps && onProposeNap && (
              <button
                type="button"
                disabled={!canProposeNap || busy}
                onClick={onProposeNap}
              >
                {t`Propose NAP`}
              </button>
            )}
          </div>
          {profileNaps.map((nap) => (
            <div className="faction-nap-row" key={nap.id}>
              <span>
                [{nap.otherFaction?.tag || nap.targetFactionTag || 'NAP'}]{' '}
                {nap.otherFaction?.name || nap.targetFactionName || ''}
              </span>
              <span className={`faction-nap-status status-${nap.status}`}>
                {nap.status === 'active' ? t`Active`
                  : nap.status === 'pending' ? t`Awaiting review`
                    : nap.status === 'broken' ? t`Terminated` : t`Rejected`}
              </span>
              {canManageNaps && onNapAction && (
                nap.status === 'active' || (nap.status === 'pending' && !nap.incoming)
              ) && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onNapAction(nap)}
                >
                  {nap.status === 'pending' ? t`Cancel` : t`Request termination`}
                </button>
              )}
            </div>
          ))}
        </section>
      )}

      {error && <p className="faction-browser-message" role="status">{error}</p>}
    </section>
  );
};

export default FactionProfileView;
