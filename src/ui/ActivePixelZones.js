/*
 * Active pixel zone store for PixelStates Fire window, canvas markers,
 * hotspot controls, unique user counts, and auto-expanding area screenshots.
 */

const ZONE_SIZE = 32;
const ZONE_MERGE_MARGIN = 24;
const ZONE_TTL_MS = 10 * 60 * 1000;
const HOTSPOT_HIT_RADIUS_PX = 24;
const MAX_SNAPSHOT_HISTORY = 5;
const SNAPSHOT_EXPANSION_COOLDOWN_MS = 400;

const syncedZonesByCanvas = new Map();
const localZonesByCanvas = new Map();
const snapshotsByCanvas = new Map();
let snapshotProvider = null;
let version = 0;
let nextLocalZoneId = 1;

function getCanvasSnapshots(canvasId) {
  let map = snapshotsByCanvas.get(canvasId);
  if (!map) {
    map = new Map();
    snapshotsByCanvas.set(canvasId, map);
  }
  return map;
}

function getBoundsMetrics(zone) {
  const minX = Math.floor(Number.isFinite(zone.minX) ? zone.minX : zone.x - 4);
  const minY = Math.floor(Number.isFinite(zone.minY) ? zone.minY : zone.y - 4);
  const maxX = Math.ceil(Number.isFinite(zone.maxX) ? zone.maxX : zone.x + 4);
  const maxY = Math.ceil(Number.isFinite(zone.maxY) ? zone.maxY : zone.y + 4);
  const width = Math.max(1, maxX - minX + 1);
  const height = Math.max(1, maxY - minY + 1);
  return {
    minX,
    minY,
    maxX,
    maxY,
    width,
    height,
    area: width * height,
  };
}

function hasBoundsExpanded(prevBounds, nextBounds) {
  if (!prevBounds) return true;
  return (
    nextBounds.minX < prevBounds.minX
    || nextBounds.minY < prevBounds.minY
    || nextBounds.maxX > prevBounds.maxX
    || nextBounds.maxY > prevBounds.maxY
  );
}

function captureFallbackCanvasSnapshot(bounds) {
  if (typeof document === 'undefined') return null;
  const sourceCanvas = document.querySelector('canvas.ps-canvas-backdrop')
    || document.querySelector('canvas');
  if (!sourceCanvas || !sourceCanvas.width || !sourceCanvas.height) {
    return null;
  }
  try {
    const outW = 280;
    const outH = 148;
    const offscreen = document.createElement('canvas');
    offscreen.width = outW;
    offscreen.height = outH;
    const ctx = offscreen.getContext('2d');
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = false;
    const pad = 40;
    const sx = Math.max(
      0,
      Math.min(sourceCanvas.width - 1, Math.round(bounds.minX) - pad),
    );
    const sy = Math.max(
      0,
      Math.min(sourceCanvas.height - 1, Math.round(bounds.minY) - pad),
    );
    const sw = Math.max(
      32,
      Math.min(sourceCanvas.width - sx, Math.round(bounds.width) + pad * 2),
    );
    const sh = Math.max(
      32,
      Math.min(sourceCanvas.height - sy, Math.round(bounds.height) + pad * 2),
    );
    ctx.drawImage(sourceCanvas, sx, sy, sw, sh, 0, 0, outW, outH);
    return offscreen.toDataURL('image/png');
  } catch {
    return null;
  }
}

function ensureZoneSnapshot(canvasId, zoneKey, zone, now = Date.now()) {
  const snapshots = getCanvasSnapshots(canvasId);
  const existing = snapshots.get(zoneKey);
  const bounds = getBoundsMetrics(zone);
  const expanded = existing ? hasBoundsExpanded(existing.bounds, bounds) : false;

  if (existing && !expanded) {
    return existing;
  }
  if (
    existing
    && expanded
    && (now - existing.capturedAt) < SNAPSHOT_EXPANSION_COOLDOWN_MS
  ) {
    return existing;
  }

  let dataUrl = null;
  if (typeof snapshotProvider === 'function') {
    try {
      dataUrl = snapshotProvider(canvasId, {
        ...bounds,
        x: zone.x,
        y: zone.y,
        count: zone.count,
        users: zone.users,
      });
    } catch {
      dataUrl = null;
    }
  }
  if (!dataUrl) {
    dataUrl = captureFallbackCanvasSnapshot(bounds);
  }
  if (!dataUrl) {
    return existing || null;
  }

  const revision = existing ? existing.revision + 1 : 1;
  const entry = {
    dataUrl,
    capturedAt: now,
    bounds,
    revision,
    expanded: revision > 1,
  };
  const history = existing
    ? [...existing.history, entry].slice(-MAX_SNAPSHOT_HISTORY)
    : [entry];
  const record = {
    ...entry,
    history,
  };
  snapshots.set(zoneKey, record);
  return record;
}

