/*
 * Controls for 2D canvases
 *
 * keycodes:
 * https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/key/Key_Values
 *
 */

import {
  setHover,
  unsetHover,
  selectColor,
} from '../store/actions/index.js';
import { requestBanMe } from '../store/actions/fetch.js';
import pixelTransferController from '../ui/PixelTransferController.js';
import { snapBrushMotion } from '../ui/render2Delements.js';
import { setCursor, getCursor } from './cursors.js';
import {
  screenToWorld,
  getChunkOfPixel,
  getOffsetOfPixel,
  getTapOrClickCenter,
  getBrushPixels,
} from '../core/utils.js';
import { PENCIL_MODE } from '../core/constants.js';
import templateLoader from '../ui/templateLoader.js';
import { getActivePixelZoneAt } from '../ui/ActivePixelZones.js';

class PixelPainterControls {
  store;
  renderer;
  viewport;
  //
  clickTapStartView = [0, 0];
  clickTapStartTime = 0;
  tapStartDist = 50;
  // screen coords of where a tap/click started
  clickTapStartCoords = [0, 0];
  // stored speed for acceleration
  speedScalar = 0;
  // on mouse: true as long as left mouse button is pressed
  isClicking = false;
  isShiftPanning = false;
  isPaintingDrag = false;
  isBrushDragBlocked = false;
  lastPaintCell = null;
  lastPaintScale = null;
  lastPaintCanvasId = null;
  // on touch: true if more than one finger on screen
  isMultiTap = false;
  // on touch: true if current tab was ever more than one figher at any time
  wasEverMultiTap = false;
  // on touch: when painting with holdPaint is active
  isTapPainting = false;
  // on touch: timeout to detect long-press
  tapTimeout = null;
  // time of last tick
  prevTime = Date.now();
  // if we are waiting before placing pixel via holdPaint again
  coolDownDelta = false;
  hotspotCandidate = null;
  hotspotFlight = null;

  constructor(renderer, viewport, store) {
    this.store = store;
    this.renderer = renderer;
    this.viewport = viewport;

    this.onMouseDown = this.onMouseDown.bind(this);
    this.onAuxClick = this.onAuxClick.bind(this);
    this.onMouseOut = this.onMouseOut.bind(this);
    this.onMouseMove = this.onMouseMove.bind(this);
    this.onWheel = this.onWheel.bind(this);
    this.onMouseUp = this.onMouseUp.bind(this);
    this.onTouchStart = this.onTouchStart.bind(this);
    this.onTouchEnd = this.onTouchEnd.bind(this);
    this.onTouchMove = this.onTouchMove.bind(this);

    viewport.addEventListener('auxclick', this.onAuxClick, false);
    viewport.addEventListener('mousedown', this.onMouseDown, false);
    viewport.addEventListener('mousemove', this.onMouseMove, false);
    viewport.addEventListener('mouseup', this.onMouseUp, false);
    viewport.addEventListener('wheel', this.onWheel, false);
    viewport.addEventListener('touchstart', this.onTouchStart, false);
    viewport.addEventListener('touchend', this.onTouchEnd, false);
    viewport.addEventListener('touchmove', this.onTouchMove, false);
    viewport.addEventListener('mouseout', this.onMouseOut, false);
    viewport.addEventListener('touchcancel', this.onMouseOut, false);
    this.setCursor('default');
  }

  // eslint-disable-next-line class-methods-use-this
  dispose() {}

  gotCoolDownDelta(delta) {
    this.coolDownDelta = true;
    setTimeout(() => {
      this.coolDownDelta = false;
    }, delta * 1000);
  }

  setCursor(keyword) {
    const state = this.store.getState();
    let modeAdd;
    switch (state.canvas.pencilMode) {
      case PENCIL_MODE.COLOR:
        modeAdd = 'color';
        break;
      case PENCIL_MODE.OVERLAY:
        modeAdd = 'template';
        break;
      case PENCIL_MODE.HISTORY:
        modeAdd = 'history';
        break;
      default:
    }
    if (keyword === 'default' && modeAdd) {
      keyword += `-${modeAdd}`;
      if (state.gui.holdPaint) {
        keyword += '-on';
      }
    }
    if (keyword === 'move' && modeAdd && modeAdd !== 'template') {
      keyword += `-${modeAdd}`;
    }
    setCursor(keyword, this.viewport, this.store.getState().gui.cursor);
  }

