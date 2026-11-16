/*
 * Control incoming and outgoing pixels,
 * do client prediction, send to draw on renderer
 */
import { t } from 'ttag';
import { pAlert } from '../store/actions/index.js';
import {
  setPixelsFetching,
  receivePlacePixels,
} from '../store/actions/socket.js';
import {
  notify,
} from '../store/actions/thunks.js';

let lastProtectedPixelNoticeAt = 0;
let lastNapAlertAt = 0;

class PixelTransferController {
  constructor() {
    this.requestFromQueue = this.requestFromQueue.bind(this);
    /*
     * cache of pixels that still are to set
     * [{i: i, j: j, pixels: [[offset, color],...]}, ...]
     */
    this.pixelQueue = [];
    this.brushRequestScheduled = false;
    this.stackEmptySoundPlayed = false;
    /*
     * requests that got predicted on client and yet have to be
     * received from the server
     * [[i, j, offset, colorold, colornew], ...]
     */
    this.clientPredictions = [];
    this.recentLocalPixels = new Map();
    /*
     * allow extensions to hook into pixel updates
     */
    this.extension = null;
    window.registerPixelUpdates = (cb) => {
      this.extension = cb;
    };
  }

  initialize(store, socketClient, getRenderer) {
    this.store = store;
    this.socketClient = socketClient;
    this.getRenderer = getRenderer;
  }

