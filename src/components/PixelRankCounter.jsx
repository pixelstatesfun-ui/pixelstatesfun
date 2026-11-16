import { memo } from 'preact/compat';
import { t } from 'ttag';

import { openWindow } from '../store/actions/windows.js';
import { getPixelRank, PIXEL_RANKS } from '../core/pixelRanks.js';
import {
  useDispatch, useSelector,
} from '../store/react-redux/index.js';
import PixelRankBadge from './PixelRankBadge.jsx';

const PixelRankCounter = () => {
  const [name, totalPixels, obstructingWindowOpen] = useSelector((state) => [
    state.user.name,
    state.ranks.totalPixels,
    state.windows.windows.some((win) => (
      win.open
      && !win.hidden
      && (state.windows.showWindows || win.fullscreen)
    )),
  ]);
  const rank = getPixelRank(totalPixels);
  const dispatch = useDispatch();
  const nextRank = rank.id < PIXEL_RANKS.length
    ? getPixelRank(rank.nextThreshold) : null;
  const progress = Math.round(rank.progress * 100);
  const progressTitle = rank.nextName
    ? `${totalPixels.toLocaleString()} / ${
      rank.nextThreshold.toLocaleString()
    }`
    : `${totalPixels.toLocaleString()} pixels`;
  const progressLabel = rank.nextName
    ? `${progress}% · ${compactPixels(totalPixels)} / ${
      compactPixels(rank.nextThreshold)
    }`
    : t`MAX`;

  if (!name || obstructingWindowOpen) return null;

  return (
    <button
      type="button"
      className="pixel-rank-counter"
      onClick={() => dispatch(openWindow(
        'PIXEL_RANKS', false, t`Ranks`, null, true, true,
      ))}
      title={t`View pixel rank requirements`}
      aria-label={t`Pixel rank ${rank.id} progress: ${progress}%`}
    >
      <PixelRankBadge rank={rank} size={24} />
      <span
        className="pixel-rank-progress-track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress}
        title={progressTitle}
      >
        <span
          className="pixel-rank-progress-fill"
          style={{ width: `${progress}%` }}
        />
        <span className="pixel-rank-progress-label">
          {progressLabel}
        </span>
        <span className="pixel-rank-progress-mobile-label" aria-hidden="true">
          {progress}%
        </span>
      </span>
      {nextRank && (
        <span className="pixel-rank-next-badge" aria-hidden="true">
          <PixelRankBadge rank={nextRank} size={24} />
        </span>
      )}
    </button>
  );
};

function compactPixels(pixels) {
  if (pixels < 1000) return String(pixels);
  return `${(pixels / 1000).toFixed(1)}k`;
}

export default memo(PixelRankCounter);
