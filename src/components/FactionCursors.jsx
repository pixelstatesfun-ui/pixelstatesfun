import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { t } from 'ttag';
import { shallowEqual, useSelector } from '../store/react-redux/index.js';
import {
  CANVAS_TYPES,
} from '../core/constants.js';
import socketClient from '../socket/SocketClient.js';

function projectPoint(point, view) {
  const scale = view[2] || 1;
  return [
    window.innerWidth / 2 + (point[0] - view[0]) * scale,
    window.innerHeight / 2 + (point[1] - view[1]) * scale,
  ];
}

const FactionCursors = () => {
  const [
    factions, canvasId, view, isHistoricalView, rendererType,
  ] = useSelector(
    (state) => [
      state.profile.factions,
      state.canvas.canvasId,
      state.canvas.view,
      state.canvas.isHistoricalView,
      state.canvas.rendererType,
    ],
    shallowEqual,
  );
  const [selectedFaction, setSelectedFaction] = useState('');
  const [showCursors, setShowCursors] = useState(true);
  const [cursors, setCursors] = useState([]);
  const [canSeeCursors, setCanSeeCursors] = useState(false);
  const [error, setError] = useState('');
  const pointerScreenRef = useRef(null);
  const lastPublishedCursorRef = useRef(null);
  const [overlayView, setOverlayView] = useState(view);
  const viewRef = useRef(overlayView);
  viewRef.current = overlayView;
  const cursorFactions = useMemo(
    () => factions.filter(
      (faction) => faction.isCursorsEnabled
        && faction.roles?.some((role) => role.isMember),
    ),
    [factions],
  );
  const faction = cursorFactions.find(
    ({ name }) => name === selectedFaction,
  ) || cursorFactions[0];

  useEffect(() => {
    setOverlayView(socketClient.getRenderer?.()?.view || view);
  }, [canvasId, isHistoricalView, rendererType]);

  useEffect(() => {
    const events = window.pixelPlanetEvents;
    const syncRendererView = () => {
      const currentView = socketClient.getRenderer?.()?.view;
      if (currentView?.length === 3) {
        setOverlayView(currentView);
      }
    };
    events?.addListener('setviewcoordinates', syncRendererView);
    events?.addListener('setscale', syncRendererView);
    window.addEventListener('resize', syncRendererView);
    syncRendererView();
    return () => {
      events?.removeListener('setviewcoordinates', syncRendererView);
      events?.removeListener('setscale', syncRendererView);
      window.removeEventListener('resize', syncRendererView);
    };
  }, []);

  useEffect(() => {
    const trackPointer = (event) => {
      pointerScreenRef.current = [event.clientX, event.clientY];
    };
    const trackTouch = (event) => {
      const touch = event.touches[0] || event.changedTouches[0];
      if (touch) {
        pointerScreenRef.current = [touch.clientX, touch.clientY];
      }
    };
    const clearTouch = () => {
      pointerScreenRef.current = null;
    };
    const clearPointer = (event) => {
      if (event.relatedTarget === null) {
        pointerScreenRef.current = null;
      }
    };
    window.addEventListener('pointermove', trackPointer, { passive: true });
    window.addEventListener('pointerdown', trackPointer, { passive: true });
    window.addEventListener('touchstart', trackTouch, { passive: true });
    window.addEventListener('touchmove', trackTouch, { passive: true });
    window.addEventListener('touchend', clearTouch, { passive: true });
    window.addEventListener('touchcancel', clearTouch, { passive: true });
    window.addEventListener('pointerout', clearPointer, { passive: true });
    return () => {
      window.removeEventListener('pointermove', trackPointer);
      window.removeEventListener('pointerdown', trackPointer);
      window.removeEventListener('touchstart', trackTouch);
      window.removeEventListener('touchmove', trackTouch);
      window.removeEventListener('touchend', clearTouch);
      window.removeEventListener('touchcancel', clearTouch);
      window.removeEventListener('pointerout', clearPointer);
    };
  }, []);

  useEffect(() => {
    if (!cursorFactions.some(({ name }) => name === selectedFaction)) {
      setSelectedFaction(cursorFactions[0]?.name || '');
    }
  }, [cursorFactions, selectedFaction]);

  useEffect(() => {
    if (!faction || canvasId === null || isHistoricalView
      || rendererType !== CANVAS_TYPES.TWOD
    ) {
      setCursors([]);
      setCanSeeCursors(false);
      return undefined;
    }
    setCursors([]);
    setCanSeeCursors(false);
    setError('');
    let active = true;
    const removeListener = socketClient.onFactionCursors((message) => {
      if (message.factionName && message.factionName !== faction.name) return;
      if (message.errors) {
        setError(message.errors.join(', '));
        return;
      }
      if (message.state) {
        setCursors(message.state.cursors || []);
        setCanSeeCursors(message.state.canSeeCursors);
      }
      if (message.event) {
        const { type, data } = message.event;
        setCursors((current) => {
          if (type === 'cursor-update') {
            return [
              ...current.filter(({ uid }) => uid !== data.uid),
              data,
            ];
          }
          if (type === 'cursor-remove') {
            return current.filter(({ uid }) => uid !== data.uid);
          }
          return current;
        });
      }
      if (message.ok) setError('');
    });
    socketClient.subscribeFactionCursors(faction.name, canvasId);
    const publishCursor = () => {
      const screenPoint = pointerScreenRef.current;
      if (!screenPoint) {
        lastPublishedCursorRef.current = null;
        return;
      }
      const scale = viewRef.current[2] || 1;
      const cursor = [
        Math.round(viewRef.current[0]
          + (screenPoint[0] - window.innerWidth / 2) / scale),
        Math.round(viewRef.current[1]
          + (screenPoint[1] - window.innerHeight / 2) / scale),
      ];
      const lastPublished = lastPublishedCursorRef.current;
      if (lastPublished
        && lastPublished.cursor[0] === cursor[0]
        && lastPublished.cursor[1] === cursor[1]
        && Date.now() - lastPublished.sentAt < 10000
      ) {
        return;
      }
      socketClient.sendFactionCursorUpdate(
        faction.name, canvasId, cursor,
      );
      lastPublishedCursorRef.current = { cursor, sentAt: Date.now() };
    };
    const timer = setInterval(() => {
      if (!active) return;
      publishCursor();
      setCursors((current) => current.filter(({ updatedAt }) => (
        Date.now() - new Date(updatedAt).getTime() < 20000
      )));
    }, 1500);
    return () => {
      active = false;
      clearInterval(timer);
      removeListener();
      socketClient.unsubscribeFactionCursors();
      lastPublishedCursorRef.current = null;
    };
  }, [
    faction?.name,
    faction?.isCursorsEnabled,
    canvasId,
    isHistoricalView,
    rendererType,
  ]);

  if (!faction || canvasId === null || isHistoricalView
    || rendererType !== CANVAS_TYPES.TWOD
  ) {
    return null;
  }

  const visibleCursors = showCursors && canSeeCursors ? cursors : [];

  return (
    <>
      {(cursorFactions.length > 1 || canSeeCursors) && (
        <div
          className="faction-cursor-tools"
          style={{
            position: 'fixed',
            top: '3.5rem',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 8,
            display: 'flex',
            alignItems: 'center',
            gap: '0.35rem',
            padding: '0.4rem',
            background: 'rgba(20, 20, 20, 0.9)',
            color: '#fff',
            pointerEvents: 'auto',
          }}
        >
          {cursorFactions.length > 1 && (
            <select
              aria-label={t`Faction cursors`}
              value={faction.name}
              onChange={(event) => setSelectedFaction(event.currentTarget.value)}
            >
              {cursorFactions.map((item) => (
                <option key={item.name} value={item.name}>{item.title}</option>
              ))}
            </select>
          )}
          {canSeeCursors && (
            <label>
              <input
                type="checkbox"
                checked={showCursors}
                onChange={(event) => setShowCursors(event.currentTarget.checked)}
              />
              {t`Show faction cursors`}
            </label>
          )}
        </div>
      )}
      {error && (
        <div
          role="alert"
          style={{
            position: 'fixed',
            top: '6rem',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 8,
            color: '#fff',
            background: '#a00',
            padding: '0.4rem',
          }}
        >{error}</div>
      )}
      <svg
        aria-hidden="true"
        viewBox={`0 0 ${window.innerWidth} ${window.innerHeight}`}
        style={{
          position: 'fixed',
          inset: 0,
          width: '100vw',
          height: '100vh',
          zIndex: 1,
          pointerEvents: 'none',
        }}
      >
        {visibleCursors.map((cursor) => {
          const [x, y] = projectPoint([cursor.x, cursor.y], overlayView);
          return (
            <g key={cursor.uid} transform={`translate(${x}, ${y})`}>
              <path
                d="M -7 0 H 7 M 0 -7 V 7"
                stroke="#fff"
                strokeWidth="3"
              />
              <path
                d="M -7 0 H 7 M 0 -7 V 7"
                stroke="#e53935"
                strokeWidth="1.5"
              />
              <text
                x="9"
                y="-8"
                fill="#fff"
                stroke="#000"
                strokeWidth="3"
                paintOrder="stroke"
                fontSize="12"
              >{cursor.name}</text>
            </g>
          );
        })}
      </svg>
    </>
  );
};

export default FactionCursors;