  /*
   * request pixel placement from queue
   */
  async requestFromQueue() {
    const { store } = this;
    if (!this.pixelQueue.length) {
      store.dispatch(setPixelsFetching(false));
      return;
    }

    store.dispatch(setPixelsFetching(true));
    const firstEntry = this.pixelQueue.shift();
    const requestEntries = [firstEntry];
    const {
      i, j, pixels, brush,
    } = firstEntry;
    let requestedPixels = pixels;
    const isTemplateBrush = Boolean(brush?.templateColors);
    let brushStamps = brush ? [{ i, j, ...brush }] : null;
    if (brush) {
      let batchPixelCount = pixels.length;
      while (this.pixelQueue.length && requestEntries.length < 100) {
        const nextEntry = this.pixelQueue[0];
        if (!nextEntry.brush
          || Boolean(nextEntry.brush.templateColors) !== isTemplateBrush
          || batchPixelCount + nextEntry.pixels.length > 100
        ) {
          break;
        }
        this.pixelQueue.shift();
        requestEntries.push(nextEntry);
        brushStamps.push({
          i: nextEntry.i,
          j: nextEntry.j,
          ...nextEntry.brush,
        });
        requestedPixels = requestedPixels.concat(nextEntry.pixels);
        batchPixelCount += nextEntry.pixels.length;
      }
    }

    requestedPixels.forEach(([pixelI, pixelJ, offset, color]) => {
      this.recentLocalPixels.set(`${pixelI}:${pixelJ}:${offset}`, {
        color,
        expiresAt: Date.now() + 3000,
      });
    });

    let ret;
    try {
      if (brush) {
        if (isTemplateBrush) {
          ret = await this.socketClient.sendPixelTemplateBrushBatchUpdate(
            brushStamps,
          );
        } else {
          ret = await this.socketClient.sendPixelBrushBatchUpdate(brushStamps);
        }
      } else {
        ret = await this.socketClient.sendPixelUpdate(i, j, pixels);
      }
    } catch {
      // timeout
      ret = {
        retCode: 16,
        coolDownDisplaySeconds: 0,
        pxlCnt: 0,
      };
      store.dispatch(pAlert(
        t`Timeout`,
        // eslint-disable-next-line max-len
        t`Didn't get an answer from PixelStates. Try to refresh if this problem persists.`,
        'error',
      ));
    }

    const {
      retCode,
      coolDownDisplaySeconds,
      pxlCnt,
    } = ret;

    if (pxlCnt > 0) {
      requestedPixels.slice(0, pxlCnt).forEach((
        [pixelI, pixelJ, offset, color],
      ) => {
        const key = `${pixelI}:${pixelJ}:${offset}`;
        this.recentLocalPixels.set(key, {
          color,
          expiresAt: Date.now() + 3000,
        });
      });
    }
    requestedPixels.slice(pxlCnt).forEach((
      [pixelI, pixelJ, offset, color],
    ) => {
      const key = `${pixelI}:${pixelJ}:${offset}`;
      if (this.recentLocalPixels.get(key)?.color === color) {
        this.recentLocalPixels.delete(key);
      }
    });
    if (pxlCnt > 0) {
      while (this.recentLocalPixels.size > 1000) {
        this.recentLocalPixels.delete(this.recentLocalPixels.keys().next().value);
      }
    }

    if (retCode === 13) {
      // The server rejects overlapping requests from the same IP. Keep the
      // optimistic pixels and retry this request once the current request ends.
      this.pixelQueue = requestEntries.concat(this.pixelQueue);
      await new Promise((resolve) => setTimeout(resolve, 250));
      queueMicrotask(this.requestFromQueue);
      return;
    }

    if (retCode === 9) {
      if (!this.stackEmptySoundPlayed) {
        store.dispatch({ type: 'PIXEL_STACK_EMPTY' });
        this.stackEmptySoundPlayed = true;
      }
    } else if (pxlCnt > 0) {
      this.stackEmptySoundPlayed = false;
    }

    if (coolDownDisplaySeconds || pxlCnt > 0) {
      store.dispatch(notify(coolDownDisplaySeconds));
    }

    if (brush && pxlCnt > 0) {
      const renderer = this.getRenderer();
      const acceptedPixels = requestedPixels.slice(0, pxlCnt);
      this.confirmPredictions(acceptedPixels);
      renderer.renderPixels(acceptedPixels, false);
    }

    const pixelLocations = (brush)
      ? requestedPixels
      : pixels.map(([offset]) => [i, j, offset]);
    if (pxlCnt < requestedPixels.length) {
      /*
       * one or more pixels didn't get set,
       * revert predictions and clean queue
       */
      const [pixelI, pixelJ, offset] = pixelLocations[pxlCnt];
      this.revertPredictionsAt(pixelI, pixelJ, offset);
      this.pixelQueue = [];
    }

    let errorTitle = null;
    let msg = null;
    let type = 'error';
    switch (retCode) {
      case 0:
        break;
      case 1:
        errorTitle = t`Invalid Canvas`;
        msg = t`This canvas doesn't exist`;
        break;
      case 2:
        errorTitle = t`Invalid Coordinates`;
        msg = t`x out of bounds`;
        break;
      case 3:
        errorTitle = t`Invalid Coordinates`;
        msg = t`y out of bounds`;
        break;
      case 4:
        errorTitle = t`Invalid Coordinates`;
        msg = t`z out of bounds`;
        break;
      case 5:
        errorTitle = t`Wrong Color`;
        msg = t`Invalid color selected`;
        break;
      case 6:
        errorTitle = t`Just for registered Users`;
        msg = t`You have to be logged in to place on this canvas`;
        break;
      case 7:
        errorTitle = t`Not allowed`;
        // eslint-disable-next-line max-len
        msg = t`You can not access this canvas yet, because your pixel score is too low`;
        break;
      case 8:
        if (Date.now() - lastProtectedPixelNoticeAt >= 3000) {
          lastProtectedPixelNoticeAt = Date.now();
          store.dispatch(notify(t`Pixel protected`));
        }
        break;
      case 9:
        // A cooldown is already pending for the remaining queued pixels.
        break;
      case 10:
        errorTitle = 'Captcha';
        msg = t`Please prove that you are human`;
        type = 'captcha';
        break;
      case 11:
        errorTitle = t`Not allowed`;
        msg = t`You are using a Proxy.`;
        break;
      case 12:
        errorTitle = t`Not allowed`;
        msg = t`Just the Top10 of yesterday can place here`;
        break;
      case 13:
        errorTitle = t`You are weird`;
        // eslint-disable-next-line max-len
        msg = t`Server got confused by your pixels. Are you playing on multiple devices?`;
        break;
      case 14:
        errorTitle = t`Banned`;
        type = 'ban';
        break;
      case 15:
        errorTitle = t`Range Banned`;
        msg = t`Your Internet Provider is banned from this game`;
        break;
      case 16:
        errorTitle = t`Timeout`;
        // eslint-disable-next-line max-len
        msg = t`Didn't get an answer from PixelStates. Try to refresh if this problem persists.`;
        break;
      case 17:
        errorTitle = t`Just for verified Users`;
        msg = t`Only verified Users are currently allowed to play.`;
        break;
      case 18:
        errorTitle = t`Blocked`;
        msg = t`You are currently not allowed to access this game.`;
        break;
      case 19:
        errorTitle = t`Territory protected by NAP`;
        msg = t`This territory is protected by a Non-Aggression Pact. The pixel was not placed.`;
        break;
      default:
        errorTitle = t`Weird`;
        msg = t`Couldn't set Pixel`;
    }

    const shouldShowAlert = retCode !== 19
      || Date.now() - lastNapAlertAt >= 3000;
    if ((msg || errorTitle) && shouldShowAlert) {
      if (retCode === 19) {
        lastNapAlertAt = Date.now();
      }
      store.dispatch(pAlert(
        (errorTitle || t`Error ${retCode}`),
        msg,
        type,
      ));
    }

    store.dispatch(receivePlacePixels(ret));
    queueMicrotask(this.requestFromQueue);
  }

