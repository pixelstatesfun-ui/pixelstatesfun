/*
 * keypress actions
 */
import { t } from 'ttag';
import copy from '../utils/clipboard.js';
import {
  toggleGrid,
  togglePixelNotify,
  toggleHistoricalView,
  toggleEasterEgg,
  toggleMute,
  selectCanvas,
  selectHoverColor,
  setHoldPaint,
  setMoveU,
  setMoveV,
} from '../store/actions/index.js';
import { toggleOVEnabled } from '../store/actions/templates.js';
import { notify, switchPencilMode } from '../store/actions/thunks.js';

const DEFAULT_KEY_BINDINGS = {
  grid: 'KeyG',
  pixelNotify: 'KeyX',
  historicalView: 'KeyH',
  mute: 'KeyM',
  copyCoordinates: 'KeyR',
  overlay: 'KeyT',
  easterEgg: 'KeyL',
  pencilMode: 'KeyB',
};

const movementKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD']);
const pressedMovementKeys = new Set();

function updateCameraMovement(store, event, pressed) {
  const { code } = event;
  if (!movementKeys.has(code)
    || (pressed && (event.ctrlKey || event.metaKey || event.altKey))
  ) {
    return false;
  }

  if (pressed) {
    pressedMovementKeys.add(code);
  } else {
    pressedMovementKeys.delete(code);
  }

  const horizontal = pressedMovementKeys.has('KeyD') ? 1
    : pressedMovementKeys.has('KeyA') ? -1 : 0;
  const vertical = pressedMovementKeys.has('KeyS') ? 1
    : pressedMovementKeys.has('KeyW') ? -1 : 0;
  store.dispatch(setMoveU(horizontal));
  store.dispatch(setMoveV(vertical));
  return true;
}

function isEditableTarget(target) {
  return target.nodeName === 'INPUT'
    || target.nodeName === 'TEXTAREA'
    || target.nodeName === 'SELECT'
    || target.isContentEditable;
}

export function createKeyUpHandler(store) {
  return (event) => {
    if (updateCameraMovement(store, event, false)) {
      return;
    }

    /*
     * key char
     */
    switch (event.key) {
      case 'Shift':
      case 'CapsLock':
        store.dispatch(setHoldPaint(false));
        break;
      default:
    }
  };
}

export function createKeyDownHandler(store) {
  window.addEventListener('blur', () => {
    pressedMovementKeys.clear();
    store.dispatch({ type: 's/CANCEL_MOVE' });
  });

  return (event) => {
    if (isEditableTarget(event.target) || event.repeat) {
      return;
    }

    if (movementKeys.has(event.code)
      && !event.ctrlKey
      && !event.metaKey
      && !event.altKey
    ) {
      event.preventDefault();
      updateCameraMovement(store, event, true);
      return;
    }

    let { key } = event;

    const keyBindings = {
      ...DEFAULT_KEY_BINDINGS,
      ...store.getState().gui.keyBindings,
    };
    const letterCode = /^[a-z]$/i.test(key)
      ? `Key${key.toUpperCase()}`
      : null;
    const matchesBinding = (binding) => (
      event.code === keyBindings[binding]
      || letterCode === keyBindings[binding]
    );

    const num = Number(key);
    if (!Number.isNaN(num) && num > 0
      && !Object.values(keyBindings).includes(event.code)
    ) {
      // switch to canvas on num keys
      const { canvases, canvasId: curCanvasId } = store.getState().canvas;
      const canvasIds = Object.keys(canvases)
        .filter((id) => !canvases[id].hid);
      if (num <= canvasIds.length) {
        const canvasId = canvasIds[num - 1];
        if (canvasId !== curCanvasId) {
          store.dispatch(selectCanvas(canvasId));
          const canvasName = canvases[canvasId].title;
          store.dispatch(notify(t`Switched to ${canvasName}`));
        }
      }
      return;
    }

    if (matchesBinding('pencilMode')) {
      store.dispatch(switchPencilMode());
      return;
    }

    /*
     * key char
     */
    switch (event.key) {
      case 'Control':
        store.dispatch(selectHoverColor(-1));
        return;
      case 'Shift':
        store.dispatch(setHoldPaint(true, true));
        return;
      default:
    }

    if (matchesBinding('grid')) {
      store.dispatch(toggleGrid());
      store.dispatch(notify((store.getState().gui.showGrid)
        ? t`Grid ON`
        : t`Grid OFF`));
    } else if (matchesBinding('historicalView')) {
      if (window.ssv?.backupurl) {
        store.dispatch(toggleHistoricalView());
      } else {
        store.dispatch(notify(t`History is not configured on this server.`));
      }
    } else if (matchesBinding('pixelNotify')) {
      store.dispatch(togglePixelNotify());
      store.dispatch(notify((store.getState().gui.showPixelNotify)
        ? t`Pixel Notify ON`
        : t`Pixel Notify OFF`));
    } else if (matchesBinding('mute')) {
      store.dispatch(toggleMute());
      store.dispatch(notify((store.getState().gui.mute)
        ? t`Muted Sound`
        : t`Unmuted Sound`));
    } else if (matchesBinding('copyCoordinates')) {
      const { hover } = store.getState().canvas;
      const text = hover.join('_');
      copy(text);
      store.dispatch(notify(t`Copied`));
    } else if (matchesBinding('overlay')) {
      store.dispatch(toggleOVEnabled());
      store.dispatch(notify((store.getState().templates.ovEnabled)
        ? t`Overlay ON`
        : t`Overlay OFF`));
    } else if (matchesBinding('easterEgg')) {
      store.dispatch(toggleEasterEgg());
      store.dispatch(notify((store.getState().gui.easterEgg)
        ? t`Easter Egg ON`
        : t`Easter Egg OFF`));
    }
  };
}
