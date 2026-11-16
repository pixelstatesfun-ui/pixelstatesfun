import Palette from '../../core/Palette.js';
import {
  getIdFromObject,
  getHistoricalCanvasSize,
  getMaxTiledZoom,
  getToday,
  dateToString,
  isIntervalActive,
} from '../../core/utils.js';
import {
  DEFAULT_SCALE,
  DEFAULT_CANVAS_ID,
  PENCIL_MODE,
  CANVAS_TYPES,
} from '../../core/constants.js';
import { getVipBrushSizes } from '../../core/vip.js';

/**
 * checks if toggling historical view is neccessary
 * in given state or if properties have to change.
 * Changes the state inplace.
 * @param state
 * @return same state with fixed historical view
 */
function fixHistoryIfNeccessary(state) {
  const { canvasEndDate, rendererType } = state;
  let { isHistoricalView, historicalDate } = state;

  if (rendererType !== CANVAS_TYPES.TWOD) {
    isHistoricalView = false;
  } else if (canvasEndDate) {
    isHistoricalView = true;
  }
  state.isHistoricalView = isHistoricalView;
  if (isHistoricalView) {
    if (!historicalDate) {
      historicalDate = dateToString(getToday());
    }
    if (canvasEndDate && Number(historicalDate) > Number(canvasEndDate)) {
      historicalDate = dateToString(canvasEndDate);
    }
    state.historicalDate = historicalDate;
    if (!state.historicalTime) {
      state.historicalTime = '0000';
    }
    const {
      canvasId,
      canvasSize,
      canvases,
    } = state;
    state.historicalCanvasSize = getHistoricalCanvasSize(
      historicalDate,
      canvasSize,
      canvases[canvasId]?.historicalSizes,
    );
  }
  return state;
}

/**
 * set renderer type
 * @param state
 * @return new state with rendererType set correctly
 */
function setRendererTypeIfNeccessary(state) {
  const canvas = state.canvases[state.canvasId];
  if (!canvas || (
    state.replacementMessage && isIntervalActive(state.replacementInterval))
  ) {
    state.replacementActive = true;
    state.rendererType = CANVAS_TYPES.DUMMY;
  } else {
    state.replacementActive = false;
    state.rendererType = canvas.v ? CANVAS_TYPES.THREED : CANVAS_TYPES.TWOD;
  }
  return state;
}


/**
 * parse canvas data
 * @param canvas object from api/me
 * @param thisPreviousCanvasState from state
 * @return partial canvas specific state
 */
function getCanvasArgs(canvas, thisPreviousCanvasState) {
  const clrIgnore = canvas.cli || 0;
  const {
    size: canvasSize,
    sd: canvasStartDate = null,
    ed: canvasEndDate = null,
    ident: canvasIdent,
    colors,
  } = canvas;

  const palette = new Palette(colors, 0);
  return {
    clrIgnore,
    canvasSize,
    canvasStartDate,
    canvasEndDate,
    canvasIdent,
    palette,
    view: thisPreviousCanvasState?.view || [0, 0, DEFAULT_SCALE],
    selectedColor: thisPreviousCanvasState?.selectedColor || clrIgnore,
    pencilMode: thisPreviousCanvasState?.pencilMode || PENCIL_MODE.COLOR,
  };
}

/**
 * parse url hash and sets view to coordinates
 * @param canvases Object with all canvas information
 * @return incomplete state based on URL, null if failed
 */
function getViewFromURL(canvases, defaultCanvas) {
  const { hash } = window.location;
  const almost = decodeURIComponent(hash).substring(1)
    .split(',');

  let canvasIdent = almost[0];
  let canvasId = getIdFromObject(canvases, canvasIdent);
  if (!canvasId && defaultCanvas) {
    canvasId = defaultCanvas;
  }
  if (!canvasId || (!window.ssv?.backupurl && canvases[canvasId].ed)) {
    canvasId = DEFAULT_CANVAS_ID;
    const canvas = canvases[DEFAULT_CANVAS_ID];
    if (!canvas) {
      return null;
    }
    canvasIdent = canvas.ident;
  }
  const is3D = !!canvases[canvasId].v;

  const x = parseInt(almost[1], 10) || 0;
  const y = parseInt(almost[2], 10) || 0;
  let z = parseInt(almost[3], 10);
  /*
    * third number in 3D is z coordinate
    * in 2D it is logarithmic scale
    */
  if (Number.isNaN(z)) {
    z = (is3D) ? 0 : DEFAULT_SCALE;
  } else if (!is3D) {
    z = 2 ** (z / 10);
  }

  return {
    canvasId,
    canvasIdent,
    view: [x, y, z],
  };
}

