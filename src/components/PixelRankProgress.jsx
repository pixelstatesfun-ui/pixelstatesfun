import { memo } from 'preact/compat';
import { t } from 'ttag';
import PixelRankBadge from './PixelRankBadge.jsx';
import { PIXEL_RANKS, getPixelRankById } from '../core/pixelRanks.js';

function PixelRankProgress({ rank }) {
  if (!rank) return null;
  return (
    <div className="pixel-rank-progress">
      <div className="pixel-rank-progress-heading">
        <PixelRankBadge rank={rank} size={28} />
        {rank.name}
        <span style={{ opacity: 0.7 }}>· {rank.metal}</span>
        <span style={{ marginLeft: 'auto' }}>{rank.id}/25</span>
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(rank.progress * 100)}
        title={rank.nextName
          ? `${rank.pixels.toLocaleString()} / ${rank.nextThreshold.toLocaleString()}`
          : `${rank.pixels.toLocaleString()} pixels`}
        className="pixel-rank-progress-bar"
      >
        <div
          className="pixel-rank-progress-bar-fill"
          style={{ width: `${rank.progress * 100}%` }}
        />
      </div>
      <small className="pixel-rank-progress-details">
        {rank.nextName
          ? `${rank.pixels.toLocaleString()} / ${rank.nextThreshold.toLocaleString()} · ${rank.nextName}`
          : `${rank.pixels.toLocaleString()} · Maximum rank`}
      </small>
      <details className="pixel-rank-progress-levels">
        <summary>{t`Pixel rank levels`}</summary>
        <table className="pixel-rank-levels-table">
          <thead>
            <tr>
              <th>#</th>
              <th>{t`Rank`}</th>
              <th>{t`Metal`}</th>
              <th>{t`Pixels`}</th>
            </tr>
          </thead>
          <tbody>
            {PIXEL_RANKS.map(([, threshold], index) => {
              const level = getPixelRankById(index + 1);
              const current = level.id === rank.id;
              return (
                <tr
                  key={level.name}
                  aria-current={current ? 'true' : undefined}
                  style={current ? { fontWeight: 700 } : undefined}
                >
                  <td>{level.id}</td>
                  <td>
                    <span className="pixel-rank-label">
                      <PixelRankBadge rank={level} size={28} />
                      {level.name}
                    </span>
                  </td>
                  <td>{level.metal}</td>
                  <td>{threshold.toLocaleString()}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </details>
    </div>
  );
}

export default memo(PixelRankProgress);
