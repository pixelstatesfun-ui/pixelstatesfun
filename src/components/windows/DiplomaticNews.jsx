/*
 * Public Diplomatic News feed displaying wars, treaties, NAPs,
 * unions, coalitions, and bilateral pact announcements.
 * Reuses native PixelStates faction classes and theme variables.
 */
/* eslint-disable max-len */

import { useCallback, useEffect, useState } from 'preact/hooks';
import { t } from 'ttag';
import { api } from '../../utils/utag.js';
import useLink from '../hooks/link.js';

const NEWS_CATEGORIES = [
  ['all', t`All News`],
  ['war', t`Wars`],
  ['treaty', t`Treaties & NAPs`],
  ['union_coalition', t`Unions & Coalitions`],
  ['bilateral', t`Bilateral Pacts`],
];

const TYPE_META = {
  'war_declared': { label: t`War Declared`, tone: 'news-tone-war' },
  'peace_signed': { label: t`Peace Treaty`, tone: 'news-tone-treaty' },
  'nap_signed': { label: t`NAP Signed`, tone: 'news-tone-treaty' },
  'nap_proposed': { label: t`NAP Proposed`, tone: 'news-tone-treaty' },
  'union_formed': { label: t`Union Formed`, tone: 'news-tone-union' },
  'coalition_formed': { label: t`Coalition Formed`, tone: 'news-tone-coalition' },
  'coalition_dissolved': { label: t`Coalition Dissolved`, tone: 'news-tone-war' },
  'bilateral_formed': { label: t`Bilateral Pact`, tone: 'news-tone-bilateral' },
  'pact_severed': { label: t`Pact Severed`, tone: 'news-tone-war' },
};

function matchesCategory(item, category) {
  if (category === 'all') return true;
  if (category === 'war') {
    return item.type === 'war_declared' || item.type === 'coalition_dissolved' || item.type === 'pact_severed';
  }
  if (category === 'treaty') {
    return item.type === 'nap_signed' || item.type === 'nap_proposed' || item.type === 'peace_signed';
  }
  if (category === 'union_coalition') {
    return item.type === 'union_formed' || item.type === 'coalition_formed' || item.type === 'coalition_dissolved';
  }
  if (category === 'bilateral') {
    return item.type === 'bilateral_formed' || item.type === 'pact_severed';
  }
  return true;
}

function formatNewsTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return String(ts);
  return d.toLocaleString();
}

const DiplomaticNews = () => {
  const [items, setItems] = useState([]);
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const link = useLink();

  const loadNews = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(api`/api/factions/diplomatic-news`, {
        credentials: 'include',
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || t`Failed to load diplomatic news.`);
      }
      setItems(Array.isArray(data.news) ? data.news : []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNews();
  }, [loadNews]);

  const query = search.trim().toLowerCase();
  const visibleItems = items.filter((item) => {
    if (!matchesCategory(item, category)) return false;
    if (!query) return true;
    const haystack = [
      item.headline,
      item.summary,
      ...(item.factions || []).map((f) => `${f.tag || ''} ${f.name || ''}`),
      ...(item.terms || []).map((term) => term.summary || term.description || ''),
    ].join(' ').toLowerCase();
    return haystack.includes(query);
  });

  return (
    <section className="faction-system-section diplomatic-news">
      <div className="diplomatic-news-header">
        <div>
          <h3>{t`Diplomatic News`}</h3>
          <p className="diplomatic-news-subtitle">
            {t`Public record of war declarations, peace treaties, NAPs, unions, coalitions, and bilateral pacts.`}
          </p>
        </div>
        <button type="button" onClick={loadNews} disabled={loading}>
          {loading ? t`Refreshing...` : t`Refresh`}
        </button>
      </div>

      <div className="faction-directory-controls diplomatic-news-controls">
        <div className="faction-alliance-tabs diplomatic-news-filters" role="tablist" aria-label={t`Filter diplomatic news`}>
          {NEWS_CATEGORIES.map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={category === key ? 'selected active' : ''}
              aria-pressed={category === key}
              onClick={() => setCategory(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <input
          type="search"
          value={search}
          placeholder={t`Search faction, pact, or headline`}
          onInput={(e) => setSearch(e.currentTarget.value)}
        />
      </div>

      {error && <p className="errormessage" role="alert">{error}</p>}

      {!loading && visibleItems.length === 0 && (
        <p className="faction-empty">{t`No diplomatic news matches this filter yet.`}</p>
      )}

      <div className="diplomatic-news-list">
        {visibleItems.map((item) => {
          const meta = TYPE_META[item.type] || { label: t`Dispatch`, tone: 'news-tone-treaty' };
          return (
            <article key={item.id} className="faction-alliance-card diplomatic-news-card">
              <div className="diplomatic-news-meta">
                <span className={`diplomatic-news-kind ${meta.tone}`}>
                  {meta.label}
                </span>
                <span aria-hidden="true">·</span>
                <time className="diplomatic-news-time">
                  {formatNewsTime(item.createdAt)}
                </time>
              </div>
              <h4 className="diplomatic-news-headline">{item.headline}</h4>
              {item.summary && (
                <p className="diplomatic-news-summary">{item.summary}</p>
              )}
              {Array.isArray(item.terms) && item.terms.length > 0 && (
                <ul className="diplomatic-news-terms">
                  {item.terms.map((term, idx) => (
                    <li key={`${item.id}-term-${idx}`}>
                      <strong>{term.label || term.type}</strong>
                      {term.summary ? `: ${term.summary}` : ''}
                    </li>
                  ))}
                </ul>
              )}
              {Array.isArray(item.factions) && item.factions.length > 0 && (
                <div className="diplomatic-news-factions">
                  {item.factions.map((fac) => (
                    <button
                      key={`${item.id}-fac-${fac.id || fac.name}`}
                      type="button"
                      className="modallink diplomatic-news-faction-link"
                      onClick={() => link('FACTION', {
                        target: 'blank',
                        args: { name: fac.name, id: fac.id },
                      })}
                    >
                      {fac.tag ? `[${fac.tag}] ` : ''}{fac.title || fac.name}
                    </button>
                  ))}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
};

export default DiplomaticNews;
