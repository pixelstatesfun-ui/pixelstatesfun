import { memo } from 'preact/compat';
import { useEffect } from 'preact/hooks';
import { t } from 'ttag';

import { useSelector } from '../../store/react-redux/index.js';
import {
  getPixelRank,
  getPixelRankById,
  PIXEL_RANKS,
} from '../../core/pixelRanks.js';
import PixelRankBadge from '../PixelRankBadge.jsx';

const PixelRanks = () => {
  const totalPixels = useSelector((state) => state.ranks.totalPixels);
  const currentRank = getPixelRank(totalPixels);

  useEffect(() => {
    const isInRanksWindow = (target) => (
      target instanceof Element && target.closest('.pixel-ranks-window')
    );
    const preventSelection = (event) => {
      if (!isInRanksWindow(event.target)) return;
      event.preventDefault();
      window.getSelection()?.removeAllRanges();
    };
    const preventPointerSelection = (event) => {
      if (!isInRanksWindow(event.target)) return;
      event.preventDefault();
      window.getSelection()?.removeAllRanges();
    };
    const preventSelectAll = (event) => {
      if (!(event.ctrlKey || event.metaKey)
        || event.key.toLowerCase() !== 'a'
        || !isInRanksWindow(event.target)
      ) return;
      event.preventDefault();
      window.getSelection()?.removeAllRanges();
    };

    document.addEventListener('selectstart', preventSelection, true);
    document.addEventListener('pointerdown', preventPointerSelection, true);
    document.addEventListener('mousedown', preventPointerSelection, true);
    document.addEventListener('keydown', preventSelectAll, true);
    return () => {
      document.removeEventListener('selectstart', preventSelection, true);
      document.removeEventListener('pointerdown', preventPointerSelection, true);
      document.removeEventListener('mousedown', preventPointerSelection, true);
      document.removeEventListener('keydown', preventSelectAll, true);
    };
  }, []);

  return (
    <div className="content pixel-ranks-window">
      <p className="pixel-ranks-total">
        {t`Your pixels`}: {totalPixels.toLocaleString()}
      </p>
      <table className="pixel-ranks-table">
        <thead>
          <tr>
            <th>#</th>
            <th>{t`Rank`}</th>
            <th>{t`Tier`}</th>
            <th>{t`Pixels`}</th>
          </tr>
        </thead>
        <tbody>
          {PIXEL_RANKS.map(([, threshold], index) => {
            const rank = getPixelRankById(index + 1);
            const achieved = totalPixels >= threshold;
            const current = rank.id === currentRank.id;
            return (
              <tr
                key={rank.id}
                className={[
                  achieved ? 'pixel-rank-achieved' : 'pixel-rank-locked',
                  current ? 'pixel-rank-current' : '',
                ].filter(Boolean).join(' ')}
              >
                <td>{rank.id}</td>
                <td>
                  <span className="pixel-rank-label">
                    <PixelRankBadge rank={rank} size={34} />
                    {rank.name}
                  </span>
                </td>
                <td>{rank.metal}</td>
                <td title={threshold.toLocaleString()}>
                  <span className="pixel-rank-threshold-full">
                    {threshold.toLocaleString()}
                  </span>
                  <span className="pixel-rank-threshold-compact">
                    {compactPixels(threshold)}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

function compactPixels(pixels) {
  if (pixels < 1000) return String(pixels);
  return `${(pixels / 1000).toFixed(1)}k`;
}

export default memo(PixelRanks);
