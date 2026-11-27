/*
 * PixelStates shell mounting authentic native HUD buttons, unmodified SVG icons,
 * Settings theme switching, UserArea login, Templates manager, native
 * FactionCoordination, and all Diplomacy & Factions Overhaul windows directly
 * onto PixelStates' unmodified default.css and theme-*.css files.
 */
/* eslint-disable max-len */

import { render, Component } from 'preact';
import {
  useState, useEffect, useMemo, useRef, useCallback,
} from 'preact/hooks';
import {
  MdExpandMore,
  MdExpandLess,
  MdPerson,
  MdForum,
  MdPalette,
  MdFileDownload,
} from 'react-icons/md';
import {
  FaFire,
  FaShieldAlt,
  FaPaintRoller,
  FaNewspaper,
  FaCog,
  FaQuestion,
  FaSearch,
  FaFlipboard,
} from 'react-icons/fa';
import { IoIosStats } from 'react-icons/io';
import { Provider, useSelector, useDispatch } from './store/react-redux/index.js';
import store from './store/store.js';
import {
  openWindow, closeWindow, setWindowArgs,
} from './store/actions/windows.js';
import {
  selectCanvas, toggleOpenPalette,
} from './store/actions/index.js';
import { fetchStats, fetchProfile, notify } from './store/actions/thunks.js';
import WindowContext from './components/context/window.js';
import MenuContext from './components/context/menu.js';
import Style from './components/Style.jsx';
import Palette from './components/Palette.jsx';
import BrushButton from './components/buttons/BrushButton.jsx';
import { getBrushPixels } from './core/utils.js';
import {
  getActivePixelZones,
  recordActivePixels,
  registerZoneSnapshotProvider,
} from './ui/ActivePixelZones.js';
import FactionCoordination from './components/FactionCoordination.jsx';
import Statistics from './components/windows/Statistics.jsx';
import MyFactions from './components/windows/MyFactions.jsx';
import Faction from './components/windows/Faction.jsx';
import UserArea from './components/windows/UserArea.jsx';
import Templates from './components/windows/Templates.jsx';
import Settings from './components/windows/Settings.jsx';
import Fire from './components/windows/Fire.jsx';
import Help from './components/windows/Help.jsx';
import Modlog from './components/windows/Modlog.jsx';

class WindowErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidUpdate(prevProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    const { error } = this.state;
    if (error) {
      return (
        <div className="errormessage">
          <strong>Window failed to render:</strong> {error.message}
        </div>
      );
    }
    return this.props.children;
  }
}

const CanvasSelectWindow = () => {
  const dispatch = useDispatch();
  const canvasId = useSelector((state) => state.canvas.canvasId);
  const canvases = useSelector((state) => state.canvas.canvases);
  return (
    <div className="content">
      <h2>Canvas Selection</h2>
      {Object.entries(canvases).map(([id, info]) => (
        <div key={id} className="setitem">
          <div className="setrow">
            <h3 className="settitle">{info.title}</h3>
            <button
              type="button"
              disabled={Number(id) === Number(canvasId)}
              onClick={() => {
                dispatch(selectCanvas(Number(id)));
                dispatch(notify(`Switched to ${info.title}`));
              }}
            >
              {Number(id) === Number(canvasId) ? 'Active' : 'Select'}
            </button>
          </div>
          <div className="modaldesc">
            Canvas size: {info.size} × {info.size}
          </div>
        </div>
      ))}
    </div>
  );
};

const ChatWindow = () => {
  const userName = useSelector((state) => state.user.name);
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState([
    { id: 1, author: 'System', text: 'Welcome to PixelStates global chat.' },
  ]);

  const send = (e) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setMessages((prev) => [
      ...prev,
      { id: Date.now(), author: userName || 'Guest', text },
    ]);
    setDraft('');
  };

  return (
    <div className="content">
      <h2>Chat</h2>
      <div className="chatarea">
        {messages.map((m) => (
          <p key={m.id} className="chatmsg">
            <strong>{m.author}:</strong> {m.text}
          </p>
        ))}
      </div>
      <form className="chatinput" onSubmit={send}>
        <input
          type="text"
          value={draft}
          onInput={(e) => setDraft(e.currentTarget.value)}
          placeholder={userName ? 'Send a message...' : 'Log in via User Area to chat as your account'}
        />
        <button type="submit">Send</button>
      </form>
    </div>
  );
};