  updateCursor() {
    this.setCursor(getCursor(this.viewport));
  }

  paintToCell(cell) {
    const lastCell = this.lastPaintCell;
    const state = this.store.getState();
    const { viewscale } = this.renderer;
    const { canvasId } = state.canvas;
    if (!lastCell
      || this.lastPaintScale !== viewscale
      || this.lastPaintCanvasId !== canvasId
    ) {
      PixelPainterControls.placePixel(this.store, this.renderer, cell);
      this.lastPaintCell = cell;
      this.lastPaintScale = viewscale;
      this.lastPaintCanvasId = canvasId;
      return;
    }
    let [x0, y0] = lastCell;
    const [x1, y1] = cell;
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let error = dx - dy;

    while (x0 !== x1 || y0 !== y1) {
      const twiceError = error * 2;
      if (twiceError > -dy) {
        error -= dy;
        x0 += sx;
      }
      if (twiceError < dx) {
        error += dx;
        y0 += sy;
      }
      PixelPainterControls.placePixel(this.store, this.renderer, [x0, y0]);
    }
    this.lastPaintCell = cell;
    this.lastPaintScale = viewscale;
    this.lastPaintCanvasId = canvasId;
  }

  onMouseDown(event) {
    event.preventDefault();
    document.activeElement.blur();

    if (event.button === 0) {
      this.hotspotFlight = null;
      this.renderer.cancelStoreViewInState();
      this.isClicking = true;
      const { clientX, clientY } = event;
      this.clickTapStartTime = Date.now();
      this.clickTapStartCoords = [clientX, clientY];
      this.clickTapStartView = this.renderer.view;
      const state = this.store.getState();
      this.hotspotCandidate = state.gui.showActiveZones
        ? getActivePixelZoneAt(
            state.canvas.canvasId,
            this.viewport,
            this.renderer.view,
            this.renderer.viewscale,
            [clientX, clientY],
          ) : null;
      if (this.hotspotCandidate) {
        this.isShiftPanning = false;
        this.isPaintingDrag = false;
        this.isBrushDragBlocked = false;
        return;
      }
      this.isShiftPanning = event.shiftKey;
      if (this.isShiftPanning) {
        this.isPaintingDrag = false;
        this.isBrushDragBlocked = false;
        this.setCursor('move');
        return;
      }
      this.isBrushDragBlocked = Boolean(
        state.gui.holdPaint && state.canvas.brushSize > 1,
      );
      this.isPaintingDrag = Boolean(
        state.gui.holdPaint && !this.isBrushDragBlocked,
      );
      if (this.isPaintingDrag) {
        this.lastPaintCell = null;
        this.paintToCell(
          this.screenToWorld([clientX, clientY]).map(Math.floor),
        );
      } else if (this.isBrushDragBlocked) {
        if (!(event instanceof MouseEvent) || !event.isTrusted) {
          requestBanMe(4);
          this.isClicking = false;
          this.isBrushDragBlocked = false;
          return;
        }
        PixelPainterControls.placePixel(
          this.store,
          this.renderer,
          this.screenToWorld([clientX, clientY]),
        );
      }
      setTimeout(() => {
        if (this.isClicking && !this.isBrushDragBlocked) {
          this.setCursor('move');
        }
      }, 300);
    }
  }

