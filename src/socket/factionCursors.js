import canvases from '../core/canvases.js';
import { hasFactionPermission } from '../core/constants.js';
import { getFactionPermissionsOfUser } from '../data/sql/Faction.js';
import socketEvents from './socketEvents.js';

const MAX_COORDINATE = 1000000;
const CURSOR_TTL = 20000;
const factionCursorState = new Map();

function cursorKey(sqlFid, canvasId) {
  return `${sqlFid}:${canvasId}`;
}

async function getFactionCursors(sqlFid, canvasId) {
  const key = cursorKey(sqlFid, canvasId);
  const cursors = factionCursorState.get(key) || new Map();
  const activeCursors = [...cursors.values()].filter(
    ({ updatedAt }) => Date.now() - Date.parse(updatedAt) < CURSOR_TTL,
  );
  if (activeCursors.length) {
    factionCursorState.set(
      key,
      new Map(activeCursors.map((cursor) => [cursor.uid, cursor])),
    );
  } else {
    factionCursorState.delete(key);
  }
  return activeCursors;
}

async function setFactionCursor(sqlFid, uid, canvasId, cursor) {
  const key = cursorKey(sqlFid, canvasId);
  const cursors = factionCursorState.get(key) || new Map();
  if (!cursor) {
    cursors.delete(uid);
  } else {
    cursors.set(uid, {
      uid,
      ...cursor,
      updatedAt: new Date().toISOString(),
    });
  }
  if (cursors.size) {
    factionCursorState.set(key, cursors);
  } else {
    factionCursorState.delete(key);
  }
  return true;
}

function validCanvasId(canvasId) {
  const id = typeof canvasId === 'string' && /^\d+$/.test(canvasId)
    ? Number(canvasId) : canvasId;
  return Number.isInteger(id)
    && id >= 0
    && id <= 65535
    && Object.hasOwn(canvases, String(id))
    ? id : null;
}

function validPoint(point) {
  return Array.isArray(point)
    && point.length === 2
    && point.every((coordinate) => Number.isInteger(coordinate)
      && Math.abs(coordinate) <= MAX_COORDINATE);
}

function send(ws, message) {
  if (ws.readyState === 1) {
    ws.send(`fc,${JSON.stringify(message)}`);
  }
}

function emitCursorUpdate(subscription, type, data) {
  socketEvents.emit('factionCursor', {
    factionName: subscription.name,
    sqlFid: subscription.sqlFid,
    canvasId: subscription.canvasId,
    type,
    data,
  });
}

function clearSubscription(ws) {
  const previous = ws.factionCursors;
  ws.factionCursors = null;
  return previous;
}

function matchesSubscription(ws, factionName, canvasId) {
  const current = ws.factionCursors;
  return current && current.name === factionName
    && current.canvasId === canvasId;
}

function makeSubscription(name, canvasId, access) {
  return {
    name,
    sqlFid: access.sqlFid,
    canvasId,
    permissions: access.permissions,
    cursorsEnabled: access.cursorsEnabled,
    canSeeCursors: access.cursorsEnabled
      && hasFactionPermission(access.permissions, 'SEE_CURSORS'),
    checkedAt: Date.now(),
  };
}

function toCursorState(data, subscription, userId) {
  return {
    factionName: subscription.name,
    cursors: subscription.canSeeCursors
      ? data.filter(({ uid }) => uid !== userId) : [],
    canSeeCursors: subscription.canSeeCursors,
    canPublishCursors: subscription.cursorsEnabled,
  };
}

function emptyCursorState() {
  return {
    cursors: [],
    canSeeCursors: false,
    canPublishCursors: false,
  };
}

async function loadPermissions(uid, factionName) {
  const permissions = await getFactionPermissionsOfUser(uid, factionName);
  if (!permissions.sqlFid) {
    throw new Error('This faction does not exist or you are not a member');
  }
  return permissions;
}

async function clearCursor(subscription, uid, errorContext) {
  const success = await setFactionCursor(
    subscription.sqlFid, uid, subscription.canvasId, null,
  );
  if (!success) {
    throw new Error(errorContext);
  }
  emitCursorUpdate(subscription, 'cursor-remove', { uid });
}

