/*
 * Redux store configured for PixelStates native HUD, Settings, Templates, UserArea, and Diplomacy
 */

import {
  legacy_createStore as createStore,
  applyMiddleware,
  combineReducers,
} from 'redux';
import { thunk } from 'redux-thunk';
import {
  SET_STATS,
  SET_PROFILE,
  SET_DARK_MODE,
  SET_NOTIFICATION,
  OPEN_WINDOW,
  CLOSE_WINDOW,
  SET_WINDOW_ARGS,
  TOGGLE_OV_ENABLED,
  TOGGLE_SMALL_PXLS,
  SET_OV_OPACITY,
  ADD_TEMPLATE,
  CHANGE_TEMPLATE,
  DELETE_TEMPLATE,
  SET_TEMPLATES,
  APPLY_PATCHES,
  SELECT_STYLE,
  TOGGLE_GRID,
  TOGGLE_PIXEL_NOTIFY,
  TOGGLE_ACTIVE_ZONES,
  TOGGLE_BRUSH_ANIMATION,
  TOGGLE_MVM_CTRLS,
  TOGGLE_MUTE,
  TOGGLE_AUTO_ZOOM_IN,
  TOGGLE_COMPACT_PALETTE,
  TOGGLE_CHAT_NOTIFY,
  TOGGLE_CURSOR,
  TOGGLE_POTATO_MODE,
  TOGGLE_LIGHT_GRID,
  TOGGLE_HISTORICAL_VIEW,
  TOGGLE_OPEN_PALETTE,
  TOGGLE_EASTER_EGG,
  SET_AUDIO_VOLUME,
  SET_SOUND_VOLUME,
  SET_KEY_BINDING,
  SELECT_PENCIL_MODE,
  SELECT_CANVAS,
  SET_VIEW_COORDINATES,
  CYCLE_BRUSH_SIZE,
  SELECT_COLOR,
  LOGIN_USER,
  LOGOUT_USER,
  SET_HAVE_PASSWORD,
  SET_USER_NAME,
} from './actions/index.js';
import Palette from '../core/Palette.js';
import canvasesJson from '../core/canvases.json';
import { getVipBrushSizes } from '../core/vip.js';

const earthCanvas = canvasesJson['0'];
const earthPalette = new Palette(earthCanvas.colors);

const initialRanksState = {
  lastFetch: 0,
  totalPixels: 68290,
  dailyTotalPixels: 1840,
  ranking: 14,
  dailyRanking: 6,
  totalRanking: null,
  totalDailyRanking: null,
  factionRanking: null,
  dailyFactionRanking: null,
  dailyCRanking: [],
  prevTop: null,
  onlineStats: [],
  cHistStats: [],
  cHourlyStats: [],
  histStats: { users: [], stats: [] },
  pDailyStats: [],
  pHourlyStats: [],
  cooldownChanges: [],
};

function ranksReducer(state = initialRanksState, action) {
  switch (action.type) {
    case SET_STATS: {
      const s = action.stats || {};
      const cdObj = s.cooldownChanges || {};
      const cooldownChanges = Array.isArray(cdObj)
        ? cdObj
        : Object.entries(cdObj);
      return {
        ...state,
        lastFetch: Date.now(),
        totalRanking: s.ranking || state.totalRanking,
        totalDailyRanking: s.dailyRanking || state.totalDailyRanking,
        factionRanking: s.factionRanking || state.factionRanking,
        dailyFactionRanking: s.dailyFactionRanking || state.dailyFactionRanking,
        dailyCRanking: s.dailyCRanking || state.dailyCRanking,
        prevTop: s.prevTop || state.prevTop,
        onlineStats: s.onlineStats || state.onlineStats,
        cHistStats: s.cHistStats || state.cHistStats,
        cHourlyStats: Array.isArray(s.cHourlyStats)
          ? Object.fromEntries(s.cHourlyStats.map((e) => [e.cc, e.px || 0]))
          : (s.cHourlyStats || state.cHourlyStats),
        histStats: s.histStats || state.histStats,
        pDailyStats: s.pDailyStats || state.pDailyStats,
        pHourlyStats: s.pHourlyStats || state.pHourlyStats,
        cooldownChanges,
      };
    }
    default:
      return state;
  }
}

const initialUserState = {
  id: 101,
  name: 'CommanderVex',
  userlvl: 1,
  country: 'us',
  havePassword: true,
  vipTier: 0,
  discordLinked: false,
  messages: [],
  totalPixels: 48290,
  dailyTotalPixels: 1840,
};