const initialState = {
  // canvasId will be a string or null, it can not be a number,
  // because of Object.keys in canvases
  canvasId: null,
  canvasIdent: 'xx',
  canvases: {},
  canvasSize: 65536,
  historicalCanvasSize: 65536,
  rendererType: 'DUMMY',
  canvasStartDate: null,
  defaultCanvas: DEFAULT_CANVAS_ID,
  canvasEndDate: null,
  canvasMaxTiledZoom: getMaxTiledZoom(65536),
  palette: new Palette([[0, 0, 0]]),
  clrIgnore: 0,
  selectedColor: 0,
  /*
   * replacementMessage replaces the canvas, for a school block or similar,
   * String | null
   */
  replacementMessage: null,
  /*
   * interval when the replacementMessage is displayed
   * string HHmm-HHmm | null
   */
  replacementInterval: null,
  /*
   * wheter or not we are currecntly withint eh interval
   */
  replacementActive: false,
  /*
   * whether or not we are currenctly requesting pixels
   */
  fetchingPixel: false,
  // from where the pencil takes its color from
  pencilMode: PENCIL_MODE.COLOR,
  brushSize: 1,
  // view is not up-to-date, changes are delayed compared to renderer.view
  view: [0, 0, DEFAULT_SCALE],
  isHistoricalView: false,
  historicalDate: dateToString(getToday()),
  historicalTime: '0000',
  hover: null,
  // last canvas view and selectedColor
  // just used to get back to the previous state when switching canvases
  // { [canvasId]: { view: [x, y, z], selectedColor: c }, ... }
  prevCanvasState: {},
};

function applyCanvasCooldownMap(state, canvasCooldowns) {
  const updatedCanvases = { ...state.canvases };
  for (const [id, cooldowns] of Object.entries(canvasCooldowns)) {
    const canvas = state.canvases[id];
    if (!canvas) {
      continue;
    }
    updatedCanvases[id] = {
      ...canvas,
      ...(cooldowns.bcd !== null && cooldowns.bcd !== undefined
        ? { bcd: cooldowns.bcd } : {}),
      ...(Object.prototype.hasOwnProperty.call(cooldowns, 'pcd')
        ? { pcd: cooldowns.pcd } : {}),
      ...(Object.prototype.hasOwnProperty.call(cooldowns, 'cds')
        ? { cds: cooldowns.cds } : {}),
      ...(cooldowns.cooldownsByVipTier
        ? { cooldownsByVipTier: cooldowns.cooldownsByVipTier } : {}),
    };
  }
  const currentCanvas = updatedCanvases[state.canvasId];
  return {
    ...state,
    canvases: updatedCanvases,
    ...(currentCanvas ? {
      bcd: currentCanvas.bcd,
      pcd: currentCanvas.pcd,
    } : {}),
  };
}

