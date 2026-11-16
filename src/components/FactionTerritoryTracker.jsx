import { useEffect } from 'preact/hooks';
import { useSelector } from '../store/react-redux/index.js';
import { api } from '../utils/utag.js';
import { setProtectedTerritories } from '../core/factionTerritoryClient.js';

async function requestJson(url) {
  const response = await fetch(api`${url}`, { credentials: 'include' });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Faction territory request failed');
  return data;
}

const FactionTerritoryTracker = () => {
  const userId = useSelector((state) => state.user.id);

  useEffect(() => {
    let cancelled = false;
    setProtectedTerritories([]);
    if (!userId) return () => {};
    const refresh = async () => {
      try {
        const mine = await requestJson('/api/factions/mine');
        const faction = mine.factions?.[0];
        if (!faction) {
          if (!cancelled) setProtectedTerritories([]);
          return;
        }
        const napData = await requestJson(`/api/factions/${faction.id}/naps/mine`);
        const activeNaps = napData.naps?.filter((nap) => nap.status === 'active') || [];
        const territories = await Promise.all(activeNaps.map(async (nap) => {
          const result = await requestJson(
            `/api/factions/${nap.otherFaction.id}/territory`,
          );
          return result ? {
            ...result,
            tag: nap.otherFaction.tag,
          } : null;
        }));
        if (!cancelled) setProtectedTerritories(territories.filter(Boolean));
      } catch {
        if (!cancelled) setProtectedTerritories([]);
      }
    };
    refresh();
    window.addEventListener('factionnapupdate', refresh);
    return () => {
      cancelled = true;
      window.removeEventListener('factionnapupdate', refresh);
    };
  }, [userId]);

  return null;
};

export default FactionTerritoryTracker;