  onMouseUp(event) {
    event.preventDefault();

    if (event.button === 0 && this.isShiftPanning) {
      this.isClicking = false;
      this.isShiftPanning = false;
      this.renderer.storeViewInState();
      this.setCursor('default');
      return;
    }

    const { store, renderer } = this;
    if (event.button === 0) {
      this.isClicking = false;
      const { clientX, clientY } = event;
      const { clickTapStartCoords, clickTapStartTime } = this;
      const wasPaintingDrag = this.isPaintingDrag;
      const wasBrushDragBlocked = this.isBrushDragBlocked;
      this.isPaintingDrag = false;
      this.isBrushDragBlocked = false;
      this.lastPaintCell = null;
      this.lastPaintScale = null;
      this.lastPaintCanvasId = null;
      const coordsDiff = [
        clickTapStartCoords[0] - clientX,
        clickTapStartCoords[1] - clientY,
      ].map(Math.abs);
      if (this.hotspotCandidate) {
        const target = this.hotspotCandidate;
        this.hotspotCandidate = null;
        if (clickTapStartTime > Date.now() - 250
          && coordsDiff[0] < 6 && coordsDiff[1] < 6
        ) {
          this.startHotspotFlight(target);
        } else {
          renderer.storeViewInState();
        }
        this.setCursor('default');
        return;
      }
      // thresholds for single click / holding
      if (clickTapStartTime > Date.now() - 250
        && coordsDiff[0] < 6 && coordsDiff[1] < 6
        && !wasPaintingDrag
        && !wasBrushDragBlocked
      ) {
        if (!(event instanceof MouseEvent) || !event.isTrusted) {
          requestBanMe(4);
          return;
        }
        PixelPainterControls.placePixel(
          store,
          renderer,
          this.screenToWorld([clientX, clientY]),
        );
      }
      this.setCursor('default');
    }
    renderer.storeViewInState();
  }

  static getTouchCenter(event) {
    let x = 0;
    let y = 0;
    for (const { pageX, pageY } of event.touches) {
      x += pageX;
      y += pageY;
    }
    const { length } = event.touches;
    return [x / length, y / length];
  }