export default function canvasReducer(
  state = initialState,
  action,
) {
  switch (action.type) {
    case 'SET_HISTORICAL_TIME': {
      const {
        date,
        time,
      } = action;
      return fixHistoryIfNeccessary({
        ...state,
        historicalDate: date,
        historicalTime: time,
      });
    }

    case 's/TGL_HISTORICAL_VIEW': {
      if (state.rendererType !== CANVAS_TYPES.TWOD || state.canvasEndDate) {
        return state;
      }
      return fixHistoryIfNeccessary({
        ...state,
        isHistoricalView: !state.isHistoricalView,
      });
    }

    case 'UPDATE_VIEW': {
      const { view } = action;
      const { canvasId } = state;
      return {
        ...state,
        view: [...view],
        prevCanvasState: {
          ...state.prevCanvasState,
          [canvasId]: {
            ...state.prevCanvasState[canvasId],
            view: [...view],
          },
        },
      };
    }

    case 'RELOAD_URL': {
      const { canvases } = state;
      const urlState = getViewFromURL(canvases);
      if (!urlState) {
        return state;
      }
      if (urlState.canvasId !== state.canvasId) {
        const { canvasId } = urlState;
        const canvas = canvases[canvasId];
        const canvasState = getCanvasArgs(
          canvas, state.prevCanvasState[canvasId],
        );
        return setRendererTypeIfNeccessary({
          ...state,
          ...canvasState,
          ...urlState,
        });
      }
      return {
        ...state,
        ...urlState,
      };
    }

    case 'SELECT_COLOR': {
      const { color: selectedColor } = action;
      const { canvasId } = state;
      return {
        ...state,
        selectedColor,
        prevCanvasState: {
          ...state.prevCanvasState,
          [canvasId]: {
            ...state.prevCanvasState[canvasId],
            selectedColor,
          },
        },
      };
    }

    case 'SET_HOVER': {
      const { hover } = action;
      return {
        ...state,
        hover,
      };
    }

    case 'UNSET_HOVER': {
      return {
        ...state,
        hover: null,
      };
    }

    case 'SET_PXLS_FETCHING': {
      const { fetching: fetchingPixel } = action;
      return {
        ...state,
        fetchingPixel,
      };
    }

    case 's/SELECT_PENCIL_MODE': {
      const pencilMode = action.value;
      const { canvasId } = state;
      return {
        ...state,
        pencilMode,
        prevCanvasState: {
          ...state.prevCanvasState,
          [canvasId]: {
            ...state.prevCanvasState[canvasId],
            pencilMode,
          },
        },
      };
    }

    case 's/CYCLE_BRUSH_SIZE': {
      const brushSizes = getVipBrushSizes(action.vipTier);
      const brushIndex = brushSizes.indexOf(state.brushSize);
      const nextBrushSize = brushSizes[brushIndex >= 0
        ? (brushIndex + 1) % brushSizes.length
        : 0];
      return {
        ...state,
        brushSize: nextBrushSize,
      };
    }

    case 's/SELECT_CANVAS': {
      let { canvasId } = action;
      const {
        canvases,
        prevCanvasState,
        canvasId: prevCanvasId,
      } = state;
      let canvas = canvases[canvasId];
      if (!canvas) {
        canvasId = DEFAULT_CANVAS_ID;
        canvas = canvases[DEFAULT_CANVAS_ID];
      }
      const canvasState = getCanvasArgs(canvas, prevCanvasState[canvasId]);

      return setRendererTypeIfNeccessary(fixHistoryIfNeccessary({
        ...state,
        ...canvasState,
        canvasId,
        // reset if last canvas was retired
        isHistoricalView: (!state.canvasEndDate && state.isHistoricalView),
        // remember canvas specific settings
        prevCanvasState: {
          ...state.prevCanvasState,
          [prevCanvasId]: {
            view: state.view,
            selectedColor: state.selectedColor,
            pencilMode: state.pencilMode,
          },
        },
      }));
    }


    case 's/REC_ME':
    case 's/LOGIN': {
      const stateWithCooldowns = action.canvasCooldowns
        ? applyCanvasCooldownMap(state, action.canvasCooldowns)
        : state;
      return setRendererTypeIfNeccessary({
        ...stateWithCooldowns,
        replacementMessage: action.replacementMessage || null,
        replacementInterval: action.replacementInterval || null,
      });
    }

    case 'UPDATE_INTERVAL_ACTIVE': {
      return setRendererTypeIfNeccessary({ ...state });
    }

    case 's/REC_CANVASES': {
      const { canvases, defaultCanvas } = action;
      let {
        canvasId,
        view,
      } = state;

      if (canvasId === null) {
        ({ canvasId, view } = getViewFromURL(canvases, defaultCanvas));
      }
      const canvas = canvases[canvasId];
      const canvasState = getCanvasArgs(
        canvas, state.prevCanvasState[canvasId],
      );

      return setRendererTypeIfNeccessary(fixHistoryIfNeccessary({
        ...state,
        ...canvasState,
        canvasId,
        canvases,
        defaultCanvas,
        view,
      }));
    }

    case 's/REC_COOLDOWN_UPDATE': {
      const { bcd, pcd, canvasCooldowns } = action;
      if (canvasCooldowns) {
        return applyCanvasCooldownMap(state, canvasCooldowns);
      }
      if ((bcd === null || bcd === undefined)
        && (pcd === null || pcd === undefined)
      ) {
        return state;
      }
      const updatedCanvases = {};
      for (const [id, c] of Object.entries(state.canvases)) {
        updatedCanvases[id] = {
          ...c,
          ...(bcd !== null && bcd !== undefined ? { bcd } : {}),
          ...(pcd !== null && pcd !== undefined ? { pcd } : {}),
        };
      }
      return {
        ...state,
        canvases: updatedCanvases,
      };
    }

    default:
      return state;
  }
}
