/*
 * Multi-condition Treaty & NAP Terms Builder.
 * Reuses native PixelStates form and faction classes so it inherits all themes.
 */
/* eslint-disable max-len */

import { useRef, useState } from 'preact/hooks';
import { t } from 'ttag';

export const TREATY_TERM_TYPES = [
  { value: 'abandon_territory', label: t`Abandon territory` },
  { value: 'cease_activity', label: t`Cease activity in territory` },
  { value: 'sever_ally', label: t`Sever alliance / leave pact` },
  { value: 'surrender_restrictions', label: t`Surrender restrictions` },
];

export const SEVER_TARGET_KINDS = [
  { value: 'union', label: t`Leave Union` },
  { value: 'coalition', label: t`Leave / Dissolve Coalition` },
  { value: 'bilateral', label: t`Break Bilateral Pact` },
];

export function formatTreatyTermSummary(term) {
  if (!term) return '';
  if (typeof term === 'string') return term;
  if (term.type === 'sever_ally') {
    const kindLabel = term.severKind === 'union'
      ? t`Leave Union`
      : term.severKind === 'coalition'
        ? (term.forcesCoalitionDissolution
            ? t`Dissolve Coalition (Target is Leader)`
            : t`Leave Coalition`)
        : t`Break Bilateral Pact`;
    const pactTitle = term.targetPactName
      || (term.targetPactId ? `#${term.targetPactId}` : (term.allyFactionId ? `#${term.allyFactionId}` : ''));
    const extra = term.description ? ` — ${term.description}` : '';
    return `${kindLabel}${pactTitle ? `: ${pactTitle}` : ''}${extra}`;
  }
  return term.description || term.restrictions || '';
}