  /*
   * place pixel
   * either with given colorIndex or with selected color if none is given
   */
  static placePixel(store, renderer, cell, colorIndex = null) {
    cell = cell.map(Math.floor);
    const state = store.getState();
    if (state.canvas.isHistoricalView) {
      return;
    }
    const selectedColor = colorIndex
      ?? PixelPainterControls.getWantedColor(state, renderer, cell);
    if (selectedColor === null) {
      return;
    }
    const { viewscale: scale } = renderer;
    const { brushSize } = state.canvas;

    if (state.gui.autoZoomIn && scale < 8) {
      renderer.updateView([cell[0], cell[1], 12]);
      return;
    }

    // allow placing of pixel just on low zoomlevels
    if (scale < 3) {
      return;
    }

    const curColor = renderer.getColorIndexOfPixel(...cell);
    if (brushSize === 1 && selectedColor === curColor) {
      return;
    }

    // placing unset pixel
    if (brushSize === 1 && selectedColor < state.canvas.clrIgnore) {
      const { palette } = state.canvas;
      const { rgb } = palette;
      let clrOffset = selectedColor * 3;
      const r = rgb[clrOffset++];
      const g = rgb[clrOffset++];
      const b = rgb[clrOffset];
      if (palette.getIndexOfColor(r, g, b) === curColor) {
        return;
      }
    }

    const { canvasSize } = state.canvas;
    const [x, y] = cell;

    // apu link
    // 5275_-8713
    // 5398_-8614
    if (x > 5275 && y > -8713 && x < 5398 && y < -8614) {
      if (state.canvas.canvasId === '0') {
        window.location.href = 'https://files.catbox.moe/gh2wtr.mp4';
        return;
      }
    }

    const maxCoords = canvasSize / 2;
    if (x < -maxCoords || x >= maxCoords || y < -maxCoords || y >= maxCoords) {
      return;
    }
    const [i, j] = getChunkOfPixel(canvasSize, x, y);
    const offset = getOffsetOfPixel(canvasSize, x, y);
    if (brushSize > 1) {
      if (state.gui.animateBrush && !state.gui.holdPaint) {
        snapBrushMotion(state, cell);
      }
      const brushCells = getBrushPixels(canvasSize, x, y, brushSize);
      const brushPoints = brushCells.map(([
        , , , pixelX, pixelY,
      ]) => [pixelX, pixelY]);
      const brushColors = renderer.getColorIndicesOfPixels
        ? renderer.getColorIndicesOfPixels(brushPoints) : null;
      if (state.gui.holdPaint
        && state.canvas.pencilMode === PENCIL_MODE.OVERLAY
      ) {
        const templateColors = new Uint8Array(100);
        const templateMask = new Uint8Array(13);
        const brushPixels = [];
        const radius = Math.floor(brushSize / 2);
        brushCells.forEach(([
          pixelI, pixelJ, pixelOffset, pixelX, pixelY,
        ], index) => {
          const rgb = templateLoader.getColorOfPixel(
            state.canvas.canvasId,
            pixelX,
            pixelY,
          );
          if (!rgb) {
            return;
          }
          const targetColor = state.canvas.palette.getClosestIndexOfColor(
            ...rgb,
          );
          const existingColor = brushColors
            ? brushColors[index]
            : renderer.getColorIndexOfPixel(pixelX, pixelY);
          if (targetColor === existingColor) {
            return;
          }
          const templateSlot = (pixelY - y + radius) * brushSize
            + pixelX - x + radius;
          templateColors[templateSlot] = targetColor;
          templateMask[templateSlot >> 3] |= 1 << (templateSlot & 7);
          brushPixels.push([
            pixelI, pixelJ, pixelOffset, existingColor, targetColor,
          ]);
        });
        if (!templateMask.some((byte) => byte)) {
          return;
        }
        pixelTransferController.tryPlaceBrush(
          i,
          j,
          offset,
          brushSize,
          selectedColor,
          brushPixels,
          templateColors,
          templateMask,
        );
        return;
      }
      const brushPixels = brushCells.map(([
        pixelI, pixelJ, pixelOffset, pixelX, pixelY,
      ], index) => [
        pixelI,
        pixelJ,
        pixelOffset,
        brushColors
          ? brushColors[index]
          : renderer.getColorIndexOfPixel(pixelX, pixelY),
      ]);
      if (brushPixels.every(([, , , existingColor]) => (
        existingColor === selectedColor
      ))) {
        return;
      }
      pixelTransferController.tryPlaceBrush(
        i,
        j,
        offset,
        brushSize,
        selectedColor,
        brushPixels,
      );
      return;
    }
    pixelTransferController.tryPlacePixel(
      i, j, offset,
      selectedColor,
      curColor,
    );
  }

  static getMultiTouchDistance(event) {
    if (event.touches.length < 2) {
      return 1;
    }
    const a = event.touches[0];
    const b = event.touches[1];
    return Math.sqrt(
      (b.pageX - a.pageX) ** 2 + (b.pageY - a.pageY) ** 2,
    );
  }

  onTouchStart(event) {
    event.preventDefault();
    document.activeElement.blur();

    this.hotspotFlight = null;
    this.renderer.cancelStoreViewInState();
    this.clearTabTimeout();
    this.isTapPainting = false;
    this.clickTapStartTime = Date.now();
    this.clickTapStartCoords = getTapOrClickCenter(event);
    this.clickTapStartView = this.renderer.view;
    this.hotspotCandidate = null;

    if (event.touches.length > 1) {
      this.tapStartDist = PixelPainterControls.getMultiTouchDistance(event);
      this.isMultiTap = true;
      this.wasEverMultiTap = true;
    } else {
      this.isMultiTap = false;
      this.wasEverMultiTap = false;
      const state = this.store.getState();
      if (state.gui.showActiveZones) {
        this.hotspotCandidate = getActivePixelZoneAt(
          state.canvas.canvasId,
          this.viewport,
          this.renderer.view,
          this.renderer.viewscale,
          this.clickTapStartCoords,
        );
      }
      if (this.hotspotCandidate) {
        return;
      }
      if (state.gui.holdPaint) {
        this.tapTimeout = setTimeout(() => {
          this.isTapPainting = true;
          PixelPainterControls.placePixel(
            this.store,
            this.renderer,
            this.screenToWorld(this.clickTapStartCoords),
          );
        }, 200);
      } else {
        this.tapTimeout = setTimeout(() => {
          // check for longer tap to select taped color
          this.selectColorFromScreen(this.clickTapStartCoords);
        }, 600);
      }
    }
  }

