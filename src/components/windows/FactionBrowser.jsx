import { useCallback, useEffect, useState } from 'preact/hooks';
import { useSelector } from '../../store/react-redux/index.js';
import { t } from 'ttag';
import { api, cdn } from '../../utils/utag.js';
import { getUrlsFromMediaIdAndName } from '../../utils/media/utils.js';
import useLink from '../hooks/link.js';

const PAGE_SIZE = 50;
const ROLE_NAMES = {
  owner: t`Owner`,
  leader: t`Leader`,
  deputy: t`Deputy`,
  officer: t`Officer`,
  member: t`Member`,
};

async function requestJson(route, options = {}) {
  const response = await fetch(api`${route}`, {
    credentials: 'include',
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || t`Request failed.`);
  return result;
}

function imageUrl(id) {
  if (!id) return null;
  if (id.startsWith('/')) return cdn`${id}`;
  const [url] = getUrlsFromMediaIdAndName(id, 'avatar');
  return url ? cdn`${url}` : null;
}

function FactionAvatar({ value, large = false }) {
  const url = imageUrl(value);
  return url ? (
    <img
      className={`faction-profile-avatar${large ? ' large' : ''}`}
      src={url}
      alt=""
    />
  ) : (
    <div className={`faction-profile-avatar faction-profile-avatar-empty${large ? ' large' : ''}`}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3 20 7.5v9L12 21l-8-4.5v-9L12 3Zm0 2.3L6 8.7v6.6l6 3.4 6-3.4V8.7l-6-3.4Z" />
      </svg>
    </div>
  );
}

const FactionBrowser = () => {
  const [factions, setFactions] = useState([]);
  const [search, setSearch] = useState('');
  const [openOnly, setOpenOnly] = useState(false);
  const [offset, setOffset] = useState(0);
  const [profile, setProfile] = useState(null);
  const [myFaction, setMyFaction] = useState(null);
  const [myPermissions, setMyPermissions] = useState(null);
  const [myTerritory, setMyTerritory] = useState(null);
  const [targetTerritory, setTargetTerritory] = useState(null);
  const [naps, setNaps] = useState([]);
  const [submittedApplications, setSubmittedApplications] = useState({});
  const [napsEnabled, setNapsEnabled] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const userId = useSelector((state) => state.user.id);
  const link = useLink();

  useEffect(() => {
    requestJson('/api/factions/naps/status')
      .then((result) => setNapsEnabled(Boolean(result.enabled)))
      .catch(() => setNapsEnabled(false));
  }, []);

  useEffect(() => {
    if (!userId) return;
    requestJson('/api/factions/mine')
      .then((result) => setMyFaction(result.factions?.[0] || null))
      .catch(() => setMyFaction(null));
  }, [userId]);

  const loadList = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(offset),
        search,
        open: openOnly ? 'true' : 'false',
      });
      const result = await requestJson(`/api/factions/list?${params}`);
      setFactions(result.factions || []);
      setError('');
    } catch (requestError) {
      setError(requestError.message);
    }
  }, [offset, search, openOnly]);

  useEffect(() => {
    const timeout = setTimeout(loadList, 200);
    return () => clearTimeout(timeout);
  }, [loadList]);

  const loadProfile = useCallback(async (factionId) => {
    setProfile(null);
    setMyFaction(null);
    setMyPermissions(null);
    setMyTerritory(null);
    setTargetTerritory(null);
    setNaps([]);
    setError('');
    try {
      const result = await requestJson(`/api/factions/${factionId}/profile`);
      setProfile(result.faction);
      const allyTerritory = await requestJson(`/api/factions/${factionId}/territory`)
        .catch(() => null);
      setTargetTerritory(allyTerritory);

      if (!userId) return;
      const mineResult = await requestJson('/api/factions/mine');
      const own = mineResult.factions?.[0];
      if (!own) return;
      setMyFaction(own);
      const [ownResult, ownTerritoryResult, napResult] = await Promise.all([
        requestJson(`/api/factions/my?factionId=${own.id}`),
        requestJson(`/api/factions/${own.id}/territory`),
        napsEnabled
          ? requestJson(`/api/factions/${own.id}/naps/mine`)
          : Promise.resolve({ naps: [] }),
      ]);
      setMyPermissions(ownResult.faction.permissions);
      setMyTerritory(ownTerritoryResult);
      setNaps(napResult.naps || []);
    } catch (requestError) {
      setError(requestError.message);
    }
  }, [userId, napsEnabled]);

  const performNapAction = useCallback(async (nap) => {
    if (!napsEnabled || !myPermissions?.manageNaps || !myFaction || busy) return;
    setBusy(true);
    setError('');
    try {
      await requestJson(`/api/factions/${myFaction.id}/naps/${nap.id}`, {
        method: 'DELETE',
      });
      window.dispatchEvent(new Event('factionnapupdate'));
      await loadProfile(profile.id);
    } catch (requestError) {
      setError(requestError.message);
    }
    setBusy(false);
  }, [busy, loadProfile, myFaction, myPermissions, napsEnabled, profile]);

  const proposeNap = useCallback(async () => {
    if (!napsEnabled || !myFaction || !profile || busy) return;
    setBusy(true);
    setError('');
    try {
      await requestJson(`/api/factions/${myFaction.id}/naps/request`, {
        method: 'POST',
        body: JSON.stringify({ otherFactionId: profile.id }),
      });
      window.dispatchEvent(new Event('factionnapupdate'));
      await loadProfile(profile.id);
    } catch (requestError) {
      setError(requestError.message);
    }
    setBusy(false);
  }, [busy, loadProfile, myFaction, napsEnabled, profile]);

  const submitApplication = useCallback(async (faction) => {
    setBusy(true);
    setError('');
    try {
      if (faction.openJoin) {
        await requestJson('/api/factions/join', {
          method: 'POST',
          body: JSON.stringify({ factionId: faction.id }),
        });
        setMyFaction(faction);
        window.dispatchEvent(new Event('factionmembershipchange'));
        setError(t`You joined the faction.`);
      } else {
        await requestJson('/api/factions/apply', {
          method: 'POST',
          body: JSON.stringify({ factionId: faction.id, message: '' }),
        });
        setSubmittedApplications((current) => ({
          ...current,
          [faction.id]: true,
        }));
        setError(t`Application submitted. The faction admins have been notified.`);
      }
    } catch (requestError) {
      setError(requestError.message);
    }
    setBusy(false);
  }, []);

  if (profile) {
    const isPrivate = profile.isPrivate;
    const canManageNaps = !!myPermissions?.manageNaps;
    const sameFaction = myFaction?.id === profile.id;
    const canProposeNap = napsEnabled && canManageNaps && !sameFaction
      && !!myTerritory && !!targetTerritory;
    const profileNaps = myFaction && !sameFaction
      ? naps.filter((nap) => nap.otherFaction.id === profile.id)
      : (profile.naps || []);
    return (
      <section className="faction-browser">
        <button type="button" className="faction-back" onClick={() => setProfile(null)}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14.5 5-7 7 7 7" /></svg>
          {t`Back to list`}
        </button>
        <article className="faction-profile-card">
          <FactionAvatar value={profile.flag} large />
          <h2>{profile.name}</h2>
          <button
            type="button"
            className="faction-profile-tag"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(`[${profile.tag}]`);
              } catch {
                const field = document.createElement('textarea');
                field.value = `[${profile.tag}]`;
                document.body.appendChild(field);
                field.select();
                document.execCommand('copy');
                field.remove();
              }
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            }}
            title={t`Copy faction tag`}
          >[{profile.tag}] <span>{copied ? t`Copied` : t`Copy`}</span></button>
          {!isPrivate && <p className="faction-profile-description">{profile.description || t`No description yet.`}</p>}
          <div className="faction-profile-count">
            {profile.memberCount || 0} {t`members`}
          </div>
          {!isPrivate && userId && !myFaction && (
            <button
              type="button"
              disabled={busy || submittedApplications[profile.id]}
              onClick={() => submitApplication(profile)}
            >
              {submittedApplications[profile.id]
                ? t`Application sent`
                : profile.openJoin ? t`Join` : t`Apply`}
            </button>
          )}
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
                    key={member.id}
                    type="button"
                    className="faction-roster-row"
                    onClick={() => link('USER', {
                      target: 'parent',
                      args: { username: member.id },
                    })}
                    role="row"
                  >
                    <span className="faction-roster-identity" role="cell">
                      {member.avatar ? (
                        <img src={imageUrl(member.avatar)} alt="" loading="lazy" />
                      ) : (
                        <span className="faction-roster-avatar-empty" aria-hidden="true">
                          <svg viewBox="0 0 24 24"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-8 9a8 8 0 0 1 16 0H4Z" /></svg>
                        </span>
                      )}
                      <span className="faction-roster-name">
                        {member.memberTag && <small>[{member.memberTag}]</small>}
                        <strong>{member.name}</strong>
                      </span>
                    </span>
                    <span className={`faction-role-badge role-${member.role}`} role="cell">
                      {ROLE_NAMES[member.role] || ROLE_NAMES.member}
                    </span>
                  </button>
                ))}
              </div>
            ) : <p className="faction-empty">{t`No members to display.`}</p>}
          </section>
        )}

        {(!napsEnabled || profileNaps.length > 0 || (myFaction && !sameFaction)) && (
          <section className="faction-profile-naps">
            <div className="faction-section-title">
              <h3>{t`NAP`}</h3>
              {!napsEnabled && <span className="faction-badge faction-badge-soon">{t`SOON`}</span>}
              {napsEnabled && myFaction && !sameFaction && canManageNaps && (
                <button
                  type="button"
                  disabled={!canProposeNap || busy}
                  title={!myTerritory || !targetTerritory
                    ? t`One of the factions has no active template` : undefined}
                  onClick={proposeNap}
                >
                  {t`Propose NAP`}
                </button>
              )}
            </div>
            {myFaction && !sameFaction && canManageNaps
              && (!myTerritory || !targetTerritory) && (
              <p className="faction-nap-warning">{t`One of the factions has no active template. NAP request unavailable.`}</p>
            )}
            {!napsEnabled && (
              <p className="faction-nap-warning" role="status">
                {t`NAP functionality is temporarily unavailable and will be added soon.`}
              </p>
            )}
            {napsEnabled && profileNaps.map((nap) => (
              <div className="faction-nap-row" key={nap.id}>
                <span>[{nap.otherFaction.tag}] {nap.otherFaction.name}</span>
                <span className={`faction-nap-status status-${nap.status}`}>
                  {nap.status === 'active' ? t`Active`
                    : nap.status === 'pending' ? t`Awaiting moderator review`
                      : nap.status === 'broken' ? t`Broken` : t`Rejected`}
                </span>
                {nap.status === 'active'
                  && (nap.breakAApproved || nap.breakBApproved) && (
                  <small>
                    Termination approvals: your faction {
                      (nap.incoming ? nap.breakBApproved : nap.breakAApproved) ? '✓' : '—'
                    } / {t`other faction`} {
                      (nap.incoming ? nap.breakAApproved : nap.breakBApproved) ? '✓' : '—'
                    }
                  </small>
                )}
                {canManageNaps && (
                  nap.status === 'active' || (nap.status === 'pending' && !nap.incoming)
                ) && (
                  <button
                    type="button"
                    disabled={busy || (nap.status === 'active'
                      && (nap.incoming ? nap.breakBApproved : nap.breakAApproved))}
                    onClick={() => performNapAction(nap)}
                  >
                    {nap.status === 'pending' ? t`Cancel`
                      : (nap.incoming ? nap.breakBApproved : nap.breakAApproved)
                          ? t`Awaiting other faction`
                          : (nap.incoming ? nap.breakAApproved : nap.breakBApproved)
                              ? t`Approve termination` : t`Request termination`}
                  </button>
                )}
              </div>
            ))}
          </section>
        )}
        {error && <p className="faction-browser-message" role="status">{error}</p>}
      </section>
    );
  }

  return (
    <section className="faction-browser">
      <div className="faction-directory-controls">
        <input
          type="search"
          value={search}
          onInput={(event) => {
            setOffset(0);
            setSearch(event.currentTarget.value);
          }}
          placeholder={t`Search by name or tag`}
          aria-label={t`Search factions`}
        />
        <label>
          <input
            type="checkbox"
            checked={openOnly}
            onChange={(event) => {
              setOffset(0);
              setOpenOnly(event.currentTarget.checked);
            }}
          />
          {t`Open only`}
        </label>
      </div>
      {error && <p className="faction-browser-message" role="alert">{error}</p>}
      <div className="faction-directory-list">
        {factions.map((faction) => (
          <article className="faction-directory-card" key={faction.id}>
            <FactionAvatar value={faction.flag} />
            <div className="faction-directory-copy">
              <button
                type="button"
                className="faction-directory-name"
                onClick={() => loadProfile(faction.id)}
              >{faction.name}</button>
              {faction.rankTitle && (
                <> <span className="faction-badge">{faction.rankTitle}</span></>
              )}
              <span className="faction-directory-tag">[{faction.tag}]</span>
              <p>{faction.isPrivate ? t`Private faction` : (faction.description || t`No description yet.`)}</p>
              <small>{t`Members`}: {faction.members}</small>
            </div>
            <div className="faction-directory-action">
              {!faction.isPrivate && userId && !myFaction && (
                <button
                  type="button"
                  disabled={busy || submittedApplications[faction.id]}
                  onClick={() => submitApplication(faction)}
                >
                  {submittedApplications[faction.id]
                    ? t`Application sent`
                    : faction.openJoin ? t`Join` : t`Apply`}
                </button>
              )}
              {faction.isPrivate && <span>{t`Private`}</span>}
            </div>
          </article>
        ))}
        {!factions.length && <p className="faction-empty">{t`No factions found.`}</p>}
      </div>
      <div className="faction-directory-pagination">
        <button type="button" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>
          {t`Prev`}
        </button>
        <span>{Math.floor(offset / PAGE_SIZE) + 1}</span>
        <button type="button" disabled={factions.length < PAGE_SIZE} onClick={() => setOffset(offset + PAGE_SIZE)}>
          {t`Next`}
        </button>
      </div>
    </section>
  );
};

export default FactionBrowser;