const TreatyTermsBuilder = ({
  terms = [],
  onChange,
  targetFactionId = null,
  targetPacts = [],
}) => {
  const [draftType, setDraftType] = useState('abandon_territory');
  const [draftSeverKind, setDraftSeverKind] = useState('coalition');
  const [draftPactId, setDraftPactId] = useState('');
  const [draftText, setDraftText] = useState('');
  const termSeqRef = useRef(0);

  const matchingPacts = targetPacts.filter((pact) => {
    if (draftSeverKind === 'union') return pact.allianceType === 'union';
    if (draftSeverKind === 'coalition') return pact.allianceType === 'coalition';
    return pact.allianceType === 'alliance' || pact.allianceType === 'bilateral';
  });

  const selectedPact = matchingPacts.find(
    (pact) => String(pact.id) === String(draftPactId),
  ) || null;

  const targetIsCoalitionLeader = Boolean(
    draftType === 'sever_ally'
    && draftSeverKind === 'coalition'
    && selectedPact
    && Number(selectedPact.founderFactionId || selectedPact.leaderFactionId) === Number(targetFactionId),
  );

  const addTerm = () => {
    if (draftType === 'sever_ally') {
      if (!selectedPact && !draftText.trim()) return;
      termSeqRef.current += 1;
      const nextTerm = {
        id: `term-${termSeqRef.current}`,
        type: 'sever_ally',
        severKind: draftSeverKind,
        targetPactId: selectedPact ? Number(selectedPact.id) : null,
        targetPactName: selectedPact ? selectedPact.name : draftText.trim(),
        forcesCoalitionDissolution: targetIsCoalitionLeader,
        description: draftText.trim(),
      };
      onChange([...terms, nextTerm]);
      setDraftPactId('');
      setDraftText('');
      return;
    }

    if (!draftText.trim()) return;
    termSeqRef.current += 1;
    const nextTerm = {
      id: `term-${termSeqRef.current}`,
      type: draftType,
      description: draftText.trim(),
      ...(draftType === 'surrender_restrictions'
        ? { restrictions: draftText.trim() }
        : {}),
    };
    onChange([...terms, nextTerm]);
    setDraftText('');
  };

  const removeTerm = (idx) => {
    onChange(terms.filter((_, i) => i !== idx));
  };

  return (
    <div className="faction-system-section treaty-terms-builder">
      <div className="treaty-terms-builder-head">
        <strong>{t`Agreement Conditions`}</strong>
        <span className="stattext">
          {terms.length} {terms.length === 1 ? t`condition` : t`conditions`}
        </span>
      </div>

      {terms.length > 0 ? (
        <ul className="treaty-terms-list">
          {terms.map((term, idx) => {
            const typeObj = TREATY_TERM_TYPES.find((o) => o.value === term.type);
            return (
              <li key={term.id || idx} className="treaty-term-item">
                <div className="treaty-term-copy">
                  <strong>{typeObj ? typeObj.label : term.type}</strong>
                  <span aria-hidden="true">·</span>
                  <span>{formatTreatyTermSummary(term)}</span>
                  {term.forcesCoalitionDissolution && (
                    <span className="treaty-term-warning-text">
                      [{t`Forces Coalition Dissolution`}]
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  className="treaty-term-remove"
                  onClick={() => removeTerm(idx)}
                  aria-label={t`Remove condition`}
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="faction-empty">
          {t`Add one or more conditions below (e.g., abandon territory + sever an alliance in the same treaty).`}
        </p>
      )}

      <div className="client-form treaty-terms-composer">
        <div className="form-group">
          <label>
            <span>{t`Condition`}</span>
            <select
              value={draftType}
              onChange={(e) => {
                setDraftType(e.currentTarget.value);
                setDraftPactId('');
              }}
            >
              {TREATY_TERM_TYPES.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </label>
        </div>

        {draftType === 'sever_ally' && (
          <div className="treaty-sever-controls">
            <div className="form-group">
              <label>
                <span>{t`Pact Type to Sever`}</span>
                <select
                  value={draftSeverKind}
                  onChange={(e) => {
                    setDraftSeverKind(e.currentTarget.value);
                    setDraftPactId('');
                  }}
                >
                  {SEVER_TARGET_KINDS.map((kind) => (
                    <option key={kind.value} value={kind.value}>{kind.label}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="form-group">
              <label>
                <span>{t`Target Pact`}</span>
                <select
                  value={draftPactId}
                  onChange={(e) => setDraftPactId(e.currentTarget.value)}
                >
                  <option value="">
                    {matchingPacts.length
                      ? t`Select target faction's pact...`
                      : t`No matching active pacts found (specify below)`}
                  </option>
                  {matchingPacts.map((pact) => {
                    const isLeader = Number(pact.founderFactionId || pact.leaderFactionId)
                      === Number(targetFactionId);
                    return (
                      <option key={pact.id} value={pact.id}>
                        {pact.name}
                        {pact.allianceType === 'coalition' && isLeader
                          ? ` (${t`Coalition Leader — Dissolves Coalition`})`
                          : ''}
                      </option>
                    );
                  })}
                </select>
              </label>
            </div>

            {targetIsCoalitionLeader && (
              <div className="errormessage" role="note">
                <strong>{t`Coalition Leader Clause:`}</strong>{' '}
                {t`Because the target faction leads this coalition, accepting this condition will automatically dissolve the entire coalition.`}
              </div>
            )}
          </div>
        )}

        <div className="form-group">
          <label>
            <span>
              {draftType === 'sever_ally'
                ? t`Additional clause notes (optional if pact selected)`
                : t`Condition details`}
            </span>
            <input
              type="text"
              value={draftText}
              placeholder={
                draftType === 'abandon_territory'
                  ? t`e.g. Withdraw from northern sector [120, -40]`
                  : draftType === 'cease_activity'
                    ? t`e.g. No pixel placement inside protected border`
                    : draftType === 'sever_ally'
                      ? t`e.g. Pact name or severance deadline`
                      : t`e.g. Demilitarized zone or reparations`
              }
              onInput={(e) => setDraftText(e.currentTarget.value)}
            />
          </label>
        </div>

        <div className="form-actions">
          <button
            type="button"
            className="treaty-add-btn"
            onClick={addTerm}
            disabled={draftType === 'sever_ally'
              ? (!selectedPact && !draftText.trim())
              : !draftText.trim()}
          >
            + {t`Add Condition`}
          </button>
        </div>
      </div>
    </div>
  );
};

export default TreatyTermsBuilder;