const SearchWindow = ({ onOpenFaction }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const params = new URLSearchParams({
      limit: '40',
      offset: '0',
      search: query.trim(),
      open: 'false',
    });
    fetch(`/api/factions/list?${params}`, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : { factions: [] }))
      .then((data) => {
        if (active) setResults(Array.isArray(data.factions) ? data.factions : []);
      })
      .catch(() => {
        if (active) setResults([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [query]);

  return (
    <div className="content">
      <h2>Search</h2>
      <input
        type="text"
        value={query}
        onInput={(e) => setQuery(e.currentTarget.value)}
        placeholder="Search factions, tags, or alliances..."
        style={{ width: '100%', marginBottom: 10 }}
      />
      {loading && <p className="modaldesc">Searching...</p>}
      {!loading && results.length === 0 && (
        <p className="modaldesc">No matching factions found.</p>
      )}
      {results.map((f) => (
        <div key={f.id || f.name} className="setitem">
          <div className="setrow">
            <span
              role="button"
              tabIndex={0}
              className="modallink"
              onClick={() => onOpenFaction(f.name)}
            >
              {f.tag ? `[${f.tag}] ` : ''}{f.title || f.name}
            </span>
            <span>
              {Number(f.totalPixels ?? f.pixels ?? 0).toLocaleString()} px
            </span>
          </div>
          {f.description && <div className="modaldesc">{f.description}</div>}
        </div>
      ))}
    </div>
  );
};

const PixelBackdrop = ({
  canvasRef,
  userName,
  onToggleChat,
}) => {
  const dispatch = useDispatch();
  const canvasId = useSelector((state) => state.canvas.canvasId);
  const userId = useSelector((state) => state.user.id);
  const showActiveZones = useSelector((state) => state.gui.showActiveZones);
  const paletteOpen = useSelector((state) => state.gui.paletteOpen);
  const showGrid = useSelector((state) => state.gui.showGrid);
  const isLightGrid = useSelector((state) => state.gui.isLightGrid);
  const brushSize = useSelector((state) => state.canvas.brushSize);
  const palette = useSelector((state) => state.canvas.palette);
  const selectedColor = useSelector((state) => state.canvas.selectedColor);
  const activeColor = palette.colors[selectedColor] || 'rgb(0, 131, 199)';
  const [coords, setCoords] = useState({ x: 0, y: 0 });
  const pixelsRef = useRef(new Map());

  const drawGrid = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const cell = 16;

    // PixelStates Earth canvas default ocean/land tone (#cae3ff)
    ctx.fillStyle = '#cae3ff';
    ctx.fillRect(0, 0, w, h);

    if (showGrid) {
      ctx.strokeStyle = isLightGrid
        ? 'rgba(255, 255, 255, 0.35)'
        : 'rgba(0, 0, 0, 0.06)';
      ctx.lineWidth = 1;
      for (let x = 0; x < w; x += cell) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = 0; y < h; y += cell) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
    }

    pixelsRef.current.forEach((color, key) => {
      const [gx, gy] = key.split(',').map(Number);
      ctx.fillStyle = color;
      ctx.fillRect(gx * cell, gy * cell, cell, cell);
    });

    if (showActiveZones) {
      const activeZones = getActivePixelZones(canvasId);
      activeZones.forEach((zone) => {
        const cx = (zone.x + 30) * cell;
        const cy = (zone.y + 20) * cell;
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, 18, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 113, 56, 0.22)';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#ff7138';
        ctx.stroke();

        const label = `${zone.users}u · ${zone.count}px`;
        ctx.font = 'bold 11px sans-serif';
        const textWidth = ctx.measureText(label).width;
        const pillW = textWidth + 12;
        const pillH = 18;
        ctx.fillStyle = 'rgba(24, 24, 24, 0.82)';
        ctx.fillRect(cx - pillW / 2, cy - 30, pillW, pillH);
        ctx.fillStyle = '#ff985a';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, cx, cy - 21);
        ctx.restore();
      });
    }
  }, [canvasRef, showGrid, isLightGrid, showActiveZones, canvasId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const seed = [
      [8, 6, '#ffffff'], [9, 6, '#ffffff'], [10, 6, '#ffffff'], [11, 6, '#e4e4e4'],
      [8, 7, '#ffffff'], [9, 7, '#0083c7'], [10, 7, '#0083c7'], [11, 7, '#ffffff'],
      [8, 8, '#e50000'], [9, 8, '#e50000'], [10, 8, '#e59500'], [11, 8, '#ffffff'],
      [7, 14, '#02be01'], [8, 14, '#02be01'], [9, 14, '#94e044'],
      [7, 15, '#e5d900'], [8, 15, '#02be01'], [9, 15, '#0083c7'],
    ];
    seed.forEach(([gx, gy, c]) => {
      if (!pixelsRef.current.has(`${gx},${gy}`)) {
        pixelsRef.current.set(`${gx},${gy}`, c);
      }
    });

    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      drawGrid();
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [canvasRef, drawGrid]);

  useEffect(() => registerZoneSnapshotProvider((_targetCanvasId, bounds) => {
    const outW = 300;
    const outH = 156;
    const offscreen = document.createElement('canvas');
    offscreen.width = outW;
    offscreen.height = outH;
    const ctx = offscreen.getContext('2d');
    if (!ctx) return null;

    const minGX = Math.floor(bounds.minX + 30);
    const maxGX = Math.ceil(bounds.maxX + 30);
    const minGY = Math.floor(bounds.minY + 20);
    const maxGY = Math.ceil(bounds.maxY + 20);
    const spanX = Math.max(6, maxGX - minGX + 1);
    const spanY = Math.max(4, maxGY - minGY + 1);
    const padX = Math.max(3, Math.ceil(spanX * 0.35));
    const padY = Math.max(2, Math.ceil(spanY * 0.35));
    const viewMinX = minGX - padX;
    const viewMinY = minGY - padY;
    const viewCols = spanX + padX * 2;
    const viewRows = spanY + padY * 2;

    const cellPx = Math.max(
      3,
      Math.floor(Math.min(outW / viewCols, outH / viewRows)),
    );
    const offsetX = Math.floor((outW - viewCols * cellPx) / 2);
    const offsetY = Math.floor((outH - viewRows * cellPx) / 2);

    ctx.fillStyle = '#cae3ff';
    ctx.fillRect(0, 0, outW, outH);

    if (showGrid && cellPx >= 5) {
      ctx.strokeStyle = isLightGrid
        ? 'rgba(255, 255, 255, 0.35)'
        : 'rgba(0, 0, 0, 0.08)';
      ctx.lineWidth = 1;
      for (let c = 0; c <= viewCols; c += 1) {
        const x = offsetX + c * cellPx;
        ctx.beginPath();
        ctx.moveTo(x, offsetY);
        ctx.lineTo(x, offsetY + viewRows * cellPx);
        ctx.stroke();
      }
      for (let r = 0; r <= viewRows; r += 1) {
        const y = offsetY + r * cellPx;
        ctx.beginPath();
        ctx.moveTo(offsetX, y);
        ctx.lineTo(offsetX + viewCols * cellPx, y);
        ctx.stroke();
      }
    }

    pixelsRef.current.forEach((color, key) => {
      const [gx, gy] = key.split(',').map(Number);
      if (
        gx >= viewMinX && gx < viewMinX + viewCols
        && gy >= viewMinY && gy < viewMinY + viewRows
      ) {
        ctx.fillStyle = color;
        ctx.fillRect(
          offsetX + (gx - viewMinX) * cellPx,
          offsetY + (gy - viewMinY) * cellPx,
          cellPx,
          cellPx,
        );
      }
    });

    // Crisp dashed frame showing exact active war zone bounds
    ctx.save();
    ctx.strokeStyle = '#ff7138';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 3]);
    ctx.strokeRect(
      offsetX + (minGX - viewMinX) * cellPx - 1,
      offsetY + (minGY - viewMinY) * cellPx - 1,
      (maxGX - minGX + 1) * cellPx + 2,
      (maxGY - minGY + 1) * cellPx + 2,
    );
    ctx.restore();

    return offscreen.toDataURL('image/png');
  }), [showGrid, isLightGrid]);

  const handleCanvasClick = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const gx = Math.floor((e.clientX - rect.left) / 16);
    const gy = Math.floor((e.clientY - rect.top) / 16);
    const cells = getBrushPixels(65536, gx, gy, brushSize);
    const actorKey = userId ? `u:${userId}` : (userName || 'guest');
    const worldPoints = [];
    cells.forEach(([px, py]) => {
      pixelsRef.current.set(`${px},${py}`, activeColor);
      worldPoints.push([px - 30, py - 20]);
    });
    recordActivePixels(canvasId, worldPoints, actorKey);
    drawGrid();
  };

  const handleCanvasMove = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const gx = Math.floor((e.clientX - rect.left) / 16);
    const gy = Math.floor((e.clientY - rect.top) / 16);
    setCoords({ x: gx - 30, y: gy - 20 });
  };

  return (
    <>
      <canvas
        ref={canvasRef}
        className="ps-canvas-backdrop"
        onClick={handleCanvasClick}
        onMouseMove={handleCanvasMove}
      />

      {/* Native PixelStates Faction & Union Coordination Layer */}
      <FactionCoordination />

      {/* Authentic PixelStates bottom-left .onlinebox and .coorbox */}
      <div className="onlinebox" title="Online players">
        <span>142 <MdPerson /></span>
        {userName && (
          <>
            &nbsp;&nbsp;
            <span>{userName}</span>
          </>
        )}
      </div>
      <div className="coorbox" aria-label="Canvas coordinates">
        ({coords.x}, {coords.y})
      </div>

      {/* Authentic PixelStates bottom-right #brushbutton, #chatbutton, #palselbutton & #palettebox */}
      <BrushButton />

      <div
        id="chatbutton"
        className="actionbuttons"
        role="button"
        tabIndex={0}
        title="Open Chat"
        aria-label="Open Chat"
        onClick={onToggleChat}
      >
        <MdForum />
      </div>

      <div
        id="palselbutton"
        className={`actionbuttons${paletteOpen ? ' pressed' : ''}`}
        style={{
          color: palette.isDark(selectedColor) ? 'white' : 'black',
          backgroundColor: activeColor,
        }}
        role="button"
        tabIndex={0}
        title={paletteOpen ? 'Close Palette' : 'Open Palette'}
        aria-label={paletteOpen ? 'Close Palette' : 'Open Palette'}
        onClick={() => dispatch(toggleOpenPalette())}
      >
        <MdPalette />
      </div>

      {/* Authentic PixelStates vertical Palette component */}
      <Palette />
    </>
  );
};

