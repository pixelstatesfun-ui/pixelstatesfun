
import { worldToScreen } from '../core/utils.js';
import { TILE_SIZE } from '../core/constants.js';

const MAX_MARKER_SCALE = 0.25;
const MAX_VISIBLE_MARKERS = 150;
const MIN_ZONE_PIXELS = 1;
const DEFAULT_ZONE_RADIUS = 16;
const ZONE_TIMEOUT = 40000;

let zonesByCanvas = new Map();
let zonesVersion = 0;
let zoneActivity = new Map();

export function setActivePixelZones(canvasId, zones) {
  const id = String(canvasId);
  const now = Date.now();

  const previous = zoneActivity.get(id) || new Map();
  const updated = new Map();

  zones.forEach((zone) => {
    const key = `${zone.x}:${zone.y}`;

    updated.set(key, {
      zone,
      lastActivity: now,
    });
  });

  // Əvvəlki zonaları saxla, əgər hələ 10 saniyə keçməyibsə
  previous.forEach((data, key) => {
    if (!updated.has(key) && now - data.lastActivity < ZONE_TIMEOUT) {
      updated.set(key, data);
    }
  });

  zoneActivity.set(id, updated);

  const activeZones = [...updated.values()].map((item) => item.zone);

  zonesByCanvas.set(id, activeZones);
  zonesVersion += 1;
}

export function getActivePixelZonesVersion() {
  return zonesVersion;
}

export function hasActivePixelActivity(canvasId) {
  return getActivePixelZones(canvasId).length > 0;
}

export function getActivePixelZones(canvasId) {
  const id = String(canvasId);
  const activity = zoneActivity.get(id);

  if (!activity) return [];

  const now = Date.now();
  let changed = false;

  activity.forEach((data, key) => {
    if (now - data.lastActivity >= ZONE_TIMEOUT) {
      activity.delete(key);
      changed = true;
    }
  });

  if (changed) {
    zonesByCanvas.set(
      id,
      [...activity.values()].map((item) => item.zone),
    );
    zonesVersion += 1;
  }

  return zonesByCanvas.get(id) || [];
}

export function renderActivePixelZones(
  context,
  canvasId,
  viewport,
  view,
  scale,
) {
  if (scale > MAX_MARKER_SCALE) return;

  getVisibleClusters(canvasId, viewport, view, scale)
    .slice(0, MAX_VISIBLE_MARKERS)
    .forEach((cluster) => {
      if (cluster.pixels < MIN_ZONE_PIXELS) return;
      drawActivityMarker(
        context,
        cluster.screenX,
        cluster.screenY,
        cluster.pixels,
        cluster.users,
      );
    });
}

export function getActivePixelZoneAt(
  canvasId,
  viewport,
  view,
  scale,
  [x, y],
) {
  if (scale > MAX_MARKER_SCALE) return null;

  let closest = null;
  let closestDistance = 24;

  getVisibleClusters(canvasId, viewport, view, scale).forEach((cluster) => {
    if (cluster.pixels < MIN_ZONE_PIXELS) return;

    const distance = Math.hypot(x - cluster.screenX, y - cluster.screenY);

    if (distance <= closestDistance) {
      closest = cluster;
      closestDistance = distance;
    }
  });

  if (!closest) return null;

  const worldWidth = Math.max(
    TILE_SIZE,
    closest.maxX - closest.minX,
  );

  const worldHeight = Math.max(
    TILE_SIZE,
    closest.maxY - closest.minY,
  );

  const targetScale = Math.min(
    18,
    Math.max(
      3,
      Math.min(
        (viewport.width * 0.72) / worldWidth,
        (viewport.height * 0.72) / worldHeight,
      ),
    ),
  );

  return {
    x: closest.worldX,
    y: closest.worldY,
    scale: targetScale,
  };
}