  /*
   * Revert predictions starting at given pixel
   * @param i, j, offset data of the first pixel that got rejected
   */
  revertPredictionsAt(sI, sJ, sOffset) {
    const renderer = this.getRenderer();
    const { clientPredictions } = this;
    let p = 0;
    while (p < clientPredictions.length) {
      const predPxl = clientPredictions[p];
      if (predPxl[0] === sI
        && predPxl[1] === sJ
        && predPxl[2] === sOffset
      ) {
        break;
      }
      p += 1;
    }

    const spliceIndex = p;
    const restoredPixels = [];
    while (p < clientPredictions.length) {
      const [i, j, offset, color] = clientPredictions[p];
      restoredPixels.push([i, j, offset, color]);
      p += 1;
    }

    this.clientPredictions.splice(spliceIndex);
    if (restoredPixels.length) renderer.renderPixels(restoredPixels);
  }

  confirmPredictions(pixels) {
    const confirmedPixels = new Map();
    pixels.forEach(([i, j, offset, color]) => {
      const key = `${i}:${j}:${offset}:${color}`;
      confirmedPixels.set(key, (confirmedPixels.get(key) || 0) + 1);
    });
    this.clientPredictions = this.clientPredictions.filter(([
      i, j, offset, , color,
    ]) => {
      const key = `${i}:${j}:${offset}:${color}`;
      const count = confirmedPixels.get(key) || 0;
      if (!count) return true;
      confirmedPixels.set(key, count - 1);
      return false;
    });
  }

  /*
   * got pixel update from websocket
   */
  receivePixelUpdate({
    i,
    j,
    pixels,
  }) {
    if (this.extension) {
      this.extension(i, j, pixels);
    }
    pixels.forEach((pxl) => {
      const [offset, color] = pxl;
      const localKey = `${i}:${j}:${offset}`;
      const localPixel = this.recentLocalPixels.get(localKey);
      if (localPixel) {
        this.recentLocalPixels.delete(localKey);
        if (localPixel.expiresAt >= Date.now() && localPixel.color === color) {
          return;
        }
      }
      const { clientPredictions } = this;
      for (let p = 0; p < clientPredictions.length; p += 1) {
        const predPxl = clientPredictions[p];
        if (predPxl[0] === i
          && predPxl[1] === j
          && predPxl[2] === offset
        ) {
          if (predPxl[4] === color) {
            clientPredictions.splice(p, 1);
          } else {
            predPxl[3] = color;
          }
          return;
        }
      }
      this.getRenderer().renderPixel(i, j, offset, color, true);
    });
  }

  /*
   * try to place a pixel
   */
  tryPlacePixel(
    i,
    j,
    offset,
    color,
    curColor,
  ) {
    this.getRenderer().renderPixel(i, j, offset, color);
    this.clientPredictions.push([i, j, offset, curColor, color]);
    const { pixelQueue } = this;

    if (pixelQueue.length) {
      const lastReq = pixelQueue[pixelQueue.length - 1];
      const { i: lastI, j: lastJ } = lastReq;
      if (i === lastI && j === lastJ) {
        /* append to last request in queue if same chunk */
        lastReq.pixels.push([offset, color]);
        return;
      }
    }

    pixelQueue.push({
      i,
      j,
      pixels: [[offset, color]],
    });

    if (!this.store.getState().canvas.fetchingPixel) {
      this.requestFromQueue();
    }
  }

  tryPlaceBrush(
    i,
    j,
    offset,
    size,
    color,
    brushPixels,
    templateColors = null,
    templateMask = null,
  ) {
    const renderer = this.getRenderer();
    const predictedPixels = brushPixels.map(([
      pixelI, pixelJ, pixelOffset, existingColor, targetColor,
    ]) => {
      const nextColor = targetColor ?? color;
      this.clientPredictions.push([
        pixelI,
        pixelJ,
        pixelOffset,
        existingColor,
        nextColor,
      ]);
      return [pixelI, pixelJ, pixelOffset, nextColor];
    });
    renderer.renderPixels(predictedPixels);
    const pixelQueueEntry = {
      i,
      j,
      brush: {
        offset, size, color, templateColors, templateMask,
      },
      pixels: predictedPixels,
    };
    this.pixelQueue.push(pixelQueueEntry);

    if (!this.store.getState().canvas.fetchingPixel) {
      if (!this.brushRequestScheduled) {
        this.brushRequestScheduled = true;
        requestAnimationFrame(() => {
          this.brushRequestScheduled = false;
          this.requestFromQueue();
        });
      }
    }
  }
}

export default new PixelTransferController();