  onTouchEnd(event) {
    event.preventDefault();
    if (event.touches.length) {
      return;
    }

    const { store, renderer } = this;
    if (!this.wasEverMultiTap) {
      const [clientX, clientY] = getTapOrClickCenter(event);
      const { clickTapStartCoords, clickTapStartTime } = this;
      const coordsDiff = [
        clickTapStartCoords[0] - clientX,
        clickTapStartCoords[1] - clientY,
      ].map(Math.abs);
      if (this.hotspotCandidate) {
        const target = this.hotspotCandidate;
        this.hotspotCandidate = null;
        if (clickTapStartTime > Date.now() - 580
          && coordsDiff[0] < 6 && coordsDiff[1] < 6
        ) {
          this.startHotspotFlight(target);
        }
        renderer.storeViewInState();
        this.clearTabTimeout();
        return;
      }
      // thresholds for single click / holding
      if (clickTapStartTime > Date.now() - 580
        && coordsDiff[0] < 6 && coordsDiff[1] < 6
      ) {
        PixelPainterControls.placePixel(
          store,
          this.renderer,
          this.screenToWorld([clientX, clientY]),
        );
        setTimeout(() => {
          store.dispatch(unsetHover());
        }, 500);
      }
    }
    renderer.storeViewInState();
    this.clearTabTimeout();
  }

  onTouchMove(event) {
    event.preventDefault();
    event.stopPropagation();

    const multiTouch = (event.touches.length > 1);
    const state = this.store.getState();

    const [clientX, clientY] = getTapOrClickCenter(event);
    if (this.isMultiTap !== multiTouch) {
      this.wasEverMultiTap = true;
      // if one finger got lifted or added, reset clickTabStart
      this.isMultiTap = multiTouch;
      this.clickTapStartCoords = [clientX, clientY];
      this.clickTapStartView = this.renderer.view;
      this.tapStartDist = PixelPainterControls.getMultiTouchDistance(event);
      return;
    }
    const { clickTapStartView, clickTapStartCoords } = this;
    // pinch
    if (multiTouch) {
      this.clearTabTimeout();
      const a = event.touches[0];
      const b = event.touches[1];
      const dist = Math.sqrt(
        (b.pageX - a.pageX) ** 2 + (b.pageY - a.pageY) ** 2,
      );
      const pinchScale = dist / this.tapStartDist;
      const [x, y] = this.renderer.view;
      this.renderer.updateView([x, y, clickTapStartView[2] * pinchScale]);
    }
    // pan
    if (!state.gui.holdPaint || multiTouch) {
      const [lastPosX, lastPosY] = clickTapStartView;
      const deltaX = clientX - clickTapStartCoords[0];
      const deltaY = clientY - clickTapStartCoords[1];
      if (deltaX > 5 || deltaY > 5) {
        this.clearTabTimeout();
      }
      const { viewscale: scale } = this.renderer;
      this.renderer.updateView([
        lastPosX - (deltaX / scale),
        lastPosY - (deltaY / scale),
      ]);
    } else if (!this.wasEverMultiTap && !this.coolDownDelta) {
      // hold paint
      if (this.isTapPainting) {
        PixelPainterControls.placePixel(
          this.store,
          this.renderer,
          this.screenToWorld([clientX, clientY]),
        );
      } else {
        // while we are waiting for isTapPainting to trigger track coordinates
        this.clickTapStartCoords = [clientX, clientY];
        this.clickTapStartView = this.renderer.view;
        this.tapStartDist = PixelPainterControls.getMultiTouchDistance(event);
      }
    }
  }

  clearTabTimeout() {
    if (this.tapTimeout) {
      clearTimeout(this.tapTimeout);
      this.tapTimeout = null;
    }
  }