function userReducer(state = initialUserState, action) {
  switch (action.type) {
    case SET_PROFILE:
      if (action.profile && action.profile.user) {
        return { ...state, ...action.profile.user };
      }
      return state;
    case LOGIN_USER:
      return {
        ...state,
        ...(action.me || {}),
      };
    case LOGOUT_USER:
      return {
        ...state,
        id: null,
        name: null,
        userlvl: 0,
      };
    case SET_HAVE_PASSWORD:
      return { ...state, havePassword: action.havePassword };
    case SET_USER_NAME:
      return { ...state, name: action.name };
    default:
      return state;
  }
}

const initialProfileState = {
  fetched: false,
  factions: [],
  invites: [],
  activeFaction: null,
  badges: [],
  avatarId: null,
  flag: 'us',
  flagLegit: true,
  bannerId: null,
  bannerPreset: null,
  nicknameColor: null,
  avatarGlow: null,
  nicknameGradient: null,
  blocked: [],
};

function profileReducer(state = initialProfileState, action) {
  switch (action.type) {
    case SET_PROFILE:
      return {
        ...state,
        ...(action.profile || {}),
        fetched: true,
      };
    case APPLY_PATCHES: {
      const next = { ...state };
      (action.patches || []).forEach((patch) => {
        if (patch && patch.path === '/profile/factions' && Array.isArray(patch.value)) {
          next.factions = patch.value;
        }
      });
      return next;
    }
    default:
      return state;
  }
}

const initialGuiState = {
  style: 'default',
  isDarkMode: false,
  notification: null,
  paletteOpen: true,
  showGrid: true,
  showPixelNotify: true,
  showActiveZones: true,
  animateBrush: true,
  showMvmCtrls: false,
  autoZoomIn: false,
  compactPalette: false,
  isPotato: false,
  isLightGrid: false,
  mute: false,
  chatNotify: true,
  cursor: true,
  easterEgg: false,
  audioVolume: 100,
  soundVolumes: {},
  keyBindings: {},
};

function guiReducer(state = initialGuiState, action) {
  switch (action.type) {
    case SELECT_STYLE: {
      const style = action.style || 'default';
      return {
        ...state,
        style,
        isDarkMode: style.includes('dark') || style === 'arkeros',
      };
    }
    case SET_DARK_MODE:
      return { ...state, isDarkMode: action.isDarkMode };
    case SET_NOTIFICATION:
      return { ...state, notification: action.message };
    case TOGGLE_GRID:
      return { ...state, showGrid: !state.showGrid };
    case TOGGLE_PIXEL_NOTIFY:
      return { ...state, showPixelNotify: !state.showPixelNotify };
    case TOGGLE_ACTIVE_ZONES:
      return { ...state, showActiveZones: !state.showActiveZones };
    case TOGGLE_BRUSH_ANIMATION:
      return { ...state, animateBrush: !state.animateBrush };
    case TOGGLE_MVM_CTRLS:
      return { ...state, showMvmCtrls: !state.showMvmCtrls };
    case TOGGLE_MUTE:
      return { ...state, mute: !state.mute };
    case TOGGLE_AUTO_ZOOM_IN:
      return { ...state, autoZoomIn: !state.autoZoomIn };
    case TOGGLE_COMPACT_PALETTE:
      return { ...state, compactPalette: !state.compactPalette };
    case TOGGLE_CHAT_NOTIFY:
      return { ...state, chatNotify: !state.chatNotify };
    case TOGGLE_CURSOR:
      return { ...state, cursor: !state.cursor };
    case TOGGLE_POTATO_MODE:
      return { ...state, isPotato: !state.isPotato };
    case TOGGLE_LIGHT_GRID:
      return { ...state, isLightGrid: !state.isLightGrid };
    case TOGGLE_OPEN_PALETTE:
      return { ...state, paletteOpen: !state.paletteOpen };
    case TOGGLE_EASTER_EGG:
      return { ...state, easterEgg: !state.easterEgg };
    case SET_AUDIO_VOLUME:
      return { ...state, audioVolume: action.volume };
    case SET_SOUND_VOLUME:
      return {
        ...state,
        soundVolumes: {
          ...state.soundVolumes,
          [action.sound]: action.volume,
        },
      };
    case SET_KEY_BINDING:
      return {
        ...state,
        keyBindings: {
          ...state.keyBindings,
          [action.binding]: action.code,
        },
      };
    default:
      return state;
  }
}