function attachSnapshotFields(zone, snapshot) {
  const bounds = getBoundsMetrics(zone);
  return {
    ...zone,
    width: bounds.width,
    height: bounds.height,
    screenshot: snapshot ? snapshot.dataUrl : null,
    screenshotUpdatedAt: snapshot ? snapshot.capturedAt : null,
    screenshotRevision: snapshot ? snapshot.revision : 0,
    screenshotExpanded: snapshot ? snapshot.expanded : false,
    screenshotHistory: snapshot ? snapshot.history : [],
  };
}

function normalizeZone(zone, index = 0) {
  const x = Number(zone.x);
  const y = Number(zone.y);
  const count = Math.max(1, Math.round(Number(zone.count) || 1));
  const users = Math.max(
    1,
    Math.round(Number(zone.users ?? zone.userCount ?? 1) || 1),
  );
  const zoneKey = zone.id
    || `s:${Math.round(x / ZONE_SIZE)}:${Math.round(y / ZONE_SIZE)}:${index}`;
  return {
    id: zoneKey,
    x,
    y,
    count,
    users,
    minX: Number.isFinite(zone.minX) ? zone.minX : x - ZONE_SIZE / 2,
    minY: Number.isFinite(zone.minY) ? zone.minY : y - ZONE_SIZE / 2,
    maxX: Number.isFinite(zone.maxX) ? zone.maxX : x + ZONE_SIZE / 2,
    maxY: Number.isFinite(zone.maxY) ? zone.maxY : y + ZONE_SIZE / 2,
  };
}

function findMatchingLocalZone(bucket, x, y) {
  let matched = null;
  let bestDist = Infinity;
  bucket.forEach((zone) => {
    const withinBox = (
      x >= zone.minX - ZONE_MERGE_MARGIN
      && x <= zone.maxX + ZONE_MERGE_MARGIN
      && y >= zone.minY - ZONE_MERGE_MARGIN
      && y <= zone.maxY + ZONE_MERGE_MARGIN
    );
    if (withinBox) {
      const dist = Math.hypot(x - zone.x, y - zone.y);
      if (dist < bestDist) {
        bestDist = dist;
        matched = zone;
      }
    }
  });
  return matched;
}

function pruneLocalZones(canvasId, now = Date.now()) {
  const bucket = localZonesByCanvas.get(canvasId);
  if (!bucket) return [];
  const snapshots = getCanvasSnapshots(canvasId);
  const active = [];
  bucket.forEach((zone, key) => {
    if (now - zone.updatedAt > ZONE_TTL_MS) {
      bucket.delete(key);
      snapshots.delete(key);
    } else {
      const normalized = {
        id: key,
        x: zone.x,
        y: zone.y,
        count: zone.count,
        users: Math.max(1, zone.users.size),
        minX: zone.minX,
        minY: zone.minY,
        maxX: zone.maxX,
        maxY: zone.maxY,
      };
      const snapshot = snapshots.get(key)
        || ensureZoneSnapshot(canvasId, key, normalized, now);
      active.push(attachSnapshotFields(normalized, snapshot));
    }
  });
  return active;
}

export function registerZoneSnapshotProvider(providerFn) {
  snapshotProvider = typeof providerFn === 'function' ? providerFn : null;
  return () => {
    if (snapshotProvider === providerFn) {
      snapshotProvider = null;
    }
  };
}