function getVisibleClusters(canvasId, viewport, view, scale) {
  const zones = getActivePixelZones(canvasId);

  if (!zones.length) return [];

  const visibleZones = [];

  zones.forEach((zone) => {
    const {
      x, y, count, minX, minY, maxX, maxY,
    } = zone;

    const [screenX, screenY] = worldToScreen(
      view,
      scale,
      viewport,
      [x, y],
    );

    const worldMinX = Number.isFinite(minX)
      ? minX
      : x - DEFAULT_ZONE_RADIUS;

    const worldMinY = Number.isFinite(minY)
      ? minY
      : y - DEFAULT_ZONE_RADIUS;

    const worldMaxX = Number.isFinite(maxX)
      ? maxX
      : x + DEFAULT_ZONE_RADIUS;

    const worldMaxY = Number.isFinite(maxY)
      ? maxY
      : y + DEFAULT_ZONE_RADIUS;

    const screenRadiusX = Math.max(
      DEFAULT_ZONE_RADIUS,
      Math.max(Math.abs(x - worldMinX), Math.abs(worldMaxX - x)),
    ) * scale;

    const screenRadiusY = Math.max(
      DEFAULT_ZONE_RADIUS,
      Math.max(Math.abs(y - worldMinY), Math.abs(worldMaxY - y)),
    ) * scale;

    if (
      screenX < -screenRadiusX - 32
      || screenX > viewport.width + screenRadiusX + 32
      || screenY < -screenRadiusY - 32
      || screenY > viewport.height + screenRadiusY + 32
    ) return;

    visibleZones.push({
      screenX,
      screenY,
      worldX: x,
      worldY: y,
      pixels: count,
      users: zone.users,
      minX: worldMinX,
      maxX: worldMaxX,
      minY: worldMinY,
      maxY: worldMaxY,
    });
  });

  return visibleZones;
}

function drawActivityMarker(context, x, y, count, users) {
  const radius = 20;

  const heat = users
    ? Math.min(1, users / 8)
    : Math.min(1, Math.log10(count + 1) / 4);

  const phase = Date.now() / 180 + 1.7 * (users || count);

  const flameSize = (20 + 16 * heat) * (
    1 + 0.06 * Math.sin(phase) + 0.04 * Math.sin(2.3 * phase)
  );

  const glowRadius = 1.2 * Math.max(flameSize, radius * 2.4);

  const glow = context.createRadialGradient(
    x, y, 0, x, y, glowRadius,
  );

  glow.addColorStop(0, `rgba(255, 120, 0, ${0.35 + 0.2 * heat})`);
  glow.addColorStop(1, 'rgba(255, 60, 0, 0)');

  context.save();
  context.fillStyle = glow;
  context.beginPath();
  context.arc(x, y, glowRadius, 0, Math.PI * 2);
  context.fill();

  context.lineWidth = 3;
  context.fillStyle = '#fff';
  context.strokeStyle = '#f07816';
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.fill();
  context.stroke();

  context.fillStyle = '#f07816';
  context.save();
  context.translate(x, y);
  context.scale(flameSize / 20, flameSize / 20);
  context.translate(-x, -y);

  context.beginPath();
  context.moveTo(x, y + 9);
  context.bezierCurveTo(x - 11, y + 1, x - 4, y - 8, x, y - 14);
  context.bezierCurveTo(x + 1, y - 7, x + 11, y - 3, x + 7, y + 6);
  context.bezierCurveTo(x + 5, y + 11, x + 1, y + 12, x, y + 9);
  context.fill();

  context.fillStyle = '#ffbe36';
  context.beginPath();
  context.ellipse(x + 1, y + 5, 3.5, 5, 0, 0, Math.PI * 2);
  context.fill();
  context.restore();

  if (count >= MIN_ZONE_PIXELS) {
    const badgeX = x + 14;
    const badgeY = y + 14;
    const badgeText = formatActivityCount(count);

    context.fillStyle = '#e34d22';
    context.beginPath();
    context.arc(badgeX, badgeY, 11, 0, Math.PI * 2);
    context.fill();

    context.fillStyle = '#fff';
    context.font = 'bold 9px sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(badgeText, badgeX, badgeY, 18);
  }

  context.restore();
}

function formatActivityCount(count) {
  if (count >= 1000000) {
    const millions = (count / 1000000)
      .toFixed(1)
      .replace(/\.0$/, '');

    return `${millions}M`;
  }

  if (count >= 1000) {
    return `${Math.floor(count / 1000)}k`;
  }

  return String(count);
}
