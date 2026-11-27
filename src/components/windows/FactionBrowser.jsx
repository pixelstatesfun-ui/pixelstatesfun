import { useCallback, useEffect, useState } from 'preact/hooks';
import { useSelector } from '../../store/react-redux/index.js';
import { t } from 'ttag';
import { api, cdn } from '../../utils/utag.js';
import { getUrlsFromMediaIdAndName } from '../../utils/media/utils.js';
import FactionProfileView from './FactionProfileView.jsx';

const PAGE_SIZE = 50;

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
  const userId = useSelector((state) => state.user.id);

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
    const canManageNaps = !!myPermissions?.manageNaps;
    const sameFaction = myFaction?.id === profile.id;
    const canProposeNap = napsEnabled && canManageNaps && !sameFaction
      && !!myTerritory && !!targetTerritory;
    const profileNaps = myFaction && !sameFaction
      ? naps.filter((nap) => nap.otherFaction?.id === profile.id)
      : (profile.naps || []);
    return (
      <FactionProfileView
        profile={profile}
        onBack={() => setProfile(null)}
        backLabel={t`Back to list`}
        userId={userId}
        myFaction={myFaction}
        busy={busy}
        applicationSent={Boolean(submittedApplications[profile.id])}
        onJoinOrApply={submitApplication}
        canProposeNap={canProposeNap}
        onProposeNap={proposeNap}
        napsEnabled={napsEnabled}
        profileNaps={profileNaps}
        canManageNaps={canManageNaps}
        onNapAction={performNapAction}
        error={error}
      />
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