export function setActivePixelZones(canvasId, zones) {
  if (canvasId === null || canvasId === undefined) return;
  const keyId = Number(canvasId);
  const now = Date.now();
  const list = [];
  if (Array.isArray(zones)) {
    zones.forEach((zone, index) => {
      const normalized = normalizeZone(zone, index);
      const snapshot = ensureZoneSnapshot(
        keyId,
        normalized.id,
        normalized,
        now,
      );
      list.push(attachSnapshotFields(normalized, snapshot));
    });
  }
  syncedZonesByCanvas.set(keyId, list);
  version += 1;
}

export function recordActivePixels(canvasId, points, actorId = 'guest') {
  if (
    canvasId === null
    || canvasId === undefined
    || !Array.isArray(points)
    || !points.length
  ) {
    return;
  }
  const keyId = Number(canvasId);
  const now = Date.now();
  let bucket = localZonesByCanvas.get(keyId);
  if (!bucket) {
    bucket = new Map();
    localZonesByCanvas.set(keyId, bucket);
  }
  const actorValue = String(actorId || 'guest');
  const touchedKeys = new Set();

  points.forEach(([rawX, rawY]) => {
    const x = Math.round(Number(rawX));
    const y = Math.round(Number(rawY));
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;

    const existing = findMatchingLocalZone(bucket, x, y);
    if (existing) {
      existing.count += 1;
      existing.users.add(actorValue);
      existing.minX = Math.min(existing.minX, x);
      existing.minY = Math.min(existing.minY, y);
      existing.maxX = Math.max(existing.maxX, x);
      existing.maxY = Math.max(existing.maxY, y);
      existing.x = (existing.minX + existing.maxX) / 2;
      existing.y = (existing.minY + existing.maxY) / 2;
      existing.updatedAt = now;
      touchedKeys.add(existing.id);
    } else {
      const id = `local:${nextLocalZoneId}`;
      nextLocalZoneId += 1;
      bucket.set(id, {
        id,
        x,
        y,
        count: 1,
        users: new Set([actorValue]),
        minX: x,
        minY: y,
        maxX: x,
        maxY: y,
        updatedAt: now,
      });
      touchedKeys.add(id);
    }
  });

  touchedKeys.forEach((zoneKey) => {
    const zone = bucket.get(zoneKey);
    if (!zone) return;
    ensureZoneSnapshot(
      keyId,
      zoneKey,
      {
        id: zoneKey,
        x: zone.x,
        y: zone.y,
        count: zone.count,
        users: Math.max(1, zone.users.size),
        minX: zone.minX,
        minY: zone.minY,
        maxX: zone.maxX,
        maxY: zone.maxY,
      },
      now,
    );
  });

  version += 1;
}

export function recordActivePixel(canvasId, x, y, actorId = 'guest') {
  recordActivePixels(canvasId, [[x, y]], actorId);
}

export function getActivePixelZones(canvasId) {
  if (canvasId === null || canvasId === undefined) return [];
  const keyId = Number(canvasId);
  const synced = syncedZonesByCanvas.get(keyId) || [];
  const local = pruneLocalZones(keyId);
  if (synced.length > 0 && local.length === 0) {
    return synced;
  }
  if (local.length > 0 && synced.length === 0) {
    return local;
  }
  return [...synced, ...local];
}

export function getActivePixelZonesVersion() {
  return version;
}

export function getActivePixelZoneAt(
  canvasId,
  viewport,
  view,
  viewscale,
  screenCoords,
) {
  if (!viewport || !view || !screenCoords || !Number.isFinite(viewscale)) {
    return null;
  }
  const zones = getActivePixelZones(canvasId);
  if (!zones.length) return null;
  const [clickX, clickY] = screenCoords;
  const halfW = (viewport.width || window.innerWidth) / 2;
  const halfH = (viewport.height || window.innerHeight) / 2;
  let best = null;
  let bestDist = HOTSPOT_HIT_RADIUS_PX;
  zones.forEach((zone) => {
    const sx = (zone.x - view[0]) * viewscale + halfW;
    const sy = (zone.y - view[1]) * viewscale + halfH;
    const dist = Math.hypot(clickX - sx, clickY - sy);
    if (dist <= bestDist) {
      bestDist = dist;
      best = zone;
    }
  });
  return best;
}
