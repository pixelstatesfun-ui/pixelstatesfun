import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { shallowEqual, useSelector } from '../store/react-redux/index.js';
import { CANVAS_TYPES } from '../core/constants.js';
import { t } from 'ttag';
import socketClient from '../socket/SocketClient.js';

function projectPoint(point, view) {
  const scale = view[2] || 1;
  return [
    window.innerWidth / 2 + (point[0] - view[0]) * scale,
    window.innerHeight / 2 + (point[1] - view[1]) * scale,
  ];
}

function getScreenBounds(points, view, padding) {
  const screenPoints = points.map((point) => projectPoint(point, view));
  return {
    left: Math.min(...screenPoints.map(([x]) => x)) - padding,
    right: Math.max(...screenPoints.map(([x]) => x)) + padding,
    top: Math.min(...screenPoints.map(([, y]) => y)) - padding,
    bottom: Math.max(...screenPoints.map(([, y]) => y)) + padding,
  };
}

async function factionRequest(path, options = {}) {
  const response = await fetch(`/api/factions${path}`, {
    credentials: 'same-origin',
    ...options,
  });
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(t`The faction server returned an invalid response.`);
  }
  if (!response.ok) {
    const error = new Error(data.error || t`Faction request failed.`);
    error.status = response.status;
    throw error;
  }
  return data;
}

function erasePolyline(points, cursor, view, radius) {
  const fragments = [];
  let current = [];
  let erased = false;
  const minimumFragmentLength = Math.max(6, radius * 2);
  const interpolate = (start, end, ratio) => [
    Math.round(start[0] + (end[0] - start[0]) * ratio),
    Math.round(start[1] + (end[1] - start[1]) * ratio),
  ];
  const saveCurrent = () => {
    if (current.length > 1) {
      const compact = current.filter((point, index) => (
        index === 0
        || point[0] !== current[index - 1][0]
        || point[1] !== current[index - 1][1]
      ));
      let length = 0;
      for (let index = 1; index < compact.length; index += 1) {
        const [startX, startY] = projectPoint(compact[index - 1], view);
        const [endX, endY] = projectPoint(compact[index], view);
        length += Math.hypot(endX - startX, endY - startY);
      }
      if (length >= minimumFragmentLength) fragments.push(compact);
    }
    current = [];
  };

  for (let index = 1; index < points.length; index += 1) {
    const worldStart = points[index - 1];
    const worldEnd = points[index];
    const start = projectPoint(worldStart, view);
    const end = projectPoint(worldEnd, view);
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    const lengthSquared = dx * dx + dy * dy;
    const projection = lengthSquared
      ? Math.max(0, Math.min(1, (
          (cursor[0] - start[0]) * dx + (cursor[1] - start[1]) * dy
        ) / lengthSquared))
      : 0;
    const closest = [start[0] + projection * dx, start[1] + projection * dy];
    const distance = Math.hypot(cursor[0] - closest[0], cursor[1] - closest[1]);

    if (distance > radius || !lengthSquared) {
      if (!current.length) current.push(worldStart);
      current.push(worldEnd);
      continue;
    }

    erased = true;
    const halfGap = Math.sqrt(Math.max(0, radius * radius - distance * distance) / lengthSquared);
    const gapStart = Math.max(0, projection - halfGap);
    const gapEnd = Math.min(1, projection + halfGap);
    if (gapStart > 0) {
      if (!current.length) current.push(worldStart);
      current.push(interpolate(worldStart, worldEnd, gapStart));
      saveCurrent();
    } else {
      saveCurrent();
    }
    if (gapEnd < 1) {
      current = [interpolate(worldStart, worldEnd, gapEnd), worldEnd];
    }
  }
  saveCurrent();
  return erased ? fragments : null;
}

