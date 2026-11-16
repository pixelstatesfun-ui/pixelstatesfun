import { useEffect } from 'preact/hooks';
import { useSelector } from '../store/react-redux/index.js';
import { api } from '../utils/utag.js';
import { setActivePixelZones } from '../ui/ActivePixelZones.js';

const REFRESH_INTERVAL = 15_000;

async function requestZones(canvasId) {
  const response = await fetch(
    api`/api/activezones?canvasId=${encodeURIComponent(canvasId)}`,
    { credentials: 'include' },
  );
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Active zone request failed');
  }
  if (!Array.isArray(data.zones)) {
    throw new Error('Active zone response was invalid');
  }
  if (data.zones.some((zone) => (
    !Number.isFinite(zone.x)
    || !Number.isFinite(zone.y)
    || !Number.isSafeInteger(zone.count)
    || zone.count < 1
    || (zone.minX !== undefined && !Number.isFinite(zone.minX))
    || (zone.minY !== undefined && !Number.isFinite(zone.minY))
    || (zone.maxX !== undefined && !Number.isFinite(zone.maxX))
    || (zone.maxY !== undefined && !Number.isFinite(zone.maxY))
    || (Number.isFinite(zone.minX) && Number.isFinite(zone.maxX)
      && zone.minX > zone.maxX)
    || (Number.isFinite(zone.minY) && Number.isFinite(zone.maxY)
      && zone.minY > zone.maxY)
    || (zone.users !== undefined
      && (!Number.isSafeInteger(zone.users) || zone.users < 1))
  ))) {
    throw new Error('Active zone response contained invalid zones');
  }
  return data.zones;
}

const ActivePixelZonesTracker = () => {
  const [canvasId, enabled] = useSelector((state) => [
    state.canvas.canvasId,
    state.gui.showActiveZones,
  ]);

  useEffect(() => {
    let cancelled = false;
    setActivePixelZones(canvasId, []);
    if (!enabled || canvasId === null) return () => {};

    const refresh = async () => {
      try {
        const zones = await requestZones(canvasId);
        if (!cancelled) setActivePixelZones(canvasId, zones);
      } catch (error) {
        if (!cancelled) {
          console.error('Could not load active pixel zones:', error);
        }
      }
    };

    void refresh();
    const interval = window.setInterval(refresh, REFRESH_INTERVAL);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [canvasId, enabled]);

  return null;
};

export default ActivePixelZonesTracker;