  zoom(direction, origin) {
    const [x, y, scale] = this.renderer.view;
    const deltaScale = scale >= 1.0 ? 1.1 : 1.04;
    const newScale = (direction > 0) ? scale * deltaScale : scale / deltaScale;
    this.renderer.updateView([x, y, newScale], origin);
    this.renderer.storeViewInState();
  }

  step(direction) {
    const [x, y, scale] = this.renderer.view;
    const [dx, dy] = direction.map((z) => z * 100.0 / scale);
    this.renderer.updateView([x + dx, y + dy]);
    this.renderer.storeViewInState();
  }

  holdPaintStarted(immediate) {
    // if hold painting is started by keyboard,
    // we immeidately have to place, and not just when mousemove starts
    if (!immediate) {
      return;
    }
    const { hover } = this.store.getState().canvas;
    if (hover) {
      PixelPainterControls.placePixel(
        this.store,
        this.renderer,
        hover,
      );
    }
  }

  onWheel(event) {
    event.preventDefault();
    event.stopPropagation();
    document.activeElement.blur();
    this.hotspotFlight = null;

    const { clientX, clientY, deltaY } = event;
    const origin = this.screenToWorld([clientX, clientY]);
    if (deltaY < 0) {
      this.zoom(1, origin);
    }
    if (deltaY > 0) {
      this.zoom(-1, origin);
    }
  }

  static getWantedColor(state, renderer, cell) {
    if (state.gui.holdPaint) {
      const { pencilMode } = state.canvas;
      if (pencilMode === PENCIL_MODE.HISTORY) {
        return renderer.getColorIndexOfPixel(...cell, true);
      }
      if (pencilMode === PENCIL_MODE.OVERLAY) {
        const { canvasId } = state.canvas;
        const rgb = templateLoader.getColorOfPixel(canvasId, ...cell);
        if (!rgb) {
          return null;
        }
        return state.canvas.palette.getClosestIndexOfColor(...rgb);
      }
    }
    return state.canvas.selectedColor;
  }

  screenToWorld(screenCoor) {
    return screenToWorld(
      this.renderer.view,
      this.renderer.viewscale,
      this.viewport,
      screenCoor,
    );
  }

  /*
   * set hover from screen coordinates
   * @param [x, y] screen coordinates
   * @return null if hover didn't changed,
   *         hover if it changed
   */
  setHoverFromScrrenCoor(screenCoor) {
    const { store } = this;
    const state = store.getState();
    const { hover: prevHover } = state.canvas;
    const hover = this.screenToWorld(screenCoor).map(Math.floor);
    const [x, y] = hover;

    /* out of bounds check */
    const { canvasSize } = state.canvas;
    const maxCoords = canvasSize / 2;
    if (x < -maxCoords || x >= maxCoords
      || y < -maxCoords || y >= maxCoords
    ) {
      if (prevHover) {
        store.dispatch(unsetHover());
      }
      return null;
    }

    if (!prevHover || prevHover[0] !== x || prevHover[1] !== y) {
      store.dispatch(setHover(hover));
      return hover;
    }
    return null;
  }