const FactionCoordination = () => {
  const [canvasId, view, isHistoricalView, rendererType, factionProfiles] = useSelector(
    (state) => [
      state.canvas.canvasId,
      state.canvas.view,
      state.canvas.isHistoricalView,
      state.canvas.rendererType,
      state.profile.factions,
    ],
    shallowEqual,
  );
  const [factions, setFactions] = useState([]);
  const [factionId, setFactionId] = useState('');
  const [marks, setMarks] = useState([]);
  const [enabled, setEnabled] = useState(false);
  const [canDraw, setCanDraw] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [tool, setTool] = useState('brush');
  const [color, setColor] = useState('#ff3b30');
  const [width, setWidth] = useState(4);
  const [opacity, setOpacity] = useState(100);
  const [currentPoints, setCurrentPoints] = useState([]);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [overlayView, setOverlayView] = useState(view);
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const [panelPosition, setPanelPosition] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('factionCoordinationPanelPosition'));
      return saved && Number.isFinite(saved.left) && Number.isFinite(saved.top)
        ? saved : null;
    } catch {
      return null;
    }
  });
  const hasPanelPosition = Boolean(panelPosition);
  const drawingRef = useRef(false);
  const erasingRef = useRef(null);
  const toolbarRef = useRef(null);
  const dragRef = useRef(null);
  const panRef = useRef(null);

  useEffect(() => {
    if (!panelPosition) return;
    try {
      localStorage.setItem(
        'factionCoordinationPanelPosition',
        JSON.stringify(panelPosition),
      );
    } catch {
      // Keep the toolbar usable if browser storage is unavailable.
    }
  }, [panelPosition]);

  useEffect(() => {
    if (!hasPanelPosition) return undefined;
    const clampPanelPosition = () => {
      const bounds = toolbarRef.current?.getBoundingClientRect();
      if (!bounds) return;
      setPanelPosition((position) => {
        if (!position) return position;
        return {
          left: Math.max(0, Math.min(position.left, window.innerWidth - bounds.width)),
          top: Math.max(0, Math.min(position.top, window.innerHeight - bounds.height)),
        };
      });
    };
    clampPanelPosition();
    window.addEventListener('resize', clampPanelPosition);
    return () => window.removeEventListener('resize', clampPanelPosition);
  }, [hasPanelPosition, enabled]);

  useEffect(() => {
    let active = true;
    if (!factionProfiles.length) {
      setFactions([]);
      return () => {
        active = false;
      };
    }
    factionRequest('/mine')
      .then(async ({ factions: memberships = [] }) => {
        const details = await Promise.all(memberships.map(async (membership) => {
          const result = await factionRequest(`/my?factionId=${membership.id}`);
          return {
            ...membership,
            canDraw: Boolean(result.faction?.permissions?.drawCoordination),
          };
        }));
        if (!active) return;
        setFactions(details);
        setFactionId((current) => (
          details.some((faction) => String(faction.id) === current)
            ? current : String(details[0]?.id || '')
        ));
      })
      .catch((requestError) => {
        if (active) setError(requestError.message);
      });
    return () => {
      active = false;
    };
  }, [factionProfiles]);

  const faction = factions.find((entry) => String(entry.id) === factionId);
  useEffect(() => {
    setCanDraw(Boolean(faction?.canDraw));
    setMarks([]);
    setUndoStack([]);
    setRedoStack([]);
    setEnabled(false);
  }, [canvasId, faction?.canDraw, factionId]);

  useEffect(() => {
    if (!faction || isHistoricalView || rendererType !== CANVAS_TYPES.TWOD) {
      setMarks([]);
      return undefined;
    }
    let active = true;
    const loadMarks = async () => {
      try {
        const result = await factionRequest(
          `/coordination/${faction.id}?canvasId=${encodeURIComponent(canvasId)}`,
        );
        if (active) {
          setCanDraw(result.canDraw);
          setMarks(result.marks);
          setError('');
        }
      } catch (requestError) {
        if (active) {
          if (requestError.status === 401 || requestError.status === 403) {
            setMarks([]);
            setCanDraw(false);
          }
          setError(requestError.message);
        }
      }
    };
    loadMarks();
    const timer = setInterval(loadMarks, 10000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [faction, canvasId, isHistoricalView, rendererType, refresh]);

  useEffect(() => {
    const syncRendererView = () => {
      const currentView = socketClient.getRenderer?.()?.view;
      if (currentView?.length === 3) setOverlayView([...currentView]);
      else setOverlayView([...view]);
    };
    const events = window.pixelPlanetEvents;
    events?.addListener('setviewcoordinates', syncRendererView);
    events?.addListener('setscale', syncRendererView);
    window.addEventListener('resize', syncRendererView);
    syncRendererView();
    return () => {
      events?.removeListener('setviewcoordinates', syncRendererView);
      events?.removeListener('setscale', syncRendererView);
      window.removeEventListener('resize', syncRendererView);
    };
  }, [view]);

  const canvasPoint = useCallback((event) => {
    const scale = overlayView[2] || 1;
    return [
      Math.round(overlayView[0] + (event.clientX - window.innerWidth / 2) / scale),
      Math.round(overlayView[1] + (event.clientY - window.innerHeight / 2) / scale),
    ];
  }, [overlayView]);

  const createMark = useCallback(async (mark) => {
    const result = await factionRequest(`/coordination/${faction.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        canvasId: Number(canvasId),
        tool: mark.tool,
        color: mark.color,
        width: Number(mark.width),
        opacity: Number(mark.opacity),
        points: mark.points,
      }),
    });
    return { ...mark, id: result.id, canvasId: Number(canvasId) };
  }, [canvasId, faction]);

  const deleteMark = useCallback(async (mark) => {
    await factionRequest(
      `/coordination/${faction.id}/marks/${mark.id}`
      + `?canvasId=${encodeURIComponent(canvasId)}`,
      { method: 'DELETE' },
    );
  }, [canvasId, faction]);

  const applyMarkChanges = useCallback(async (changes) => {
    const result = await factionRequest(`/coordination/${faction.id}/marks`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ canvasId: Number(canvasId), changes }),
    });
    return result.groups;
  }, [canvasId, faction]);

  const finishDrawing = useCallback(async () => {
    drawingRef.current = false;
    const points = currentPoints;
    setCurrentPoints([]);
    if (!faction || !canDraw || points.length < 2) return;
    try {
      const mark = await createMark({
        tool,
        color,
        width: Number(width),
        opacity: Number(opacity),
        points: tool === 'arrow' ? [points[0], points[points.length - 1]] : points,
      });
      setMarks((current) => [...current, mark]);
      setUndoStack((current) => [...current, { type: 'add', mark }]);
      setRedoStack([]);
      setRefresh((value) => value + 1);
    } catch (requestError) {
      if (requestError.status === 401 || requestError.status === 403) setCanDraw(false);
      setError(requestError.message);
    }
  }, [canDraw, color, createMark, currentPoints, faction, opacity, tool, width]);

  const eraseMarkAt = useCallback((screenPoint) => {
    const session = erasingRef.current;
    if (!session) return;
    let updated = false;
    session.originalMarks.forEach((mark) => {
      const bounds = session.bounds.get(mark.id);
      if (screenPoint[0] < bounds.left || screenPoint[0] > bounds.right
        || screenPoint[1] < bounds.top || screenPoint[1] > bounds.bottom) return;
      const currentChange = session.changes.get(mark.id);
      const sourceSegments = currentChange?.segments || [mark.points];
      let erased = false;
      const segments = [];
      sourceSegments.forEach((points) => {
        const radius = Math.max(10, (mark.width || 1) / 2 + 6);
        const remaining = erasePolyline(points, screenPoint, overlayView, radius);
        if (remaining) {
          erased = true;
          segments.push(...remaining);
        } else {
          segments.push(points);
        }
      });
      if (erased) {
        session.changes.set(mark.id, { mark, segments });
        updated = true;
      }
    });
    if (!updated) return;
    if (session.changes.size > 50
      || [...session.changes.values()].some(({ segments }) => (
        segments.length > 100 || segments.some((points) => points.length > 400)
      ))) {
      session.invalid = true;
      setError(t`Make shorter eraser strokes to keep the canvas responsive.`);
      return;
    }

    const changedIds = new Set(session.changes.keys());
    const previews = [...session.changes.values()].flatMap(({ mark, segments }) => (
      segments.map((points, index) => ({
        ...mark,
        id: `preview-${mark.id}-${index}`,
        tool: 'brush',
        points,
      }))
    ));
    setMarks([
      ...session.originalMarks.filter((mark) => !changedIds.has(mark.id)),
      ...previews,
    ]);
  }, [overlayView]);

  const finishErasing = useCallback(async (session = erasingRef.current) => {
    if (!session || !session.changes.size) return;
    if (session.invalid) {
      setMarks(session.originalMarks);
      return;
    }
    const changes = [...session.changes.values()].map(({ mark, segments }) => ({
      removeIds: [mark.id],
      addMarks: segments.map((points) => ({
        tool: 'brush',
        color: mark.color,
        width: mark.width,
        opacity: mark.opacity,
        points,
      })),
    }));
    try {
      const groups = await applyMarkChanges(changes);
      const after = groups.map((group) => group.marks);
      const changedIds = new Set(session.changes.keys());
      setMarks((current) => [
        ...current.filter((mark) => !changedIds.has(mark.id)
          && !String(mark.id).startsWith('preview-')),
        ...after.flat(),
      ]);
      setUndoStack((current) => [...current, {
        type: 'erase',
        before: [...session.changes.values()].map(({ mark }) => mark),
        after,
      }]);
      setRedoStack([]);
      setRefresh((value) => value + 1);
      setError('');
    } catch (requestError) {
      setMarks(session.originalMarks);
      if (requestError.status === 401 || requestError.status === 403) setCanDraw(false);
      setError(requestError.message);
    }
  }, [applyMarkChanges]);

  const undo = async () => {
    const action = undoStack[undoStack.length - 1];
    if (!action) return;
    try {
      let restoredMark;
      if (action.type === 'erase') {
        const groups = await applyMarkChanges(action.before.map((mark, index) => ({
          removeIds: action.after[index].map((fragment) => fragment.id),
          addMarks: [{
            tool: mark.tool,
            color: mark.color,
            width: mark.width,
            opacity: mark.opacity,
            points: mark.points,
          }],
        })));
        const restoredGroups = groups.map((group) => group.marks);
        const removedIds = new Set(action.after.flat().map((mark) => mark.id));
        setMarks((current) => [
          ...current.filter((mark) => !removedIds.has(mark.id)),
          ...restoredGroups.flat(),
        ]);
        setRedoStack((current) => [...current, {
          type: 'erase',
          before: restoredGroups.map((group) => group[0]),
          after: action.after,
        }]);
      } else if (action.type === 'add') {
        await deleteMark(action.mark);
        setMarks((current) => current.filter((mark) => mark.id !== action.mark.id));
        setRedoStack((current) => [...current, {
          type: 'add',
          mark: action.mark,
        }]);
      } else {
        restoredMark = await createMark(action.mark);
        setMarks((current) => [...current, restoredMark]);
        setRedoStack((current) => [...current, {
          type: 'delete',
          mark: restoredMark,
        }]);
      }
      setUndoStack((current) => current.slice(0, -1).map((entry) => (
        restoredMark && entry.mark?.id === action.mark.id
          ? { ...entry, mark: restoredMark }
          : entry
      )));
      setRefresh((value) => value + 1);
      setError('');
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const redo = async () => {
    const action = redoStack[redoStack.length - 1];
    if (!action) return;
    try {
      if (action.type === 'erase') {
        const groups = await applyMarkChanges(action.before.map((mark, index) => ({
          removeIds: [mark.id],
          addMarks: action.after[index].map((fragment) => ({
            tool: fragment.tool,
            color: fragment.color,
            width: fragment.width,
            opacity: fragment.opacity,
            points: fragment.points,
          })),
        })));
        const after = groups.map((group) => group.marks);
        const removedIds = new Set(action.before.map((mark) => mark.id));
        setMarks((current) => [
          ...current.filter((mark) => !removedIds.has(mark.id)),
          ...after.flat(),
        ]);
        setUndoStack((current) => [...current, {
          type: 'erase',
          before: action.before,
          after,
        }]);
      } else if (action.type === 'add') {
        const restoredMark = await createMark(action.mark);
        setMarks((current) => [...current, restoredMark]);
        setUndoStack((current) => [...current, {
          type: 'add',
          mark: restoredMark,
        }]);
      } else {
        await deleteMark(action.mark);
        setMarks((current) => current.filter((mark) => mark.id !== action.mark.id));
        setUndoStack((current) => [...current, {
          type: 'delete',
          mark: action.mark,
        }]);
      }
      setRedoStack((current) => current.slice(0, -1));
      setRefresh((value) => value + 1);
      setError('');
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const startPanelDrag = (event) => {
    if (event.button !== 0) return;
    const bounds = toolbarRef.current.getBoundingClientRect();
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      left: bounds.left,
      top: bounds.top,
    };
    setPanelPosition({ left: bounds.left, top: bounds.top });
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const movePanel = (event) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const bounds = toolbarRef.current.getBoundingClientRect();
    setPanelPosition({
      left: Math.max(0, Math.min(
        window.innerWidth - bounds.width,
        drag.left + event.clientX - drag.startX,
      )),
      top: Math.max(0, Math.min(
        window.innerHeight - bounds.height,
        drag.top + event.clientY - drag.startY,
      )),
    });
  };

  const stopPanelDrag = (event) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  };

  const clearMarks = async () => {
    if (!faction) return;
    try {
      await factionRequest(
        `/coordination/${faction.id}?canvasId=${encodeURIComponent(canvasId)}`,
        { method: 'DELETE' },
      );
      setMarks([]);
      setUndoStack([]);
      setRedoStack([]);
      setError('');
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  if (!factions.length || isHistoricalView || rendererType !== CANVAS_TYPES.TWOD) return null;

  const renderMark = (mark, isPreview = false) => {
    const points = mark.points.map((point) => projectPoint(point, overlayView));
    const path = points.map(([x, y], index) => `${index ? 'L' : 'M'} ${x} ${y}`).join(' ');
    const strokeWidth = mark.width || width;
    const colorValue = mark.color || color;
    const markOpacity = Math.max(0, Math.min(1, (mark.opacity ?? opacity) / 100));
    let arrowHead = '';
    if (mark.tool === 'arrow' && points.length >= 2) {
      const [start, tip] = [points[points.length - 2], points[points.length - 1]];
      const angle = Math.atan2(tip[1] - start[1], tip[0] - start[0]);
      const size = Math.max(10, Math.min(36, strokeWidth * 3));
      const wing = size * 0.62;
      const baseX = tip[0] - size * Math.cos(angle);
      const baseY = tip[1] - size * Math.sin(angle);
      const left = [
        baseX + wing * Math.sin(angle),
        baseY - wing * Math.cos(angle),
      ];
      const right = [
        baseX - wing * Math.sin(angle),
        baseY + wing * Math.cos(angle),
      ];
      arrowHead = `M ${left[0]} ${left[1]} L ${tip[0]} ${tip[1]} `
        + `L ${right[0]} ${right[1]}`;
    }
    return (
      <g
        key={mark.id || 'preview'}
        opacity={markOpacity * (isPreview ? 0.8 : 1)}
      >
        <path
          d={path}
          fill="none"
          stroke={colorValue}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {arrowHead && (
          <path
            d={arrowHead}
            fill="none"
            stroke={colorValue}
            strokeWidth={Math.max(2, strokeWidth * 0.8)}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </g>
    );
  };

  const zoomCanvas = (factor) => {
    const renderer = socketClient.getRenderer();
    if (!renderer) return;
    const [centerX, centerY, scale] = renderer.view;
    renderer.updateView([centerX, centerY, scale * factor]);
  };

  return (
    <>
      {canDraw && (
        <div
          className={`faction-coordination-toolbar${enabled ? ' expanded' : ''}`}
          style={{
            position: 'fixed',
            ...(enabled && panelPosition
              ? { left: `${panelPosition.left}px`, top: `${panelPosition.top}px` }
              : {
                  bottom: enabled ? '72px' : '16px',
                  right: enabled ? '12px' : '139px',
                }),
            zIndex: 9,
            display: 'flex',
            flexDirection: enabled ? 'column' : 'row',
            alignItems: enabled ? 'stretch' : 'center',
            gap: enabled ? '0.65rem' : '0.3rem',
            width: enabled ? '190px' : 'auto',
            padding: enabled ? '0.8rem' : '0',
            color: '#fff',
            background: enabled ? 'rgba(23, 28, 38, 0.97)' : 'transparent',
            border: enabled ? '1px solid rgba(255,255,255,0.16)' : '0',
            borderRadius: enabled ? '0.85rem' : '0',
            boxShadow: enabled ? '0 10px 32px rgba(0,0,0,0.32)' : 'none',
          }}
          ref={toolbarRef}
        >
          <button
            type="button"
            className="actionbuttons faction-coordination-button"
            aria-pressed={enabled}
            title={t`Faction canvas planning`}
            aria-label={t`Faction canvas planning`}
            onClick={() => setEnabled((value) => !value)}
          >
            <svg
              viewBox="0 0 24 24"
              width="20"
              height="20"
              fill="currentColor"
              aria-hidden="true">
              <path
                d="M3 17.25V21h3.75L17.8 9.94l-3.75-3.75L3 17.25Zm17.71-10.04a1 1 0 0 0 0-1.42l-2.5-2.5a1 1 0 0 0-1.42 0l-1.83 1.83 3.75 3.75 2-1.66Z" />
            </svg>
          </button>
          {enabled && (
            <>
              <div
                className="faction-coordination-drag-handle"
                onPointerDown={startPanelDrag}
                onPointerMove={movePanel}
                onPointerUp={stopPanelDrag}
                onPointerCancel={stopPanelDrag}
                title={t`Drag to move`}
              >
                <span aria-hidden="true">⠿</span>
                <strong>{t`Coordination`}</strong>
                <span
                  className="faction-coordination-drag-hint">{t`Drag`}</span>
              </div>
              <section
                className="faction-coordination-panel"
                aria-label={t`Coordination tools`}>
                <div className="faction-coordination-history">
                  <button
                    type="button"
                    onClick={undo}
                    disabled={!undoStack.length}
                    aria-label={t`Undo`}
                    title={t`Undo`}
                  >↶ {t`Undo`}</button>
                  <button
                    type="button"
                    onClick={redo}
                    disabled={!redoStack.length}
                    aria-label={t`Redo`}
                    title={t`Redo`}
                  >↷ {t`Redo`}</button>
                </div>
                <label className="faction-coordination-color">
                  <span>{t`Color`}</span>
                  <input
                    type="color"
                    aria-label={t`Drawing color`}
                    value={color}
                    onInput={(event) => setColor(event.currentTarget.value)}
                  />
                </label>
                <label className="faction-coordination-opacity">
                  <span>{t`Opacity`} · {opacity}%</span>
                  <input
                    type="range"
                    aria-label={t`Drawing opacity`}
                    min="0"
                    max="100"
                    step="5"
                    value={opacity}
                    onInput={(event) => setOpacity(Number(event.currentTarget.value))}
                  />
                </label>
                <div className="faction-coordination-tool-group">
                  <span>{t`Tools`}</span>
                  <div className="faction-coordination-tool-grid">
                    <button
                      type="button"
                      className={tool === 'hand' ? 'selected' : ''}
                      aria-label={t`Hand`}
                      aria-pressed={tool === 'hand'}
                      title={t`Move canvas`}
                      onClick={() => setTool('hand')}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path
                          d="M8 11V5a1.5 1.5 0 0 1 3 0v5-7a1.5 1.5 0 0 1 3 0v7-5a1.5 1.5 0 0 1 3 0v6-3a1.5 1.5 0 0 1 3 0v7c0 4-2.5 6-6 6h-3c-2 0-3.5-.9-4.5-2.3L3 15a1.5 1.5 0 0 1 2.4-1.8L8 16v-5Z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      className={tool === 'brush' ? 'selected' : ''}
                      aria-label={t`Brush`}
                      aria-pressed={tool === 'brush'}
                      title={t`Brush`}
                      onClick={() => setTool('brush')}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path
                          d="M15.5 4.5a2.1 2.1 0 0 1 3 3L9 17l-4 1 1-4 9.5-9.5ZM4 20c1.4 0 2.5-.5 3.2-1.4" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      className={tool === 'arrow' ? 'selected' : ''}
                      aria-label={t`Arrow`}
                      aria-pressed={tool === 'arrow'}
                      title={t`Arrow`}
                      onClick={() => setTool('arrow')}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M5 19 19 5M9 5h10v10" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      className={tool === 'eraser' ? 'selected' : ''}
                      aria-label={t`Eraser`}
                      aria-pressed={tool === 'eraser'}
                      title={t`Eraser`}
                      onClick={() => setTool('eraser')}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path
                          d="m3 14 9-9a2 2 0 0 1 3 0l6 6a2 2 0 0 1 0 3l-7 7H9l-6-6a2 2 0 0 1 0-1Z" />
                        <path d="m8 9 7 7M14 21h7" />
                      </svg>
                    </button>
                  </div>
                </div>
                {tool === 'hand' && (
                  <div className="faction-coordination-zoom-controls">
                    <button
                      type="button"
                      aria-label={t`Zoom out`}
                      title={t`Zoom out`}
                      onClick={() => zoomCanvas(0.8)}
                    >−</button>
                    <button
                      type="button"
                      aria-label={t`Zoom in`}
                      title={t`Zoom in`}
                      onClick={() => zoomCanvas(1.25)}
                    >+</button>
                  </div>
                )}
                <label className="faction-coordination-width">
                  <span>{t`Width`} · {width}</span>
                  <input
                    type="range"
                    aria-label={t`Drawing thickness`}
                    min="1"
                    max="32"
                    value={width}
                    onInput={(event) => setWidth(Number(event.currentTarget.value))}
                  />
                </label>
                {factions.length > 1 && (
                  <label className="faction-coordination-select">
                    <span>{t`Faction`}</span>
                    <select
                      aria-label={t`Faction`}
                      value={factionId}
                      onChange={(event) => setFactionId(event.currentTarget.value)}
                    >
                      {factions.map((entry) => (
                        <option key={entry.id} value={entry.id}>
                          [{entry.tag || entry.name}]
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <div className="faction-coordination-actions">
                  <button type="button" onClick={clearMarks}>
                    {t`Clear marks`}
                  </button>
                  <button type="button" onClick={() => setEnabled(false)}>
                    {t`Done`}
                  </button>
                </div>
              </section>
            </>
          )}
        </div>
      )}
      <svg
        aria-label={t`Faction-only coordination marks`}
        viewBox={`0 0 ${window.innerWidth} ${window.innerHeight}`}
        style={{
          position: 'fixed',
          inset: 0,
          width: '100vw',
          height: '100vh',
          zIndex: 2,
          pointerEvents: canDraw && enabled ? 'auto' : 'none',
          touchAction: 'none',
          cursor: tool === 'hand' && enabled && canDraw
            ? isPanning ? 'grabbing' : 'grab'
            : tool === 'eraser' && enabled && canDraw
              ? 'url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2724%27 height=%2724%27 viewBox=%270 0 24 24%27%3E%3Cpath fill=%27%23f4f4f5%27 stroke=%27%2318181b%27 stroke-width=%271.5%27 d=%27m3 14 9-9a2 2 0 0 1 3 0l6 6a2 2 0 0 1 0 3l-7 7H9l-6-6a2 2 0 0 1 0-1Z%27/%3E%3Cpath stroke=%27%2318181b%27 d=%27m8 9 7 7M14 21h7%27/%3E%3C/svg%3E") 5 19, crosshair'
              : 'crosshair',
        }}
        onWheel={(event) => {
          if (!enabled || !canDraw || tool !== 'hand') return;
          event.preventDefault();
          zoomCanvas(event.deltaY > 0 ? 0.9 : 1.1);
        }}
        onPointerDown={(event) => {
          if (!canDraw || event.button !== 0) return;
          if (tool === 'hand') {
            const renderer = socketClient.getRenderer();
            if (!renderer) return;
            renderer.cancelStoreViewInState();
            panRef.current = {
              pointerId: event.pointerId,
              startX: event.clientX,
              startY: event.clientY,
              startView: [...renderer.view],
            };
            setIsPanning(true);
            event.currentTarget.setPointerCapture(event.pointerId);
            return;
          }
          if (tool === 'eraser') {
            erasingRef.current = {
              pointerId: event.pointerId,
              originalMarks: marks,
              changes: new Map(),
              bounds: new Map(marks.map((mark) => {
                const padding = Math.max(10, (mark.width || 1) / 2 + 6);
                return [
                  mark.id,
                  getScreenBounds(mark.points, overlayView, padding),
                ];
              })),
            };
            event.currentTarget.setPointerCapture(event.pointerId);
            eraseMarkAt([event.clientX, event.clientY]);
            return;
          }
          drawingRef.current = true;
          const point = canvasPoint(event);
          setCurrentPoints([point]);
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (panRef.current?.pointerId === event.pointerId) {
            const renderer = socketClient.getRenderer();
            if (!renderer) return;
            const { startX, startY, startView } = panRef.current;
            const currentScale = renderer.view[2] || startView[2];
            renderer.updateView([
              startView[0] - (event.clientX - startX) / currentScale,
              startView[1] - (event.clientY - startY) / currentScale,
            ]);
            return;
          }
          if (erasingRef.current?.pointerId === event.pointerId) {
            eraseMarkAt([event.clientX, event.clientY]);
            return;
          }
          if (!drawingRef.current) return;
          const point = canvasPoint(event);
          const samples = typeof event.getCoalescedEvents === 'function'
            ? event.getCoalescedEvents()
            : [event];
          setCurrentPoints((points) => {
            const next = [...points];
            samples.forEach((sample) => {
              const samplePoint = canvasPoint(sample);
              const previous = next[next.length - 1];
              if (next.length < 400
                && (!previous || previous[0] !== samplePoint[0]
                  || previous[1] !== samplePoint[1])) {
                next.push(samplePoint);
              }
            });
            if (next.length < 400) {
              const previous = next[next.length - 1];
              if (!previous || previous[0] !== point[0] || previous[1] !== point[1]) {
                next.push(point);
              }
            }
            return next;
          });
        }}
        onPointerUp={(event) => {
          if (panRef.current?.pointerId === event.pointerId) {
            panRef.current = null;
            setIsPanning(false);
            socketClient.getRenderer()?.storeViewInState();
            return;
          }
          if (erasingRef.current?.pointerId === event.pointerId) {
            const session = erasingRef.current;
            erasingRef.current = null;
            finishErasing(session);
            return;
          }
          if (drawingRef.current) finishDrawing();
        }}
        onPointerCancel={(event) => {
          if (panRef.current?.pointerId === event.pointerId) {
            panRef.current = null;
            setIsPanning(false);
            socketClient.getRenderer()?.storeViewInState();
            return;
          }
          if (erasingRef.current?.pointerId === event.pointerId) {
            setMarks(erasingRef.current.originalMarks);
            erasingRef.current = null;
            return;
          }
          if (drawingRef.current) finishDrawing();
        }}
      >
        {marks.map((mark) => renderMark(mark))}
        {currentPoints.length > 1 && renderMark({
          points: tool === 'arrow'
            ? [currentPoints[0], currentPoints[currentPoints.length - 1]]
            : currentPoints,
          tool,
        }, true)}
      </svg>
      {error && (
        <div
          role="alert"
          style={{
            position: 'fixed',
            top: '8rem',
            right: '1rem',
            zIndex: 10,
            padding: '0.5rem',
            color: '#fff',
            background: '#a00',
          }}>{error}</div>
      )}
    </>
  );
};

export default FactionCoordination;