export default async function handleFactionCursorMessage(message, ws) {
  const { id, action, name } = message || {};
  if (!ws.user?.id) {
    throw new Error('Login required for faction cursors');
  }
  if (typeof action !== 'string') {
    throw new Error('Invalid faction cursor action');
  }

  if (action === 'unsubscribe') {
    clearSubscription(ws);
    send(ws, { id, ok: true });
    return;
  }

  if (typeof name !== 'string' || !name) {
    throw new Error('No faction given');
  }
  const canvasId = validCanvasId(message.canvasId);
  if (canvasId === null) {
    throw new Error('Invalid canvas');
  }

  const access = await loadPermissions(ws.user.id, name);
  const subscription = makeSubscription(name, canvasId, access);
  if (!subscription.cursorsEnabled) {
    throw new Error('Faction cursors are disabled');
  }

  if (action === 'subscribe') {
    if (!matchesSubscription(ws, name, canvasId)) {
      clearSubscription(ws);
    }
    ws.factionCursors = subscription;
    const cursors = await getFactionCursors(subscription.sqlFid, canvasId);
    if (!cursors) {
      ws.factionCursors = null;
      throw new Error('Could not load faction cursors');
    }
    send(ws, {
      id,
      ok: true,
      factionName: name,
      state: toCursorState(cursors, subscription, ws.user.id),
    });
    return;
  }

  if (!matchesSubscription(ws, name, canvasId)) {
    throw new Error('Faction cursors are not subscribed');
  }
  ws.factionCursors = subscription;
  if (action !== 'cursor') {
    throw new Error('Invalid faction cursor action');
  }

  const { cursor } = message;
  if (!validPoint(cursor)) {
    throw new Error('Invalid cursor coordinates');
  }
  const success = await setFactionCursor(
    subscription.sqlFid, ws.user.id, canvasId,
    { x: cursor[0], y: cursor[1] },
  );
  if (!success) {
    throw new Error('Could not update faction cursor');
  }
  emitCursorUpdate(subscription, 'cursor-update', {
    uid: ws.user.id,
    name: ws.user.data.name,
    x: cursor[0],
    y: cursor[1],
    updatedAt: new Date().toISOString(),
  });
  if (id !== undefined) send(ws, { id, ok: true });
}

export function sendFactionCursorUpdate(ws, update) {
  const subscription = ws.factionCursors;
  if (!subscription
    || subscription.sqlFid !== update.sqlFid
    || subscription.canvasId !== update.canvasId
    || update.data.uid === ws.user?.id
    || !subscription.canSeeCursors
  ) {
    return;
  }
  if (Date.now() - subscription.checkedAt > 10000) {
    refreshFactionCursorSubscription(ws).catch((error) => {
      console.error(
        `Could not refresh faction cursor access: ${error.message}`,
      );
    }).then(() => {
      if (ws.factionCursors
        && Date.now() - ws.factionCursors.checkedAt <= 10000
      ) {
        sendFactionCursorUpdate(ws, update);
      }
    });
    return;
  }
  send(ws, {
    event: {
      factionName: update.factionName,
      type: update.type,
      data: update.data,
    },
  });
}

export async function refreshFactionCursorSubscription(ws) {
  const current = ws.factionCursors;
  if (!current || ws.readyState !== 1 || ws.factionCursorChecking) {
    return;
  }
  ws.factionCursorChecking = true;
  try {
    const access = await getFactionPermissionsOfUser(
      ws.user.id, current.name,
    );
    if (ws.factionCursors !== current) return;
    if (access.sqlFid !== current.sqlFid || !access.cursorsEnabled) {
      ws.factionCursors = null;
      await clearCursor(
        current, ws.user.id, 'Could not clear revoked faction cursor',
      );
      send(ws, {
        factionName: current.name,
        state: emptyCursorState(),
      });
      return;
    }

    const next = makeSubscription(current.name, current.canvasId, access);
    const accessChanged = (
      current.permissions !== next.permissions
      || current.cursorsEnabled !== next.cursorsEnabled
    );
    next.checkedAt = Date.now();
    ws.factionCursors = next;
    if (!accessChanged) return;

    const cursors = await getFactionCursors(next.sqlFid, next.canvasId);
    if (!cursors || ws.factionCursors !== next) return;
    send(ws, {
      factionName: next.name,
      state: toCursorState(cursors, next, ws.user.id),
    });
  } finally {
    ws.factionCursorChecking = false;
  }
}