const PreviewShell = () => {
  const dispatch = useDispatch();
  const canvasRef = useRef(null);
  const notification = useSelector((state) => state.gui.notification);
  const activeWindow = useSelector((state) => state.windows.activeWindow);
  const activeArgs = useSelector((state) => state.windows.activeArgs);
  const activeTitle = useSelector((state) => state.windows.activeTitle);
  const userName = useSelector((state) => state.user.name);
  const templatesAvailable = useSelector((state) => state.templates.available);
  const [windowOpen, setWindowOpen] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [windowTitle, setWindowTitle] = useState('');
  const [windowData, setWindowData] = useState(null);
  const [viewport, setViewport] = useState({
    w: typeof window !== 'undefined' ? window.innerWidth : 1280,
    h: typeof window !== 'undefined' ? window.innerHeight : 760,
  });

  useEffect(() => {
    const onResize = () => {
      setViewport({ w: window.innerWidth, h: window.innerHeight });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    dispatch(fetchStats());
    dispatch(fetchProfile());
  }, [dispatch]);

  const menuContextValue = useMemo(() => ({
    openMenuId: menuOpen ? 'mm' : null,
    openMenu: () => setMenuOpen((prev) => !prev),
  }), [menuOpen]);

  const windowContextValue = useMemo(() => ({
    args: activeArgs || {},
    params: {},
    data: windowData,
    setData: setWindowData,
    setArgs: (nextArgs) => {
      dispatch(setWindowArgs(nextArgs || {}));
    },
    setTitle: setWindowTitle,
    changeType: (nextType, nextTitle, nextArgs) => {
      dispatch(openWindow(
        String(nextType || 'STATISTICS').toUpperCase(),
        true,
        nextTitle || '',
        nextArgs || {},
      ));
      setWindowOpen(true);
    },
    close: () => {
      dispatch(closeWindow());
      setWindowOpen(false);
    },
  }), [activeArgs, windowData, dispatch]);

  const switchWindow = (type, defaultArgs = {}) => {
    setWindowData(null);
    setWindowTitle('');
    setMenuOpen(false);
    dispatch(openWindow(type, true, '', defaultArgs));
    setWindowOpen(true);
  };

  const handleScreenshot = () => {
    setMenuOpen(false);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = 'pixelstates.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
    dispatch(notify('Screenshot saved.'));
  };

  let resolvedTitle = windowTitle || activeTitle;
  if (!resolvedTitle) {
    if (activeWindow === 'STATISTICS') resolvedTitle = 'Statistics';
    else if (activeWindow === 'FACTIONS') resolvedTitle = activeArgs?.page === 'news' ? 'Diplomatic News' : 'Factions';
    else if (activeWindow === 'FACTION') resolvedTitle = 'Faction Details';
    else if (activeWindow === 'USERAREA') resolvedTitle = userName ? 'User Area' : 'Log in';
    else if (activeWindow === 'TEMPLATES') resolvedTitle = 'Templates';
    else if (activeWindow === 'SETTINGS') resolvedTitle = 'Settings';
    else if (activeWindow === 'FIRE') resolvedTitle = 'Fire';
    else if (activeWindow === 'CHAT') resolvedTitle = 'Chat';
    else if (activeWindow === 'CANVAS_SELECTION') resolvedTitle = 'Canvas Selection';
    else if (activeWindow === 'SEARCH') resolvedTitle = 'Search';
    else if (activeWindow === 'HELP') resolvedTitle = 'Help';
    else if (activeWindow === 'MODLOG') resolvedTitle = 'Moderation Log';
    else resolvedTitle = 'PixelStates';
  }

  const winWidth = Math.min(920, Math.max(320, viewport.w - 136));
  const winHeight = Math.min(680, Math.max(360, viewport.h - 116));
  const winLeft = Math.max(66, Math.round((viewport.w - winWidth) / 2));
  const winTop = Math.max(56, Math.round((viewport.h - winHeight) / 2));

  return (
    <MenuContext.Provider value={menuContextValue}>
      {/* Authentic PixelStates dynamic theme stylesheet controlled by Settings -> Themes */}
      <Style />

      <PixelBackdrop
        canvasRef={canvasRef}
        userName={userName}
        onToggleChat={() => {
          if (windowOpen && activeWindow === 'CHAT') {
            setWindowOpen(false);
          } else {
            switchWindow('CHAT');
          }
        }}
      />

      {/* Authentic PixelStates Top-Left #menubutton with unmodified MdExpandMore / MdExpandLess SVG */}
      <div
        id="menubutton"
        className={`actionbuttons${menuOpen ? ' pressed' : ''}`}
        role="button"
        tabIndex={0}
        title="Menu"
        aria-label="Menu"
        onClick={() => setMenuOpen((prev) => !prev)}
      >
        {menuOpen ? <MdExpandLess /> : <MdExpandMore />}
      </div>

      {/* Authentic PixelStates .quickaccess-buttons vertical stack + Diplomatic News button */}
      <div className="quickaccess-buttons">
        <button
          type="button"
          id="quickuserarea"
          className={`actionbuttons quickaccess-button${windowOpen && activeWindow === 'USERAREA' ? ' pressed' : ''}`}
          title={userName ? 'User Area' : 'Log in'}
          aria-label={userName ? 'User Area' : 'Log in'}
          onClick={() => switchWindow('USERAREA')}
        >
          <MdPerson />
        </button>

        <button
          type="button"
          id="quickfactions"
          className={`actionbuttons quickaccess-button${windowOpen && (activeWindow === 'FACTIONS' || activeWindow === 'FACTION') && activeArgs?.page !== 'news' ? ' pressed' : ''}`}
          title="Factions"
          aria-label="Factions"
          onClick={() => switchWindow('FACTIONS', { page: 'list' })}
        >
          <FaShieldAlt />
        </button>

        <button
          type="button"
          id="quicknews"
          className={`actionbuttons quickaccess-button${windowOpen && activeWindow === 'FACTIONS' && activeArgs?.page === 'news' ? ' pressed' : ''}`}
          title="Diplomatic News"
          aria-label="Diplomatic News"
          onClick={() => switchWindow('FACTIONS', { page: 'news' })}
        >
          <FaNewspaper />
        </button>

        {templatesAvailable && (
          <button
            type="button"
            id="quicktemplates"
            className={`actionbuttons quickaccess-button${windowOpen && activeWindow === 'TEMPLATES' ? ' pressed' : ''}`}
            title="Templates"
            aria-label="Templates"
            onClick={() => switchWindow('TEMPLATES')}
          >
            <FaPaintRoller />
          </button>
        )}

        <button
          type="button"
          id="quickfire"
          className={`actionbuttons quickaccess-button${windowOpen && activeWindow === 'FIRE' ? ' pressed' : ''}`}
          title="Fire"
          aria-label="Fire"
          onClick={() => switchWindow('FIRE')}
        >
          <FaFire />
        </button>
      </div>

      {/* Authentic PixelStates .menu.MAIN dropdown matching src/components/menus/mainMenu.js */}
      {menuOpen && (
        <div className="menu MAIN show" style={{ left: 16, top: 58, zIndex: 30 }} role="menu">
          <div
            className="menuelement"
            role="menuitem"
            tabIndex={0}
            onClick={() => switchWindow('CANVAS_SELECTION')}
          >
            <FaFlipboard /> Canvas Selection
          </div>
          <div
            className="menuelement"
            role="menuitem"
            tabIndex={0}
            onClick={handleScreenshot}
          >
            <MdFileDownload /> Make Screenshot
          </div>
          <div className="menuspacer" />
          <div
            className="menuelement"
            role="menuitem"
            tabIndex={0}
            onClick={() => switchWindow('SEARCH')}
          >
            <FaSearch /> Search
          </div>
          <div
            className="menuelement"
            role="menuitem"
            tabIndex={0}
            onClick={() => switchWindow('STATISTICS', { activeTab: 'factionsTotal' })}
          >
            <IoIosStats /> Statistics
          </div>
          <div className="menuspacer" />
          <div
            className="menuelement"
            role="menuitem"
            tabIndex={0}
            onClick={() => switchWindow('SETTINGS')}
          >
            <FaCog /> Settings
          </div>
          <div
            className="menuelement"
            role="menuitem"
            tabIndex={0}
            onClick={() => switchWindow('HELP')}
          >
            <FaQuestion /> Help
          </div>
        </div>
      )}

      {notification && (
        <div className="notifybox show" role="status">
          {notification}
        </div>
      )}

      {/* Authentic PixelStates .window chrome styled natively by default.css + active theme-*.css */}
      {windowOpen && (
        <div
          className={`window ${activeWindow} show`}
          style={{
            left: winLeft,
            top: winTop,
            width: winWidth,
            height: winHeight,
            zIndex: 10,
          }}
        >
          <div className="win-topbar">
            <span className="win-title">{resolvedTitle}</span>
            {activeWindow === 'FACTION' && (
              <span
                className="win-topbtn"
                role="button"
                tabIndex={0}
                onClick={() => switchWindow('FACTIONS', { page: 'directory' })}
                title="Back to Factions List"
              >
                ←
              </span>
            )}
            <span
              className="win-topbtn close"
              role="button"
              tabIndex={0}
              onClick={() => setWindowOpen(false)}
              aria-label="Close window"
              title="Close"
            >
              X
            </span>
          </div>

          <div className="win-content">
            <div className="content">
              <WindowContext.Provider value={windowContextValue}>
                <WindowErrorBoundary resetKey={`${activeWindow}:${JSON.stringify(activeArgs || {})}`}>
                  {activeWindow === 'USERAREA' && <UserArea />}
                  {activeWindow === 'TEMPLATES' && <Templates />}
                  {activeWindow === 'SETTINGS' && <Settings />}
                  {activeWindow === 'STATISTICS' && <Statistics />}
                  {activeWindow === 'FACTIONS' && <MyFactions />}
                  {activeWindow === 'FACTION' && <Faction />}
                  {activeWindow === 'FIRE' && <Fire />}
                  {activeWindow === 'CHAT' && <ChatWindow />}
                  {activeWindow === 'CANVAS_SELECTION' && <CanvasSelectWindow />}
                  {activeWindow === 'SEARCH' && (
                    <SearchWindow
                      onOpenFaction={(name) => switchWindow('FACTION', { name })}
                    />
                  )}
                  {activeWindow === 'HELP' && <Help />}
                  {activeWindow === 'MODLOG' && <Modlog />}
                </WindowErrorBoundary>
              </WindowContext.Provider>
            </div>
          </div>
        </div>
      )}
    </MenuContext.Provider>
  );
};

const rootEl = document.getElementById('app');
if (rootEl) {
  render(
    <Provider store={store}>
      <PreviewShell />
    </Provider>,
    rootEl,
  );
}