const initialCanvasState = {
  canvasId: 0,
  canvasIdent: 'd',
  canvasSize: 65536,
  rendererType: 1,
  isHistoricalView: false,
  view: [0, 0, 1],
  brushSize: 1,
  pencilMode: 0,
  palette: earthPalette,
  clrIgnore: earthCanvas.cli || 1,
  selectedColor: 26,
  canvases: {
    0: {
      title: 'Earth',
      ident: 'd',
      size: 65536,
      colors: earthCanvas.colors,
      cli: earthCanvas.cli || 1,
    },
    1: {
      title: 'Moon',
      ident: 'm',
      size: 4096,
      colors: canvasesJson['1']?.colors || earthCanvas.colors,
      cli: canvasesJson['1']?.cli || 0,
    },
  },
};

function canvasReducer(state = initialCanvasState, action) {
  switch (action.type) {
    case TOGGLE_HISTORICAL_VIEW:
      return { ...state, isHistoricalView: !state.isHistoricalView };
    case SELECT_PENCIL_MODE:
      return { ...state, pencilMode: action.pencilMode };
    case SELECT_CANVAS:
      return { ...state, canvasId: action.canvasId };
    case SELECT_COLOR:
      return { ...state, selectedColor: action.color };
    case SET_VIEW_COORDINATES:
      if (Array.isArray(action.coords) && action.coords.length >= 2) {
        return {
          ...state,
          view: [action.coords[0], action.coords[1], state.view[2] || 1],
        };
      }
      return state;
    case CYCLE_BRUSH_SIZE: {
      const sizes = getVipBrushSizes(action.vipTier);
      const idx = sizes.indexOf(state.brushSize);
      return {
        ...state,
        brushSize: sizes[(idx + 1) % sizes.length] || 1,
      };
    }
    default:
      return state;
  }
}

const initialWindowsState = {
  activeWindow: 'STATISTICS',
  activeArgs: { activeTab: 'factionsTotal' },
  activeTitle: '',
};

function windowsReducer(state = initialWindowsState, action) {
  switch (action.type) {
    case OPEN_WINDOW:
      return {
        activeWindow: action.windowType || 'STATISTICS',
        activeArgs: (action.args && typeof action.args === 'object')
          ? action.args
          : {},
        activeTitle: action.title || '',
      };
    case SET_WINDOW_ARGS:
      return {
        ...state,
        activeArgs: {
          ...(state.activeArgs || {}),
          ...(action.args && typeof action.args === 'object' ? action.args : {}),
        },
      };
    case CLOSE_WINDOW:
      return {
        activeWindow: 'STATISTICS',
        activeArgs: { activeTab: 'factionsTotal' },
        activeTitle: '',
      };
    default:
      return state;
  }
}

const initialTemplatesState = {
  available: true,
  ovEnabled: false,
  oSmallPxls: false,
  oOpacity: 75,
  list: [],
};

function templatesReducer(state = initialTemplatesState, action) {
  switch (action.type) {
    case TOGGLE_OV_ENABLED:
      return {
        ...state,
        ovEnabled: action.enabled !== undefined
          ? Boolean(action.enabled)
          : !state.ovEnabled,
      };
    case TOGGLE_SMALL_PXLS:
      return {
        ...state,
        oSmallPxls: !state.oSmallPxls,
      };
    case SET_OV_OPACITY:
      return {
        ...state,
        oOpacity: action.opacity,
      };
    case ADD_TEMPLATE:
      return {
        ...state,
        list: [...state.list, action.template],
      };
    case CHANGE_TEMPLATE:
      return {
        ...state,
        list: state.list.map((item) => (
          item.title === action.title
            ? { ...item, ...(action.updates || {}) }
            : item
        )),
      };
    case DELETE_TEMPLATE:
      return {
        ...state,
        list: state.list.filter((item) => item.title !== action.title),
      };
    case SET_TEMPLATES:
      return {
        ...state,
        list: action.list,
      };
    default:
      return state;
  }
}

const rootReducer = combineReducers({
  ranks: ranksReducer,
  user: userReducer,
  profile: profileReducer,
  gui: guiReducer,
  canvas: canvasReducer,
  windows: windowsReducer,
  templates: templatesReducer,
});

const store = createStore(rootReducer, applyMiddleware(thunk));

export default store;
