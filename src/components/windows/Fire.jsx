import { useEffect, useState } from 'preact/hooks';
import { memo } from 'preact/compat';
import { useSelector } from '../../store/react-redux/index.js';

import {
  getActivePixelZones,
  getActivePixelZonesVersion,
} from '../../ui/ActivePixelZones.js';

const REFRESH_INTERVAL = 2000;

const Fire = () => {
  const canvasId = useSelector((state) => state.canvas.canvasId);

  const [zones, setZones] = useState([]);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [selectedRevisions, setSelectedRevisions] = useState({});

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

  const totalUsers = zones.reduce(
    (sum, zone) => sum + (Number.isSafeInteger(zone.users) ? zone.users : 1),
    0,
  );
  const maxZoneUsers = zones.reduce(
    (max, zone) => Math.max(
      max,
      Number.isSafeInteger(zone.users) ? zone.users : 1,
    ),
    1,
  );
  const maxZonePixels = zones.reduce(
    (max, zone) => Math.max(max, zone.count || 1),
    1,
  );

  return (
    <div className="content fire-window">
      <div className="fire-header">
        <h1>ACTIVE WARS</h1>
      </div>

      <div className="fire-summary">
        <span>ACTIVE ZONES</span>
        <strong>{zones.length}</strong>
        <span>ACTIVE USERS</span>
        <strong>{totalUsers}</strong>
        <div className="fire-update">
          {lastUpdate
            ? `Last update: ${lastUpdate.toLocaleTimeString()}`
            : 'Waiting for activity data...'}
        </div>
      </div>

      {zones.length > 0 && (
        <div className="fire-contributors-summary">
          <div className="fire-contributors-header">
            <strong>ACTIVE AREA CONTRIBUTORS</strong>
            <span>
              {totalUsers.toLocaleString()} {totalUsers === 1 ? 'user' : 'users'}
              {' live'}
            </span>
          </div>
          <div className="fire-contributors-list">
            {zones.map((zone, index) => {
              const userCount = Number.isSafeInteger(zone.users)
                ? zone.users
                : 1;
              const userPct = Math.max(
                8,
                Math.round((userCount / maxZoneUsers) * 100),
              );
              const zoneKey = zone.id || `${zone.x}:${zone.y}`;
              return (
                <div className="fire-contributor-row" key={`sum-${zoneKey}`}>
                  <div className="fire-contributor-meta">
                    <span>
                      Zone #{index + 1} ({Math.round(zone.x)},{' '}
                      {Math.round(zone.y)})
                    </span>
                    <strong>
                      {userCount.toLocaleString()}{' '}
                      {userCount === 1 ? 'user' : 'users'}
                    </strong>
                  </div>
                  <div
                    className="fire-user-progress"
                    role="progressbar"
                    aria-valuenow={userCount}
                    aria-valuemin={0}
                    aria-valuemax={maxZoneUsers}
                    aria-label={`Zone ${index + 1} unique contributors`}
                  >
                    <div
                      className="fire-user-progress-bar"
                      style={{ width: `${userPct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="fire-zone-list">
        {zones.length === 0 ? (
          <div className="fire-empty">
            No active zones detected
          </div>
        ) : (
          zones.map((zone, index) => {
            const zoneKey = zone.id || `${zone.x}:${zone.y}`;
            const userCount = Number.isSafeInteger(zone.users)
              ? zone.users
              : 1;
            const history = Array.isArray(zone.screenshotHistory)
              ? zone.screenshotHistory
              : [];
            const chosenRev = selectedRevisions[zoneKey];
            const fallbackSnap = zone.screenshot
              ? {
                  dataUrl: zone.screenshot,
                  revision: zone.screenshotRevision || 1,
                  capturedAt: zone.screenshotUpdatedAt,
                  expanded: zone.screenshotExpanded,
                  bounds: {
                    width: zone.width || 1,
                    height: zone.height || 1,
                  },
                }
              : null;
            const matchedSnap = chosenRev
              ? history.find((item) => item.revision === chosenRev)
              : null;
            const activeSnap = matchedSnap
              || history[history.length - 1]
              || fallbackSnap;

            return (
              <div
                className="fire-zone"
                key={zoneKey}
              >
                <div className="fire-zone-header">
                  <strong>ZONE #{index + 1}</strong>
                  <span>
                    {userCount.toLocaleString()}{' '}
                    {userCount === 1 ? 'user' : 'users'}
                    {' · '}
                    {zone.count.toLocaleString()} pixels
                  </span>
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

                {activeSnap && activeSnap.dataUrl && (
                  <div className="fire-zone-snapshot">
                    <img
                      className="fire-zone-screenshot"
                      src={activeSnap.dataUrl}
                      alt={`Active war zone #${index + 1} area snapshot`}
                    />
                    <div className="fire-zone-snapshot-bar">
                      <span className="fire-zone-snapshot-badge">
                        {activeSnap.revision > 1
                          ? `Expanded · #${activeSnap.revision}`
                          : 'Area Snapshot'}
                      </span>
                      <span className="fire-zone-snapshot-meta">
                        {activeSnap.bounds
                          ? `${activeSnap.bounds.width}×${activeSnap.bounds.height} area`
                          : ''}
                        {activeSnap.capturedAt
                          ? ` · ${new Date(activeSnap.capturedAt).toLocaleTimeString()}`
                          : ''}
                      </span>
                    </div>
                    {history.length > 1 && (
                      <div className="fire-zone-snapshot-thumbs">
                        {history.map((snap) => {
                          const isCurrent = snap.revision === activeSnap.revision;
                          return (
                            <button
                              key={`${zoneKey}-v${snap.revision}`}
                              type="button"
                              className={`fire-zone-snapshot-thumb${isCurrent ? ' selected' : ''}`}
                              onClick={() => setSelectedRevisions((prev) => ({
                                ...prev,
                                [zoneKey]: snap.revision,
                              }))}
                              title={`Snapshot #${snap.revision}`}
                            >
                              #{snap.revision}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                <div className="fire-intensity">
                  <div
                    className="fire-intensity-bar"
                    style={{
                      width: `${Math.max(
                        2,
                        (zone.count / maxZonePixels) * 100,
                      )}%`,
                    }}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default memo(Fire);
