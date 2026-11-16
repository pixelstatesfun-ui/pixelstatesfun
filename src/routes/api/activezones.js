import canvases from '../../core/canvases.js';
import {
  ACTIVITY_CELL_SIZE,
  getActivePixelZones,
} from '../../data/redis/activePixelZones.js';

function isBrowserFetch(req) {
  const site = req.get('sec-fetch-site');
  const mode = req.get('sec-fetch-mode');
  const destination = req.get('sec-fetch-dest');

  if (mode && mode !== 'cors') return false;
  if (destination && destination !== 'empty') return false;

  if (site) {
    if (site === 'same-origin' || site === 'same-site') return true;
    return site === 'cross-site'
      && Boolean(req.get('origin'))
      && !req.csrfPossible;
  }

  return Boolean(req.get('origin') || req.get('referer'))
    && !req.csrfPossible;
}

export default async function activeZones(req, res) {
  req.tickRateLimiter(15_000);
  if (!isBrowserFetch(req)) {
    res.status(404).end();
    return;
  }

  const { canvasId } = req.query;
  if (typeof canvasId !== 'string'
    || !/^\d{1,3}$/.test(canvasId)
    || !canvases[canvasId]
  ) {
    res.status(400).json({ error: 'Invalid canvas identifier.' });
    return;
  }

  const canvas = canvases[canvasId];
  if (canvas.v || canvas.ed) {
    res.json({ zones: [] });
    return;
  }

  const zones = await getActivePixelZones(canvasId);
  res.json({
    zones: zones.map(({
      cellX, cellY, count, minCellX, minCellY, maxCellX, maxCellY,
    }) => ({
      x: ((cellX + 0.5) * ACTIVITY_CELL_SIZE) - canvas.size / 2,
      y: ((cellY + 0.5) * ACTIVITY_CELL_SIZE) - canvas.size / 2,
      minX: (minCellX * ACTIVITY_CELL_SIZE) - canvas.size / 2,
      minY: (minCellY * ACTIVITY_CELL_SIZE) - canvas.size / 2,
      maxX: ((maxCellX + 1) * ACTIVITY_CELL_SIZE) - canvas.size / 2,
      maxY: ((maxCellY + 1) * ACTIVITY_CELL_SIZE) - canvas.size / 2,
      count,
    })),
  });
}
