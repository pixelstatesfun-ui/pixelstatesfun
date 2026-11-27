import { useCallback, useEffect, useState } from 'preact/hooks';
import { t } from 'ttag';
import TreatyTermsBuilder, { formatTreatyTermSummary } from './TreatyTermsBuilder.jsx';
import TerritorySelector from './TerritorySelector.jsx';
import DiplomaticNews from './DiplomaticNews.jsx';

async function factionRequest(path, options = {}) {
  const response = await fetch(`/api/factions${path}`, {
    credentials: 'same-origin',
    ...options,
  });
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(t`The faction server returned an invalid response.`);
  }
  if (!response.ok) {
    const error = new Error(data.error || t`Faction request failed.`);
    error.status = response.status;
    throw error;
  }
  return data;
}

const NAP_TERM_LABELS = {
  'abandon_territory': t`Abandon territory`,
  'cease_activity': t`Cease activity in territory`,
  'sever_ally': t`Sever relations with an ally`,
  'surrender_restrictions': t`Surrender restrictions`,
};

const FactionTargetPicker = ({
  factionId,
  label,
  value,
  onChange,
  additionalTargets = [],
}) => {
  const [query, setQuery] = useState('');
  const [targets, setTargets] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const matchingTargets = [...new Map(
    [...additionalTargets, ...targets]
      .filter((target) => Number(target.id) !== Number(factionId))
      .map((target) => [Number(target.id), target]),
  ).values()];

  useEffect(() => {
    const search = query.trim();
    if (search.length < 2) {
      setTargets([]);
      setError('');
      setLoading(false);
      return undefined;
    }

    let active = true;
    setTargets([]);
    setError('');
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const result = await factionRequest(
          `/list?limit=50&search=${encodeURIComponent(search)}`,
        );
        if (active) {
          setTargets((result.factions || []).filter(
            (target) => !target.isPrivate
              && Number(target.id) !== Number(factionId),
          ));
          setError('');
          setLoading(false);
        }
      } catch (requestError) {
        if (active) {
          setError(requestError.message);
          setLoading(false);
        }
      }
    }, 300);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [factionId, query]);

  return (
    <div className="faction-target-picker">
      <label>
        {label}:
        <input
          type="search"
          value={query}
          placeholder={t`Search by faction name or tag`}
          onInput={(event) => {
            setQuery(event.currentTarget.value);
            onChange('');
          }}
        />
      </label>
      {matchingTargets.length > 0 && (
        <label>
          {t`Matching factions`}:
          <select
            value={value}
            required
            onChange={(event) => onChange(event.currentTarget.value)}
          >
            <option value="">{t`Choose a faction`}</option>
            {matchingTargets.map((target) => (
              <option key={target.id} value={target.id}>
                [{target.tag}] {target.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {loading && <small aria-live="polite">{t`Searching factions...`}</small>}
      {query.trim().length >= 2 && !loading && !matchingTargets.length && !error && (
        <small>{t`No public factions match that search.`}</small>
      )}
      {error && <span role="alert">{error}</span>}
    </div>
  );
};

const FactionSystemTab = ({
  faction = {}, tab, profile = false, diplomacySection = 'all',
}) => {
  const publicDirectory = profile && tab === 'alliances';
  const allianceTab = tab === 'alliances';
  const [managedFactions, setManagedFactions] = useState([]);
  const [actingFactionId, setActingFactionId] = useState(null);
  const resolvedFaction = allianceTab && actingFactionId !== null
    ? managedFactions.find((entry) => String(entry.id) === actingFactionId)
    : (publicDirectory ? undefined : faction);
  const [data, setData] = useState({});
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [napTarget, setNapTarget] = useState('');
  const [napTemplate, setNapTemplate] = useState('');
  const [napTerms, setNapTerms] = useState([]);
  const [napTerritory, setNapTerritory] = useState(null);
  const [peaceTarget, setPeaceTarget] = useState('');
  const [peaceTerms, setPeaceTerms] = useState('');
  const [peaceConditions, setPeaceConditions] = useState([]);
  const [warTarget, setWarTarget] = useState('');
  const [allianceName, setAllianceName] = useState('');
  const [allianceTag, setAllianceTag] = useState('');
  const [allianceTerms, setAllianceTerms] = useState('');
  const [allianceAvatar, setAllianceAvatar] = useState(null);
  const [allianceBanner, setAllianceBanner] = useState(null);
  const [allianceType, setAllianceType] = useState('alliance');
  const [allianceTarget, setAllianceTarget] = useState('');
  const [allianceFilter, setAllianceFilter] = useState('all');
  const [allianceSearch, setAllianceSearch] = useState('');
  const [allianceView, setAllianceView] = useState('directory');
  const [selectedAllianceId, setSelectedAllianceId] = useState(null);
  const [acceptedAllianceTerms, setAcceptedAllianceTerms] = useState({});
  const [allianceAction, setAllianceAction] = useState(null);
  const [inviteTarget, setInviteTarget] = useState('');
  const [confirmAllianceAction, setConfirmAllianceAction] = useState(null);
  const [settingsAllianceId, setSettingsAllianceId] = useState(null);
  const [settingsName, setSettingsName] = useState('');
  const [settingsTag, setSettingsTag] = useState('');
  const [settingsTermsText, setSettingsTermsText] = useState('');
  const [settingsSharedCoord, setSettingsSharedCoord] = useState(true);
  const [settingsCoordMode, setSettingsCoordMode] = useState('all_members');
  const [confirmDissolveId, setConfirmDissolveId] = useState(null);
  const [canvasId, setCanvasId] = useState('0');
  const [templateX, setTemplateX] = useState('0');
  const [templateY, setTemplateY] = useState('0');

  useEffect(() => {
    if (!allianceTab) return undefined;
    let active = true;
    factionRequest('/alliances/eligible-factions').then(({ factions }) => {
      if (!active) return;
      setManagedFactions(factions);
      if (publicDirectory) {
        setActingFactionId(String(
          factions.find((entry) => Number(entry.id) === Number(faction.id))?.id
          || (factions.length === 1 ? factions[0].id : ''),
        ));
      } else if (factions.length === 1 && Number(factions[0].id) !== Number(faction.id)) {
        setData((previous) => ({ alliances: previous.alliances }));
        setActingFactionId(String(factions[0].id));
      }
    }).catch((requestError) => {
      // Guests can browse. Only signed-in faction leaders can act.
      if (active && requestError.status !== 401) setError(requestError.message);
    });
    return () => { active = false; };
  }, [allianceTab, publicDirectory, faction.id]);

  const reload = useCallback(async (isCurrent) => {
    try {
      if (tab === 'napReview') {
        setData(await factionRequest('/naps/review'));
      } else if (tab === 'templates') {
        const [templates, details] = await Promise.all([
          factionRequest(`/${faction.id}/templates`),
          factionRequest(`/my?factionId=${faction.id}`),
        ]);
        setData({ ...templates, viewFaction: details.faction });
      } else if (tab === 'diplomacy') {
        const [
          napStatus,
          naps,
          diplomacy,
          templates,
          details,
          allAlliancesRes,
        ] = await Promise.all([
          factionRequest('/naps/status'),
          factionRequest(`/${faction.id}/naps/mine`),
          factionRequest(`/${faction.id}/diplomacy`),
          factionRequest(`/${faction.id}/templates`),
          factionRequest(`/my?factionId=${faction.id}`),
          factionRequest('/alliances').catch(() => ({ alliances: [] })),
        ]);
        setData({
          napStatus,
          ...naps,
          ...diplomacy,
          ...templates,
          allAlliances: allAlliancesRes.alliances || [],
          viewFaction: details.faction,
        });
      } else if (tab === 'alliances') {
        const { alliances } = await factionRequest('/alliances');
        if (!isCurrent()) return;
        setData((previous) => ({ ...previous, alliances }));
        const id = resolvedFaction?.id;
        if (!id) {
          setData({ alliances });
          return;
        }
        const [diplomacy, details, myRequests] = await Promise.all([
          factionRequest(`/${id}/diplomacy`),
          factionRequest(`/my?factionId=${id}`),
          factionRequest(`/alliances/requests/mine?factionId=${id}`),
        ]);
        if (!isCurrent()) return;
        setData((previous) => ({
          ...previous,
          myAlliances: diplomacy.alliances,
          myAllianceRequests: myRequests.requests,
          wars: diplomacy.wars || [],
          viewFaction: details.faction,
        }));
        const tasks = [factionRequest(`/${id}/naps/mine`).then(
          ({ naps }) => ({ naps }),
        )];
        if (['owner', 'leader'].includes(details.faction.role)) {
          tasks.push(
            factionRequest(`/alliances/requests?factionId=${id}`).then(
              ({ requests }) => ({ allianceRequests: requests }),
            ),
            factionRequest(`/alliances/invites/mine?factionId=${id}`).then(
              ({ invites }) => ({ allianceInvites: invites }),
            ),
          );
        }
        const statsTask = Promise.all(
          [...new Set((diplomacy.alliances || []).map((entry) => Number(entry.id)))]
            .map(async (allianceId) => [
              allianceId, await factionRequest(`/alliances/${allianceId}/stats?factionId=${id}`),
            ]),
        ).then((stats) => ({ allianceStats: Object.fromEntries(stats) }));
        const results = await Promise.allSettled([...tasks, statsTask]);
        if (!isCurrent()) return;
        results.forEach(({ status, value, reason }) => {
          if (status === 'fulfilled') setData((previous) => ({ ...previous, ...value }));
          else setError(reason.message);
        });
      } else if (tab === 'stats') {
        const [rankings, members, details] = await Promise.all([
          factionRequest('/rankings'),
          factionRequest(`/stats/members?factionId=${faction.id}`),
          factionRequest(`/my?factionId=${faction.id}`),
        ]);
        setData({ ...rankings, ...members, viewFaction: details.faction });
      }
    } catch (requestError) {
      if (isCurrent()) setError(requestError.message);
    }
  }, [faction.id, resolvedFaction?.id, tab]);

  useEffect(() => {
    let active = true;
    reload(() => active);
    return () => { active = false; };
  }, [reload, refresh]);

  useEffect(() => {
    setNapTarget('');
    setPeaceTarget('');
    setWarTarget('');
  }, [faction.id]);

  const submitJson = async (path, method, body) => {
    setError('');
    setMessage('');
    try {
      await factionRequest(path, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      setMessage(t`Diplomacy update saved.`);
      setRefresh((value) => value + 1);
      return true;
    } catch (requestError) {
      setError(requestError.message);
      return false;
    }
  };

  const submitMembership = async (alliance, acceptTerms, invited = false) => {
    const id = resolvedFaction?.id;
    setAllianceAction({ id: alliance.id, busy: true });
    try {
      const result = await factionRequest(
        `/alliances/${alliance.id}/${invited ? 'invite/accept' : 'join'}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ factionId: id, acceptTerms }),
        },
      );
      setAllianceAction({ id: alliance.id, pending: result.pendingApproval, message: result.pendingApproval
        ? t`Application sent. The founder can review it in Notifications.`
        : t`Your faction joined the alliance.` });
      setRefresh((value) => value + 1);
    } catch (requestError) {
      setAllianceAction({ id: alliance.id, error: requestError.message });
    }
  };

  const submitNap = async (event) => {
    event.preventDefault();
    if (!napTarget) {
      setError(t`Choose a target faction for the NAP.`);
      return;
    }
    const ok = await submitJson('/naps/propose', 'POST', {
      factionId: faction.id,
      targetFactionId: Number(napTarget),
      templateId: napTemplate ? Number(napTemplate) : null,
      territory: napTerritory || null,
      terms: napTerms.length ? napTerms : [{
        type: 'cease_activity',
        description: t`Mutual non-aggression over protected territory.`,
      }],
    });
    if (ok) {
      setNapTarget('');
      setNapTerms([]);
      setNapTerritory(null);
    }
  };

  const submitAlliance = async (event) => {
    event.preventDefault();
    const parsedTerms = allianceTerms
      .split('\n')
      .map((term) => term.trim())
      .filter(Boolean);
    setError('');
    setMessage('');
    try {
      if (allianceAvatar && allianceBanner) {
        const form = new FormData();
        form.append('factionId', String(resolvedFaction?.id));
        form.append('name', allianceName);
        if (allianceTag.trim()) form.append('tag', allianceTag.trim().toUpperCase());
        form.append('terms', JSON.stringify(parsedTerms));
        form.append('allianceType', allianceType);
        if (allianceType === 'coalition') form.append('targetFactionId', allianceTarget);
        form.append('avatar', allianceAvatar);
        form.append('banner', allianceBanner);
        await factionRequest('/alliances/create', { method: 'POST', body: form });
      } else {
        await factionRequest('/alliances/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            factionId: resolvedFaction?.id,
            name: allianceName,
            tag: allianceTag.trim().toUpperCase() || undefined,
            terms: parsedTerms,
            allianceType,
            targetFactionId: allianceType === 'coalition' ? Number(allianceTarget) : null,
          }),
        });
      }
      setMessage(
        allianceType === 'union'
          ? t`Union created.`
          : allianceType === 'coalition'
            ? t`Coalition created.`
            : t`Bilateral pact created.`,
      );
      setAllianceName('');
      setAllianceTag('');
      setAllianceTerms('');
      setAllianceTarget('');
      setAllianceView('home');
      setRefresh((value) => value + 1);
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const uploadTemplate = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');
    const form = event.currentTarget;
    const image = form.elements.image.files[0];
    if (!image) {
      setError(t`Choose a template image to upload.`);
      return;
    }
    const formData = new FormData();
    formData.append('image', image);
    formData.append('factionId', String(faction.id));
    formData.append('canvasId', canvasId);
    formData.append('x', templateX);
    formData.append('y', templateY);
    try {
      await factionRequest('/template', { method: 'POST', body: formData });
      setMessage(t`Shared template uploaded.`);
      form.reset();
      setRefresh((value) => value + 1);
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const handleDecision = (id, decision) => {
    submitJson(`/naps/${id}/${decision}`, 'POST', {});
  };

  const viewFaction = tab === 'alliances'
    ? (Number(data.viewFaction?.id) === Number(resolvedFaction?.id) ? data.viewFaction : {})
    : (data.viewFaction || faction);
  const allianceFactionId = viewFaction?.id;
  const leader = viewFaction.role === 'owner'
    || viewFaction.role === 'leader'
    || viewFaction.myRole === 'owner'
    || viewFaction.myRole === 'leader';
  const templates = data.templates || [];
  const peaceTargets = (data.wars || []).map((war) => {
    const isFactionA = Number(war.factionA) === Number(faction.id);
    return {
      id: isFactionA ? war.factionB : war.factionA,
      tag: isFactionA ? war.tagB : war.tagA,
      name: isFactionA ? (war.nameB || war.tagB) : (war.nameA || war.tagA),
    };
  });
  const getPactsForFaction = (targetId) => {
    if (!targetId) return [];
    const numId = Number(targetId);
    return (data.allAlliances || data.alliances || []).filter((pact) => (
      (pact.memberFactionIds || []).some((mid) => Number(mid) === numId)
      || (pact.members || []).some((m) => Number(m.factionId || m.id) === numId)
    ));
  };
  const myAllianceMemberships = (data.myAlliances || []).filter(
    (entry) => (
      Number(entry.factionId) === Number(allianceFactionId)
      || (entry.memberFactionIds || []).some((mid) => Number(mid) === Number(allianceFactionId))
      || (entry.members || []).some((m) => Number(m.factionId || m.id) === Number(allianceFactionId))
    ),
  );
  const hasAlliance = myAllianceMemberships.length > 0;
  const homeAlliances = [...new Map(myAllianceMemberships.map((entry) => [
    Number(entry.id),
    (data.alliances || []).find((alliance) => Number(alliance.id) === Number(entry.id))
    || entry,
  ])).values()];
  const unionOrCoalitionAlliances = homeAlliances.filter(
    (entry) => entry.allianceType === 'union' || entry.allianceType === 'coalition',
  );
  const hasPrimaryBloc = unionOrCoalitionAlliances.length > 0;
  const activeSettingsAlliance = unionOrCoalitionAlliances.find(
    (entry) => Number(entry.id) === Number(settingsAllianceId),
  ) || unionOrCoalitionAlliances[0] || null;

  useEffect(() => {
    if (!activeSettingsAlliance) return;
    setSettingsAllianceId(activeSettingsAlliance.id);
    setSettingsName(activeSettingsAlliance.name || '');
    setSettingsTag(activeSettingsAlliance.tag || '');
    setSettingsTermsText(
      Array.isArray(activeSettingsAlliance.terms)
        ? activeSettingsAlliance.terms.join('\n')
        : '',
    );
    setSettingsSharedCoord(activeSettingsAlliance.sharedCoordinationEnabled !== false);
    setSettingsCoordMode(activeSettingsAlliance.coordinationDrawMode || 'all_members');
  }, [activeSettingsAlliance?.id]);

  useEffect(() => {
    if (tab === 'alliances' && hasAlliance && !publicDirectory && allianceView === 'directory') {
      setAllianceView('home');
    }
  }, [tab, allianceFactionId, hasAlliance, publicDirectory]);
  const visibleAlliances = (data.alliances || []).filter(
    (entry) => {
      const matchesCategory = allianceFilter === 'all'
        || entry.allianceType === allianceFilter;
      const search = allianceSearch.trim().toLowerCase();
      const matchesSearch = !search || [
        entry.name,
        ...(entry.members || []).flatMap((member) => [
          member.name,
          member.tag,
        ]),
      ].some((value) => String(value || '').toLowerCase().includes(search));
      return matchesCategory && matchesSearch;
    },
  );

  return (
    <div className={`factionwin-${tab}`}>
      {error && <p className="errormessage">{error}</p>}
      {message && <p>{message}</p>}

      {tab === 'templates' && (
        <div>
          <h3>{t`Shared templates`}</h3>
          {templates.length ? (
            <ul>
              {templates.map((template) => (
                <li key={template.id}>
                  {template.title || `Template ${template.id}`}
                  {' — '}
                  {template.isActive ? t`Active` : t`Inactive`}
                  {' — '}
                  {template.width} × {template.height}
                </li>
              ))}
            </ul>
          ) : <p>{t`No faction templates have been uploaded.`}</p>}
          {viewFaction.permissions?.manageTemplates && (
            <form onSubmit={uploadTemplate}>
              <h4>{t`Upload shared template`}</h4>
              <label>{t`Image`}: <input
                type="file"
                name="image"
                accept="image/png,image/webp,image/jpeg"
                required /></label>
              <label>{t`Canvas ID`}: <input
                type="number"
                min="0"
                value={canvasId}
                onInput={(event) => setCanvasId(event.currentTarget.value)}
                required /></label>
              <label>{t`X`}: <input
                type="number"
                value={templateX}
                onInput={(event) => setTemplateX(event.currentTarget.value)}
                required /></label>
              <label>{t`Y`}: <input
                type="number"
                value={templateY}
                onInput={(event) => setTemplateY(event.currentTarget.value)}
                required /></label>
              <button type="submit">{t`Upload template`}</button>
            </form>
          )}
        </div>
      )}

      {tab === 'napReview' && (
        <section>
          <h3>{t`NAP proposals awaiting review`}</h3>
          {(data.naps || []).map((nap) => (
            <article key={nap.id}>
              <strong>{nap.nameA} [{nap.tagA}] / {nap.nameB} [{nap.tagB}]</strong>
              <p>{nap.startDate?.slice(0, 10) || t`On approval`}
                {' – '}{nap.endDate?.slice(0, 10) || t`Indefinite duration`}</p>
              <ul>
                {[nap.territory?.myTerritory, nap.territory?.targetTerritory]
                  .filter(Boolean).map((area, index) => (
                    <li key={index}>{t`Canvas`} {area.canvasId}
                      {` [${area.x1}, ${area.y1}]–[${area.x2}, ${area.y2}]`}</li>
                  ))}
                {(Array.isArray(nap.terms) ? nap.terms : []).map((term, index) => (
                  <li key={`term-${index}`}>
                    {NAP_TERM_LABELS[term.type]} {term.description || term.restrictions}
                    {term.allyFactionId ? ` (#${term.allyFactionId})` : ''}
                  </li>
                ))}
              </ul>
              <button type="button" onClick={() => handleDecision(nap.id, 'approve')}>
                {t`Approve`}
              </button>
              <button type="button" onClick={() => handleDecision(nap.id, 'reject')}>
                {t`Reject`}
              </button>
            </article>
          ))}
          {data.naps?.length === 0 && <p>{t`No NAP proposals.`}</p>}
        </section>
      )}

      {tab === 'diplomacy' && diplomacySection === 'news' && (
        <DiplomaticNews />
      )}

      {tab === 'diplomacy' && diplomacySection !== 'news' && (
        <div className="faction-diplomacy-stack">
          {(diplomacySection === 'all' || diplomacySection === 'naps') && (
            <section className="faction-system-section">
              <h3>{t`Non-Aggression Pacts & Multi-Term Treaties`}</h3>
              {data.napStatus?.message && <p>{data.napStatus.message}</p>}
              {(data.naps || []).map((nap) => (
                <article key={nap.id} className="faction-alliance-card diplomacy-record-card">
                  <div className="diplomacy-record-head">
                    <strong>
                      [{nap.tagA || nap.sourceFactionTag}] {nap.nameA || nap.sourceFactionName || ''}
                      {' ⇄ '}
                      [{nap.tagB || nap.targetFactionTag}] {nap.nameB || nap.targetFactionName || ''}
                    </strong>
                    <span className={`faction-badge diplomacy-status-${nap.status}`}>
                      {nap.status}
                    </span>
                  </div>
                  {nap.territory && (
                    <p className="diplomacy-territory-meta">
                      {t`Protected Territory`}: Canvas #{nap.territory.canvasId ?? 0}
                      {Number.isFinite(nap.territory.x1)
                        ? ` · [${nap.territory.x1}, ${nap.territory.y1}]–[${nap.territory.x2}, ${nap.territory.y2}]`
                        : ''}
                      {nap.territory.mode === 'template_mask' && nap.territory.pixelCount
                        ? ` · ${t`Auto Template Mask`} (${nap.territory.pixelCount.toLocaleString()} px)`
                        : nap.territory.polygon?.length
                          ? ` · ${nap.territory.mode || 'polygon'} (${nap.territory.polygon.length} pts)`
                          : ''}
                    </p>
                  )}
                  <ul className="faction-treaty-terms">
                    {(Array.isArray(nap.terms) ? nap.terms : []).map((term, index) => {
                      if (typeof term === 'string') {
                        return <li key={`${nap.id}-${index}`}>{term}</li>;
                      }
                      const label = NAP_TERM_LABELS[term?.type] || t`Treaty clause`;
                      const summary = formatTreatyTermSummary(term);
                      return (
                        <li key={`${nap.id}-${index}`}>
                          <strong>{label}</strong>
                          {summary && <span>: {summary}</span>}
                          {term?.forcesCoalitionDissolution && (
                            <span className="treaty-term-warning-badge">
                              {t`Dissolves Coalition`}
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                  {nap.status === 'pending' && (leader || viewFaction.permissions?.manageNaps) && (
                    <div className="diplomacy-record-actions">
                      <button
                        type="button"
                        className="faction-btn primary sm"
                        onClick={() => handleDecision(nap.id, 'approve')}
                      >
                        {t`Accept & Enact Terms`}
                      </button>
                      <button
                        type="button"
                        className="faction-btn danger sm"
                        onClick={() => handleDecision(nap.id, 'reject')}
                      >
                        {t`Reject`}
                      </button>
                    </div>
                  )}
                </article>
              ))}
              {!(data.naps || []).length && <p>{t`No NAP proposals yet.`}</p>}
              {(leader || viewFaction.permissions?.manageNaps || viewFaction.myPermissions?.manageNaps)
                && data.napStatus?.enabled !== false && (
                <form className="client-form diplomacy-composer-form" onSubmit={submitNap}>
                  <h4>{t`Propose a NAP / Treaty`}</h4>
                  <FactionTargetPicker
                    factionId={faction.id}
                    label={t`Target faction`}
                    value={napTarget}
                    onChange={setNapTarget}
                  />
                  {templates.length > 0 && (
                    <label>{t`Linked template (optional)`}: <select
                      value={napTemplate}
                      onChange={(event) => setNapTemplate(event.currentTarget.value)}>
                      <option value="">{t`Custom selection / Auto template upload`}</option>
                      {templates.filter((template) => template.isActive !== false).map((template) => (
                        <option
                          key={template.id}
                          value={template.id}>{template.title || `Template ${template.id}`}</option>
                      ))}
                    </select></label>
                  )}
                  <TerritorySelector
                    value={napTerritory}
                    onChange={setNapTerritory}
                  />
                  <TreatyTermsBuilder
                    terms={napTerms}
                    onChange={setNapTerms}
                    targetFactionId={napTarget ? Number(napTarget) : null}
                    targetPacts={getPactsForFaction(napTarget)}
                  />
                  <button type="submit" className="faction-btn primary" disabled={!napTarget}>
                    {t`Send NAP / Treaty Proposal`}
                  </button>
                </form>
              )}
            </section>
          )}

          {(diplomacySection === 'all' || diplomacySection === 'wars') && (
            <section className="faction-system-section">
              <h3>{t`Wars & Peace Treaties`}</h3>
              <h4>{t`Active wars`}</h4>
              {(data.wars || []).length ? (
                <ul className="diplomacy-wars-list">
                  {data.wars.map((war) => (
                    <li key={war.id || `${war.factionA}-${war.factionB}`} className="diplomacy-war-item">
                      <strong>
                        [{war.tagA}] {war.nameA || ''} ⚔ [{war.tagB}] {war.nameB || ''}
                      </strong>
                      <span>
                        {t`since`} {new Date(war.createdAt).toLocaleDateString()}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : <p>{t`There are no active wars involving this faction.`}</p>}

              {Array.isArray(data.treaties) && data.treaties.length > 0 && (
                <div className="diplomacy-signed-treaties">
                  <h4>{t`Signed Peace Treaties`}</h4>
                  {data.treaties.map((treaty) => (
                    <article key={treaty.id} className="faction-alliance-card diplomacy-record-card">
                      <div className="diplomacy-record-head">
                        <strong>
                          [{treaty.tagA}] 🕊 [{treaty.tagB}]
                        </strong>
                        <small>{new Date(treaty.createdAt).toLocaleDateString()}</small>
                      </div>
                      {treaty.notes && <p>{treaty.notes}</p>}
                      {Array.isArray(treaty.terms) && treaty.terms.length > 0 && (
                        <ul className="faction-treaty-terms">
                          {treaty.terms.map((term, idx) => (
                            <li key={`${treaty.id}-t-${idx}`}>
                              <strong>{NAP_TERM_LABELS[term.type] || t`Clause`}</strong>
                              {': '}{formatTreatyTermSummary(term)}
                              {term.forcesCoalitionDissolution && (
                                <span className="treaty-term-warning-badge">
                                  {t`Coalition Dissolved`}
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </article>
                  ))}
                </div>
              )}

              {leader && (
                <form
                  className="client-form diplomacy-composer-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    submitJson('/diplomacy/declare-war', 'POST', {
                      factionId: faction.id,
                      targetFactionId: Number(warTarget),
                    }).then((ok) => {
                      if (ok) setWarTarget('');
                    });
                  }}
                >
                  <h4>{t`Declare War`}</h4>
                  <FactionTargetPicker
                    factionId={faction.id}
                    label={t`Target faction`}
                    value={warTarget}
                    onChange={setWarTarget}
                  />
                  <button
                    type="submit"
                    className="faction-btn danger"
                    disabled={!warTarget}
                  >
                    {t`Declare war`}
                  </button>
                </form>
              )}

              {leader && (
                <form
                  className="client-form diplomacy-composer-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    submitJson('/diplomacy/peace', 'POST', {
                      factionId: faction.id,
                      targetFactionId: Number(peaceTarget),
                      terms: peaceConditions,
                      notes: peaceTerms,
                    }).then((ok) => {
                      if (ok) {
                        setPeaceTarget('');
                        setPeaceTerms('');
                        setPeaceConditions([]);
                      }
                    });
                  }}
                >
                  <h4>{t`Draft Peace Treaty (Multi-Condition)`}</h4>
                  <FactionTargetPicker
                    factionId={faction.id}
                    label={t`Target faction`}
                    value={peaceTarget}
                    onChange={setPeaceTarget}
                    additionalTargets={peaceTargets}
                  />
                  <TreatyTermsBuilder
                    terms={peaceConditions}
                    onChange={setPeaceConditions}
                    targetFactionId={peaceTarget ? Number(peaceTarget) : null}
                    targetPacts={getPactsForFaction(peaceTarget)}
                  />
                  <label>
                    {t`Additional treaty preamble / notes`}:
                    <textarea
                      value={peaceTerms}
                      placeholder={t`Optional summary or border notes...`}
                      onInput={(event) => setPeaceTerms(event.currentTarget.value)}
                    />
                  </label>
                  <button
                    type="submit"
                    className="faction-btn primary"
                    disabled={!peaceTarget || (!peaceConditions.length && !peaceTerms.trim())}
                  >
                    {t`Sign peace treaty`}
                  </button>
                </form>
              )}
            </section>
          )}
        </div>
      )}

      {tab === 'alliances' && (
        <div className="faction-alliance">
          {managedFactions.length > 0 && (publicDirectory || managedFactions.length > 1
            || Number(managedFactions[0].id) !== Number(faction.id)) && (
            <label>
              {t`Apply on behalf of`}:{' '}
              <select
                value={actingFactionId ?? String(faction.id || '')}
                disabled={allianceAction?.busy}
                onChange={(event) => {
                  setActingFactionId(event.currentTarget.value);
                  setAllianceView('directory');
                  setAcceptedAllianceTerms({});
                  setAllianceAction(null);
                  setError('');
                  setMessage('');
                  setData((previous) => ({ alliances: previous.alliances }));
                }}
              >
                <option value="">{t`Choose a faction`}</option>
                {managedFactions.map((entry) => (
                  <option key={entry.id} value={entry.id}>[{entry.tag}] {entry.name}</option>
                ))}
              </select>
            </label>
          )}
          <nav
            className="faction-alliance-tabs"
            aria-label={t`Alliance sections`}>
            {hasAlliance && (
              <button
                type="button"
                className={allianceView === 'home' ? 'selected' : ''}
                onClick={() => setAllianceView('home')}
              >{t`My Pacts`}</button>
            )}
            {unionOrCoalitionAlliances.length > 0 && (
              <button
                type="button"
                className={allianceView === 'settings' ? 'selected' : ''}
                onClick={() => setAllianceView('settings')}
              >{t`Union / Coalition Settings`}</button>
            )}
            {hasAlliance && (
              <button
                type="button"
                className={allianceView === 'stats' ? 'selected' : ''}
                onClick={() => setAllianceView('stats')}
              >{t`Statistics`}</button>
            )}
            {leader && (
              <button
                type="button"
                className={allianceView === 'notifications' ? 'selected' : ''}
                onClick={() => setAllianceView('notifications')}
              >
                {t`Notifications`}
                {((data.allianceRequests || []).length + (data.allianceInvites || []).length) > 0
                  && (
                    <span
                      className="faction-alliance-notification-count">{(data.allianceRequests || []).length + (data.allianceInvites || []).length}</span>
                  )}
              </button>
            )}
            <button
              type="button"
              className={allianceView === 'directory' ? 'selected' : ''}
              onClick={() => setAllianceView('directory')}
            >{t`Alliance directory`}</button>
            {leader && (
              <button
                type="button"
                className={allianceView === 'found' ? 'selected' : ''}
                onClick={() => setAllianceView('found')}
              >{t`Create Pact / Alliance`}</button>
            )}
          </nav>
          {allianceView === 'home' && hasAlliance && (
            <section className="faction-alliance-home">
              <div className="faction-alliance-home-grid">
                {homeAlliances.map((alliance) => {
                  const members = alliance.members || (data.myAlliances || [])
                    .filter((entry) => Number(entry.id) === Number(alliance.id))
                    .map((entry) => ({
                      factionId: entry.factionId,
                      tag: entry.tag,
                      name: entry.factionName,
                    }));
                  const allianceWars = (data.wars || []).filter((war) => (
                    members.some((member) => (
                      Number(member.factionId) === Number(war.factionA)
                      || Number(member.factionId) === Number(war.factionB)
                    ))
                  ));
                  const isFounder = Number(alliance.founderFactionId) === Number(allianceFactionId);
                  const confirmed = confirmAllianceAction === alliance.id;
                  return (
                    <article
                      className="faction-alliance-home-card"
                      key={alliance.id}>
                      {(alliance.bannerFileName || alliance.avatarFileName) && (
                        <div
                          className="faction-alliance-home-banner"
                          style={alliance.bannerFileName ? {
                            backgroundImage: `linear-gradient(90deg, rgba(10, 17, 29, 0.34), rgba(10, 17, 29, 0.08)), url("/api/factions/alliances/${alliance.id}/image/banner")`,
                          } : undefined}
                        >
                          {alliance.avatarFileName && (
                            <img
                              className="faction-alliance-home-avatar"
                              src={`/api/factions/alliances/${alliance.id}/image/avatar`}
                              alt=""
                            />
                          )}
                        </div>
                      )}
                      <div className="faction-alliance-home-card-heading">
                        <div>
                          <span
                            className={`faction-alliance-category-badge ${alliance.allianceType}`}>
                            {alliance.allianceType === 'coalition'
                              ? t`Coalition`
                              : alliance.allianceType === 'union'
                                ? t`Union` : t`Bilateral Pact`}
                          </span>
                          <h4>{alliance.name}{alliance.tag ? ` [${alliance.tag}]` : ''}</h4>
                        </div>
                        <span className="faction-alliance-count">
                          {members.length} {t`factions`}
                        </span>
                      </div>
                      {alliance.targetFactionId && (
                        <p className="faction-alliance-target">
                          {t`Coalition target`}: #{alliance.targetFactionId}
                        </p>
                      )}
                      <section className="faction-alliance-members">
                        <h5>{t`Alliance Members`}</h5>
                        <div className="faction-alliance-member-list">
                          {members.map((member) => (
                            <span
                              className="faction-alliance-member"
                              key={member.factionId}
                            >
                              <strong>[{member.tag || '—'}]</strong>
                              {member.name}
                            </span>
                          ))}
                        </div>
                      </section>
                      <div className="faction-alliance-home-columns">
                        <section>
                          <h5>{t`Wars & Treaties`}</h5>
                          <strong>{allianceWars.length}</strong>
                          <span>{t`active wars involving your faction`}</span>
                          <strong>{(data.naps || []).filter((nap) => nap.status === 'active').length}</strong>
                          <span>{t`active non-aggression treaties`}</span>
                        </section>
                        <section>
                          <h5>{t`Pact mechanics`}</h5>
                          <p>{alliance.allianceType === 'coalition'
                            ? t`War coalition grouped on leaderboards. If the Coalition Leader accepts a sever-coalition clause, the coalition dissolves.`
                            : alliance.allianceType === 'union'
                              ? t`Long-term Union grouped on leaderboards with a shared Union Coordination drawing layer across all member factions.`
                              : t`Bilateral pact between two factions. Multiple bilateral pacts are allowed and remain separate on leaderboards.`}</p>
                        </section>
                      </div>
                      {Array.isArray(alliance.terms) && alliance.terms.length > 0 && (
                        <section className="faction-alliance-home-charter">
                          <h5>{t`Pact charter`}</h5>
                          <ul>{alliance.terms.map((term, index) => (
                            <li key={`${alliance.id}-${index}`}>{term}</li>
                          ))}</ul>
                        </section>
                      )}
                      {leader && isFounder && (alliance.allianceType !== 'alliance' || members.length < 2) && (
                        <form onSubmit={async (event) => {
                          event.preventDefault();
                          if (!inviteTarget) return;
                          if (await submitJson(`/alliances/${alliance.id}/invite`, 'POST', {
                            factionId: allianceFactionId, targetFactionId: Number(inviteTarget),
                          })) {
                            setInviteTarget('');
                            setMessage(t`Alliance invitation sent.`);
                          }
                        }}>
                          <FactionTargetPicker
                            factionId={allianceFactionId}
                            label={t`Invite a faction`}
                            value={inviteTarget}
                            onChange={setInviteTarget}
                          />
                          <button type="submit" disabled={!inviteTarget}>{t`Send invitation`}</button>
                        </form>
                      )}
                      {leader && (
                        <button
                          type="button"
                          className={isFounder ? 'danger' : ''}
                          onClick={async () => {
                            if (!confirmed) {
                              setConfirmAllianceAction(alliance.id);
                              return;
                            }
                            const left = await submitJson(
                              `/alliances/${alliance.id}/leave`,
                              'DELETE',
                              { factionId: allianceFactionId },
                            );
                            if (left) {
                              setConfirmAllianceAction(null);
                              setAllianceView('directory');
                            }
                          }}
                        >
                          {confirmed
                            ? (isFounder ? t`Confirm disband` : t`Confirm leave`)
                            : (isFounder ? t`Disband alliance` : t`Leave alliance`)}
                        </button>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>
          )}
          {allianceView === 'directory' && (
            <div className="faction-alliance-layout">
              <section className="faction-alliance-directory">
                <header className="faction-alliance-heading">
                  <div>
                    <h3>{t`Find your pact`}</h3>
                    <p>{t`Search the directory, compare pact styles, and request to join with your faction.`}</p>
                  </div>
                  <span className="faction-alliance-count">
                    {visibleAlliances.length} {t`available`}
                  </span>
                </header>
                <label className="faction-alliance-search">
                  <span>{t`Search alliances`}</span>
                  <input
                    type="search"
                    value={allianceSearch}
                    placeholder={t`Search by pact or faction name`}
                    onInput={(event) => setAllianceSearch(event.currentTarget.value)}
                  />
                </label>
                <div
                  className="faction-alliance-categories"
                  aria-label={t`Filter by category`}>
                  {[
                    ['all', t`All pacts`],
                    ['union', t`Union`],
                    ['coalition', t`Coalition`],
                    ['alliance', t`Bilateral Pact`],
                  ].map(([category, label]) => (
                    <button
                      type="button"
                      key={category}
                      className={allianceFilter === category ? 'active' : ''}
                      aria-pressed={allianceFilter === category}
                      onClick={() => setAllianceFilter(category)}
                    >{label}</button>
                  ))}
                </div>
                {visibleAlliances.map((alliance) => {
                  const joined = (alliance.members || []).some(
                    (entry) => Number(entry.factionId || entry.id) === Number(allianceFactionId),
                  ) || (alliance.memberFactionIds || []).some(
                    (mid) => Number(mid) === Number(allianceFactionId),
                  );
                  const isBilateral = alliance.allianceType === 'alliance';
                  const inAnotherAlliance = !joined && !isBilateral && hasPrimaryBloc;
                  const requestPending = (data.myAllianceRequests || []).some(
                    (request) => Number(request.allianceId) === Number(alliance.id),
                  );
                  const terms = Array.isArray(alliance.terms) ? alliance.terms : [];
                  const invited = (data.allianceInvites || []).some(
                    (invite) => Number(invite.allianceId) === Number(alliance.id),
                  );
                  const memberTotal = alliance.memberCount ?? alliance.members?.length ?? 0;
                  const full = isBilateral && memberTotal >= 2;
                  const isTarget = alliance.allianceType === 'coalition'
                    && Number(alliance.targetFactionId) === Number(allianceFactionId);
                  const action = allianceAction?.id === alliance.id ? allianceAction : null;
                  const pending = requestPending || (action?.pending ?? false);
                  const accepted = Boolean(acceptedAllianceTerms[alliance.id]);
                  const selected = Number(selectedAllianceId) === Number(alliance.id);
                  return (
                    <article
                      className="faction-alliance-card"
                      key={alliance.id}>
                      <div
                        className="faction-alliance-card-banner"
                        style={alliance.bannerFileName ? {
                          backgroundImage: `linear-gradient(180deg, transparent, rgba(7, 10, 18, .78)), url("/api/factions/alliances/${alliance.id}/image/banner")`,
                        } : undefined}
                      >
                        {alliance.avatarFileName && (
                          <img
                            src={`/api/factions/alliances/${alliance.id}/image/avatar`}
                            alt=""
                          />
                        )}
                      </div>
                      <div className="faction-alliance-card-heading">
                        <button
                          type="button"
                          className="faction-alliance-name"
                          aria-expanded={selected}
                          onClick={() => setSelectedAllianceId(selected ? null : alliance.id)}
                        >{alliance.name}</button>
                        <span
                          className={`faction-alliance-status${joined ? ' joined' : ''}`}>
                          {joined ? t`Member` : full ? t`Full` : invited ? t`Invited`
                            : pending ? t`Awaiting founder approval`
                              : t`Open for applications`}
                        </span>
                      </div>
                      {!selected && (
                        <button
                          type="button"
                          className="faction-alliance-open"
                          onClick={() => setSelectedAllianceId(alliance.id)}
                        >
                          {alliance.memberCount ?? alliance.members?.length ?? 0} {t`factions`} · {alliance.allianceType === 'coalition'
                            ? t`Coalition`
                            : alliance.allianceType === 'union' ? t`Union` : t`Bilateral Pact`}
                          <span>{t`View pact details`}</span>
                        </button>
                      )}
                      {selected && (
                        <div className="faction-alliance-details">
                          <button
                            type="button"
                            className="faction-alliance-back"
                            onClick={() => setSelectedAllianceId(null)}
                          >← {t`Back to alliances`}</button>
                          <p className="faction-alliance-type">
                            {alliance.allianceType === 'coalition'
                              ? t`Coalition`
                              : alliance.allianceType === 'union'
                                ? t`Union` : t`Bilateral Pact`}
                            {alliance.targetFactionId
                              ? ` · ${t`Target faction`} #${alliance.targetFactionId}` : ''}
                          </p>
                          <p className="faction-alliance-mechanics">
                            {alliance.allianceType === 'coalition'
                              ? t`War coalition · grouped on leaderboards; dissolves automatically if the Coalition Leader accepts a sever-coalition term.`
                              : alliance.allianceType === 'union'
                                ? t`Long-term Union · grouped on leaderboards with a shared Union Coordination drawing layer across all member factions.`
                                : t`Bilateral pact · two factions, multiple bilateral pacts allowed, never merged on leaderboards.`}
                          </p>
                          <div className="faction-alliance-charter">
                            <strong>{t`Charter`}</strong>
                            {terms.length ? (
                              <ul>{terms.map((term, index) => (
                                <li
                                  key={`${index}-${term}`}>{term}</li>
                              ))}</ul>
                            ) : <p>{t`No terms were provided.`}</p>}
                          </div>
                          <section className="faction-alliance-members">
                            <h5>{t`Alliance Members`}</h5>
                            <div className="faction-alliance-member-list">
                              {(alliance.members || []).map((member) => (
                                <span
                                  className="faction-alliance-member"
                                  key={member.factionId}
                                >
                                  <strong>[{member.tag || '—'}]</strong>
                                  {member.name}
                                </span>
                              ))}
                              {!(alliance.members || []).length && (
                                <span>{t`No member factions found.`}</span>
                              )}
                            </div>
                          </section>
                          {!joined && inAnotherAlliance && (
                            <p className="faction-alliance-note">
                              {t`Your faction is already in a Union or Coalition. You may still join multiple Bilateral Pacts freely.`}
                            </p>
                          )}
                          {!leader && (
                            <p className="faction-alliance-note">
                              {publicDirectory && managedFactions.length > 0
                                ? t`Choose the faction you want to represent above.`
                                : t`Only signed-in faction owners and leaders can apply.`}
                            </p>
                          )}
                          {full && !joined && <p>{t`This bilateral alliance already has two factions.`}</p>}
                          {isTarget && <p>{t`The coalition target cannot join the coalition.`}</p>}
                          {action?.error && <p role="alert" className="errormessage">{action.error}</p>}
                          {action?.message && <p role="status">{action.message}</p>}
                          {!joined && !action?.message && (invited || !pending) && leader && !inAnotherAlliance && !full && !isTarget && (
                            <div className="faction-alliance-join">
                              <label>
                                <input
                                  type="checkbox"
                                  checked={accepted}
                                  onChange={(event) => {
                                    const { checked } = event.currentTarget;
                                    setAcceptedAllianceTerms((previous) => ({
                                      ...previous,
                                      [alliance.id]: checked,
                                    }));
                                  }}
                                />
                                {t`I have read and agree to this charter.`}
                              </label>
                              <button
                                type="button"
                                disabled={!accepted || allianceAction?.busy}
                                onClick={() => submitMembership(alliance, accepted, invited)}
                              >{invited ? t`Accept invitation` : t`Request to join`}</button>
                            </div>
                          )}
                        </div>
                      )}
                    </article>
                  );
                })}
                {!visibleAlliances.length && (
                  <p
                    className="faction-alliance-empty">{t`No active alliances are available yet.`}</p>
                )}
              </section>
            </div>
          )}
          {allianceView === 'notifications' && leader && (
            <section className="faction-alliance-notifications">
              <h3>{t`Alliance invitations`}</h3>
              {(data.allianceInvites || []).map((invite) => (
                <article key={invite.allianceId}>
                  <div>
                    <strong>{invite.allianceName}</strong>
                    <small>[{invite.founderTag}]</small>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setAllianceSearch('');
                      setAllianceFilter('all');
                      setSelectedAllianceId(invite.allianceId);
                      setAllianceView('directory');
                    }}
                  >{t`Review charter`}</button>
                  <button
                    type="button"
                    onClick={() => submitJson(
                      `/alliances/${invite.allianceId}/invite`, 'DELETE',
                      { factionId: allianceFactionId },
                    )}
                  >{t`Decline invitation`}</button>
                </article>
              ))}
              {!(data.allianceInvites || []).length && <p>{t`No alliance invitations.`}</p>}
              <h3>{t`Membership requests`}</h3>
              {(data.allianceRequests || []).map((request) => (
                <article key={`${request.allianceId}-${request.factionId}`}>
                  <div>
                    <strong>[{request.tag}] {request.factionName}</strong>
                    <small>{request.allianceName} · {request.requesterName}</small>
                  </div>
                  <button
                    type="button"
                    onClick={() => submitJson(
                      `/alliances/${request.allianceId}/requests/${request.factionId}/approve`,
                      'POST',
                      { factionId: allianceFactionId },
                    )}
                  >{t`Approve`}</button>
                  <button
                    type="button"
                    onClick={() => submitJson(
                      `/alliances/${request.allianceId}/requests/${request.factionId}/reject`,
                      'POST',
                      { factionId: allianceFactionId },
                    )}
                  >{t`Decline`}</button>
                </article>
              ))}
              {!(data.allianceRequests || []).length && (
                <p>{t`You have no pending alliance requests.`}</p>
              )}
            </section>
          )}
          {allianceView === 'stats' && hasAlliance && (
            <section className="faction-alliance-statistics">
              {homeAlliances.map((alliance) => {
                const stats = data.allianceStats?.[Number(alliance.id)];
                return (
                  <article key={alliance.id}>
                    <h3>{alliance.name} · {t`Alliance Statistics`}</h3>
                    <div className="faction-alliance-stat-cards">
                      <div>
                        <strong>{stats?.members?.length ?? 0}</strong><span>{t`Member factions`}</span>
                      </div>
                      <div>
                        <strong>{Number(stats?.totalPixels || 0).toLocaleString()}</strong><span>{t`Total pixels`}</span>
                      </div>
                      <div>
                        <strong>{Number(stats?.todayPixels || 0).toLocaleString()}</strong><span>{t`Pixels today`}</span>
                      </div>
                    </div>
                    <h4>{t`Alliance Members`}</h4>
                    <table>
                      <thead>
                        <tr>
                          <th>{t`Faction`}</th>
                          <th>{t`Pixels today`}</th>
                          <th>{t`Total pixels`}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(stats?.members || []).map((member) => (
                          <tr key={member.id}>
                            <td>[{member.tag}] {member.name}</td>
                            <td>{Number(member.todayPixels || 0).toLocaleString()}</td>
                            <td>{Number(member.totalPixels || 0).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </article>
                );
              })}
            </section>
          )}
          {allianceView === 'settings' && activeSettingsAlliance && (
            <section className="faction-system-section alliance-settings-panel">
              <div className="alliance-settings-header">
                <div>
                  <span className={`faction-alliance-category-badge ${activeSettingsAlliance.allianceType}`}>
                    {activeSettingsAlliance.allianceType === 'union' ? t`Union` : t`Coalition`}
                  </span>
                  <h3>
                    {activeSettingsAlliance.name}
                    {activeSettingsAlliance.tag ? ` [${activeSettingsAlliance.tag}]` : ''}
                    {' — '}{t`Settings`}
                  </h3>
                </div>
                {unionOrCoalitionAlliances.length > 1 && (
                  <select
                    value={activeSettingsAlliance.id}
                    onChange={(event) => setSettingsAllianceId(Number(event.currentTarget.value))}
                  >
                    {unionOrCoalitionAlliances.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.name} ({entry.allianceType})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {(() => {
                const isBlocLeader = Number(
                  activeSettingsAlliance.founderFactionId || activeSettingsAlliance.leaderFactionId,
                ) === Number(allianceFactionId);
                const canEditBloc = leader && isBlocLeader;
                const blocMembers = activeSettingsAlliance.members || [];
                return (
                  <div className="alliance-settings-grid">
                    <form
                      className="faction-alliance-card client-form alliance-settings-card"
                      onSubmit={async (event) => {
                        event.preventDefault();
                        if (!canEditBloc) return;
                        const ok = await submitJson(
                          `/alliances/${activeSettingsAlliance.id}/settings`,
                          'PATCH',
                          {
                            factionId: allianceFactionId,
                            name: settingsName.trim(),
                            tag: settingsTag.trim().toUpperCase(),
                            terms: settingsTermsText
                              .split('\n')
                              .map((line) => line.trim())
                              .filter(Boolean),
                            sharedCoordinationEnabled: settingsSharedCoord,
                            coordinationDrawMode: settingsCoordMode,
                          },
                        );
                        if (ok) setMessage(t`Union / Coalition settings saved.`);
                      }}
                    >
                      <h4>{t`General & Charter Settings`}</h4>
                      <label>
                        {t`Name`}
                        <input
                          type="text"
                          value={settingsName}
                          disabled={!canEditBloc}
                          maxLength={64}
                          onInput={(event) => setSettingsName(event.currentTarget.value)}
                          required
                        />
                      </label>
                      <label>
                        {t`Tag (2–5 chars)`}
                        <input
                          type="text"
                          value={settingsTag}
                          disabled={!canEditBloc}
                          maxLength={5}
                          onInput={(event) => setSettingsTag(event.currentTarget.value.toUpperCase())}
                        />
                      </label>
                      <label>
                        {t`Charter / Terms (one per line)`}
                        <textarea
                          rows={4}
                          value={settingsTermsText}
                          disabled={!canEditBloc}
                          onInput={(event) => setSettingsTermsText(event.currentTarget.value)}
                        />
                      </label>

                      {activeSettingsAlliance.allianceType === 'union' && (
                        <div className="alliance-settings-coord-box">
                          <h5>{t`Shared Union Coordination Tool`}</h5>
                          <label className="alliance-settings-checkbox">
                            <input
                              type="checkbox"
                              checked={settingsSharedCoord}
                              disabled={!canEditBloc}
                              onChange={(event) => setSettingsSharedCoord(event.currentTarget.checked)}
                            />
                            <span>{t`Enable shared drawing canvas across all member factions in this Union`}</span>
                          </label>
                          <label>
                            {t`Who can draw on the shared Union layer`}
                            <select
                              value={settingsCoordMode}
                              disabled={!canEditBloc || !settingsSharedCoord}
                              onChange={(event) => setSettingsCoordMode(event.currentTarget.value)}
                            >
                              <option value="all_members">{t`All Union faction members with draw permission`}</option>
                              <option value="officers_only">{t`Officers, Deputies & Leaders only`}</option>
                              <option value="founders_only">{t`Union Leader faction only`}</option>
                            </select>
                          </label>
                        </div>
                      )}

                      {canEditBloc ? (
                        <button type="submit" className="faction-btn primary">
                          {t`Save Settings`}
                        </button>
                      ) : (
                        <p className="faction-alliance-note">
                          {t`Only the founding/leading faction's leader can modify Union or Coalition settings.`}
                        </p>
                      )}
                    </form>

                    <div className="faction-alliance-card alliance-settings-card">
                      <h4>{t`Member Factions & Leadership`}</h4>
                      <ul className="alliance-settings-member-list">
                        {blocMembers.map((member) => {
                          const mid = Number(member.factionId || member.id);
                          const isCurrentLeader = Number(
                            activeSettingsAlliance.founderFactionId
                            || activeSettingsAlliance.leaderFactionId,
                          ) === mid;
                          return (
                            <li key={mid} className="alliance-settings-member-row">
                              <div>
                                <strong>[{member.tag || '—'}] {member.title || member.name}</strong>
                                {isCurrentLeader && (
                                  <span className="faction-badge">{t`Leader`}</span>
                                )}
                              </div>
                              {canEditBloc && !isCurrentLeader && (
                                <div className="alliance-settings-member-actions">
                                  <button
                                    type="button"
                                    className="faction-btn sm"
                                    onClick={() => submitJson(
                                      `/alliances/${activeSettingsAlliance.id}/transfer-leadership`,
                                      'POST',
                                      { factionId: allianceFactionId, newLeaderFactionId: mid },
                                    )}
                                  >
                                    {t`Make Leader`}
                                  </button>
                                  <button
                                    type="button"
                                    className="faction-btn danger sm"
                                    onClick={() => submitJson(
                                      `/alliances/${activeSettingsAlliance.id}/members/${mid}`,
                                      'DELETE',
                                      { factionId: allianceFactionId },
                                    )}
                                  >
                                    {t`Remove`}
                                  </button>
                                </div>
                              )}
                            </li>
                          );
                        })}
                      </ul>

                      {canEditBloc && (
                        <div className="alliance-settings-danger">
                          <h5>{t`Dissolve`} {activeSettingsAlliance.allianceType === 'union' ? t`Union` : t`Coalition`}</h5>
                          <p>{t`Dissolving permanently ends this pact and publishes a Diplomatic News notice.`}</p>
                          <button
                            type="button"
                            className="faction-btn danger"
                            onClick={async () => {
                              if (confirmDissolveId !== activeSettingsAlliance.id) {
                                setConfirmDissolveId(activeSettingsAlliance.id);
                                return;
                              }
                              const dissolved = await submitJson(
                                `/alliances/${activeSettingsAlliance.id}`,
                                'DELETE',
                                { factionId: allianceFactionId },
                              );
                              if (dissolved) {
                                setConfirmDissolveId(null);
                                setAllianceView('directory');
                              }
                            }}
                          >
                            {confirmDissolveId === activeSettingsAlliance.id
                              ? t`Confirm Permanent Dissolution`
                              : t`Dissolve Pact`}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
            </section>
          )}
          {allianceView === 'found' && leader && (
            <form className="faction-alliance-create" onSubmit={submitAlliance}>
              <h3>{t`Create Pact / Alliance`}</h3>
              <p>{t`Unions and Coalitions appear grouped on leaderboards. Bilateral Pacts can be held in multiples and stay separate on leaderboards.`}</p>
              <fieldset className="faction-alliance-type-picker">
                <legend>{t`Choose a category`}</legend>
                {[
                  {
                    id: 'alliance',
                    title: t`Bilateral Pact`,
                    description: t`Direct two-faction pact. Multiple bilateral pacts allowed; never grouped together on leaderboards.`,
                    disabled: false,
                  },
                  {
                    id: 'union',
                    title: t`Union`,
                    description: t`Long-term multi-faction bloc grouped on leaderboards with a shared Union Coordination drawing layer.`,
                    disabled: hasPrimaryBloc,
                  },
                  {
                    id: 'coalition',
                    title: t`Coalition`,
                    description: t`Focused war bloc against a target faction. Dissolves if the Coalition Leader accepts a sever-coalition term.`,
                    disabled: hasPrimaryBloc,
                  },
                ].map((category) => (
                  <label
                    className={`faction-alliance-type-option${allianceType === category.id ? ' selected' : ''}${category.disabled ? ' disabled' : ''}`}
                    key={category.id}
                  >
                    <input
                      type="radio"
                      name="allianceType"
                      value={category.id}
                      disabled={category.disabled}
                      checked={allianceType === category.id}
                      onChange={() => {
                        setAllianceType(category.id);
                        setAllianceTarget('');
                      }}
                    />
                    <span>
                      <strong>{category.title}</strong>
                      <small>
                        {category.description}
                        {category.disabled ? ` (${t`Already in a Union or Coalition`})` : ''}
                      </small>
                    </span>
                  </label>
                ))}
              </fieldset>
              {allianceType === 'coalition' && (
                <FactionTargetPicker
                  factionId={faction.id}
                  label={t`Coalition target`}
                  value={allianceTarget}
                  onChange={setAllianceTarget}
                />
              )}
              <label>
                {t`Pact name`}
                <input
                  value={allianceName}
                  onInput={(event) => setAllianceName(event.currentTarget.value)}
                  required
                  maxLength="64"
                />
              </label>
              <label>
                {t`Pact tag (optional, 2–5 chars)`}
                <input
                  value={allianceTag}
                  placeholder={t`e.g. BRU`}
                  onInput={(event) => setAllianceTag(event.currentTarget.value.toUpperCase())}
                  maxLength="5"
                />
              </label>
              <label>
                {t`Emblem avatar (optional)`}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(event) => setAllianceAvatar(event.currentTarget.files?.[0] || null)}
                />
              </label>
              <label>
                {t`Banner image (optional)`}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(event) => setAllianceBanner(event.currentTarget.files?.[0] || null)}
                />
              </label>
              <label>
                {t`Charter terms (one per line)`}
                <textarea
                  value={allianceTerms}
                  onInput={(event) => setAllianceTerms(event.currentTarget.value)}
                  required
                />
              </label>
              <button
                type="submit"
                className="faction-btn primary"
                disabled={allianceType === 'coalition' && !allianceTarget}
              >{t`Create Pact`}</button>
            </form>
          )}
        </div>
      )}

      {tab === 'stats' && (
        <div>
          <h3>{viewFaction.rankTitle || t`Chiefdom`} — {viewFaction.memberCount} {t`members`}</h3>
          <p>{t`Daily faction pixels`}: {viewFaction.todayPixels ?? viewFaction.dailyTotalPixels ?? 0}</p>
          <p>{t`Total faction pixels`}: {viewFaction.totalPixels || 0}</p>
          <h4>{t`Daily pixel tally`}</h4>
          <table>
            <thead>
              <tr>
                <th>{t`Member`}</th>
                <th>{t`Pixels today`}</th>
              </tr>
            </thead>
            <tbody>
              {(data.daily || []).map((member) => (
                <tr key={member.id}>
                  <td>{member.name}</td>
                  <td>{member.todayPixels}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <h4>{t`Cumulative faction contributions`}</h4>
          <table>
            <thead>
              <tr>
                <th>{t`Member`}</th>
                <th>{t`Total pixels`}</th>
              </tr>
            </thead>
            <tbody>
              {(data.total || []).map((member) => (
                <tr key={member.id}>
                  <td>{member.name}</td>
                  <td>{member.totalPixels}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <h4>{t`Overall faction and coalition ranking`}</h4>
          <ol>
            {(data.overall || []).slice(0, 20).map((entry) => (
              <li key={`${entry.type}-${entry.id}`}>
                {entry.displayName || entry.name}
                {entry.title && <> <span className="faction-badge">{entry.title}</span></>}
                {': '}{entry.totalPixels}
                {entry.type === 'alliance' && ` (${entry.factions.map((member) => member.tag).join(', ')})`}
              </li>
            ))}
          </ol>
          <h4>{t`Daily faction and coalition ranking`}</h4>
          <ol>
            {(data.daily || []).slice(0, 20).map((entry) => (
              <li key={`${entry.type}-${entry.id}`}>
                {entry.displayName || entry.name}
                {entry.title && <> <span className="faction-badge">{entry.title}</span></>}
                {': '}{entry.todayPixels}
                {entry.type === 'alliance' && ` (${entry.factions.map((member) => member.tag).join(', ')})`}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
};

export default FactionSystemTab;