  onMouseMove(event) {
    event.preventDefault();

    const { clientX, clientY } = event;
    const { renderer, isClicking } = this;
    const { viewscale } = renderer;
    if (isClicking) {
      if (this.hotspotCandidate) return;
      if (this.isShiftPanning) {
        const [startX, startY] = this.clickTapStartCoords;
        const [viewX, viewY] = this.clickTapStartView;
        const deltaX = clientX - startX;
        const deltaY = clientY - startY;
        renderer.updateView([
          viewX - deltaX / viewscale,
          viewY - deltaY / viewscale,
        ]);
        return;
      }
      if (this.isBrushDragBlocked) {
        return;
      }
      if (this.isPaintingDrag) {
        this.paintToCell(
          this.screenToWorld([clientX, clientY]).map(Math.floor),
        );
        return;
      }
      if (Date.now() < this.clickTapStartTime + 100) {
        // 100ms threshold till starting to pan
        return;
      }
      const { clickTapStartView, clickTapStartCoords } = this;
      const [lastPosX, lastPosY] = clickTapStartView;
      const deltaX = clientX - clickTapStartCoords[0];
      const deltaY = clientY - clickTapStartCoords[1];

      this.renderer.updateView([
        lastPosX - (deltaX / viewscale),
        lastPosY - (deltaY / viewscale),
      ]);
    } else {
      const hover = this.setHoverFromScrrenCoor([clientX, clientY]);
      if (!hover) {
        return;
      }
      const state = this.store.getState();
      if (!this.coolDownDelta && state.gui.holdPaint) {
        if (!(event instanceof MouseEvent) || !event.isTrusted) {
          requestBanMe(4);
          return;
        }
        /* hold paint */
        PixelPainterControls.placePixel(
          this.store,
          this.renderer,
          hover,
        );
      }
    }
  }

  onMouseOut(event) {
    if (event.relatedTarget && this.viewport.contains(event.relatedTarget)) {
      return;
    }
    const { store } = this;
    this.setCursor('default');
    store.dispatch(unsetHover());
    this.isClicking = false;
    this.hotspotCandidate = null;
    if (this.isShiftPanning) {
      this.renderer.storeViewInState();
    }
    this.isShiftPanning = false;
    this.isPaintingDrag = false;
    this.isBrushDragBlocked = false;
    this.lastPaintCell = null;
    this.lastPaintScale = null;
    this.lastPaintCanvasId = null;
    this.clearTabTimeout();
  }

  selectColorFromScreen(center) {
    const { renderer, store } = this;
    if (this.renderer.viewscale < 3) {
      return;
    }
    const coords = this.screenToWorld(center).map(Math.floor);
    const clrIndex = renderer.getColorIndexOfPixel(...coords);
    if (clrIndex !== null) {
      store.dispatch(selectColor(clrIndex));
    }
  }

  onAuxClick(event) {
    const { which, clientX, clientY } = event;
    // middle mouse button
    if (which !== 2) {
      return;
    }
    event.preventDefault();
    this.selectColorFromScreen([clientX, clientY]);
  }

  startHotspotFlight(target) {
    this.hotspotFlight = {
      start: Date.now(),
      from: [...this.renderer.view],
      to: [target.x, target.y, target.scale],
    };
  }

  update() {
    let time = Date.now();
    if (this.hotspotFlight) {
      const flight = this.hotspotFlight;
      const progress = Math.min(1, (time - flight.start) / 900);
      const eased = progress < 0.5
        ? 2 * progress * progress
        : 1 - ((-2 * progress + 2) ** 2) / 2;
      const [fromX, fromY, fromScale] = flight.from;
      const [toX, toY, toScale] = flight.to;
      this.renderer.updateView([
        fromX + (toX - fromX) * eased,
        fromY + (toY - fromY) * eased,
        fromScale * ((toScale / fromScale) ** eased),
      ]);
      if (progress === 1) {
        this.hotspotFlight = null;
        this.renderer.storeViewInState();
      }
      return true;
    }
    const { moveU, moveV, moveW } = this.store.getState().gui;
    const isAccelerating = (moveU || moveV || moveW);

    if (!isAccelerating) {
      this.prevTime = time;
      this.speedScalar = 0;
      return false;
    }
    // set to time since last tick
    time -= this.prevTime;
    this.prevTime += time;

    this.speedScalar = Math.min(1, this.speedScalar + 0.025);

    const [x, y, scale] = this.renderer.view;

    const directionalStep = time * 0.4 / scale * this.speedScalar;
    let scaleFactor = scale >= 1.0 ? 1.0005 : 1.0003;
    scaleFactor **= moveW * this.speedScalar;

    this.renderer.updateView([
      x + directionalStep * moveU,
      y + directionalStep * moveV,
      scale * scaleFactor ** time,
    ]);

    return true;
  }
}

export default PixelPainterControls;
