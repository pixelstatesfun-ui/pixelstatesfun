
import { useEffect, useState } from 'preact/hooks';
import { memo } from 'preact/compat';
import { useSelector } from '../../store/react-redux/index.js';

import {
  getActivePixelZones,
  getActivePixelZonesVersion,
} from '../../ui/ActivePixelZones.js';

const REFRESH_INTERVAL = 10000;

const Fire = () => {
  const canvasId = useSelector((state) => state.canvas.canvasId);

  const [zones, setZones] = useState([]);
  const [lastUpdate, setLastUpdate] = useState(null);

  useEffect(() => {
    let previousVersion = -1;

    const refresh = () => {
      if (canvasId === null) {
        setZones([]);
        return;
      }

      const version = getActivePixelZonesVersion();

      if (version === previousVersion) return;

      previousVersion = version;

      const activeZones = getActivePixelZones(canvasId);

      setZones(
        [...activeZones].sort((a, b) => b.count - a.count),
      );

      setLastUpdate(new Date());
    };

    refresh();

    const interval = window.setInterval(
      refresh,
      REFRESH_INTERVAL,
    );

    return () => window.clearInterval(interval);
  }, [canvasId]);

  return (
    <div className="content fire-window">
      <div className="fire-header">
        <h1>ACTIVE WARS</h1>
      </div>

      <div className="fire-summary">
        <span>ACTIVE ZONES</span>
        <strong>{zones.length}</strong>
        <div className="fire-update">
        {lastUpdate
          ? `Last update: ${lastUpdate.toLocaleTimeString()}`
          : 'Waiting for activity data...'}
      </div>
      </div>

      <div className="fire-zone-list">
        {zones.length === 0 ? (
          <div className="fire-empty">
            No active zones detected
          </div>
        ) : (
          zones.map((zone, index) => (
            <div
              className="fire-zone"
              key={`${zone.x}:${zone.y}`}
            >
              <div className="fire-zone-header">
                <strong>ZONE #{index + 1}</strong>
                <span>{zone.count.toLocaleString()} pixels</span>
              </div>

      <a
      className="fire-coordinates"
      href={`https://pixelstates.fun/#d,${Math.round(zone.x)},${Math.round(zone.y)},-29`}
      target="_blank"
      rel="noopener noreferrer"
      >
              <span>X: {Math.round(zone.x)}</span>
              <span>Y: {Math.round(zone.y)}</span>
              </a>

              <div className="fire-intensity">
                <div
                  className="fire-intensity-bar"
                  style={{
                    width: `${Math.max(
                      2,
                      (zone.count / Math.max(
                        ...zones.map((item) => item.count),
                      )) * 100,
                    )}%`,
                  }}
                />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default memo(Fire);
