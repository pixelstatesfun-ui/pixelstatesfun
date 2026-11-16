/*
 * this is the actual event
 * A ever growing circle of random pixels starts at event area
 * users fight it with background pixels
 * if it reaches the TARGET_RADIUS size, the event is lost
 *
 */
import socketEvents from '../socket/socketEvents.js';
import {
  hydratePixelUpdate,
} from '../socket/packets/server.js';
import RedisCanvas from '../data/redis/RedisCanvas.js';
import { setPixelByOffset } from './setPixel.js';
import { TILE_SIZE } from './constants.js';
import { CANVAS_ID } from '../data/redis/Event.js';
import canvases from './canvases.js';

const TARGET_RADIUS = 62;
const EVENT_SIZE = TILE_SIZE * 3;
const WATER_COLORS = new Set([0, 24]);
const WHITE_COLOR = 1;

class Void {
  // chunk coords
  i;
  j;
  // number highest possible colorIndex
  maxClr;
  // timeout between pixels in ms
  msTimeout;
  // Uint8Array to log pixels in area
  area;
  terrain;
  defenseWall;
  userArea;
  wallChanged;
  defeated;
  onDefeated;
  // current numerical data
  curRadius;
  curAngle;
  curAngleDelta;
  // boolean if ended
  ended;

  static async loadTerrain(centerCell) {
    const [centerI, centerJ] = centerCell;
    const chunks = await Promise.all(
      Array.from({ length: 9 }, (_, index) => (
        RedisCanvas.getChunk(
          CANVAS_ID,
          centerI + index % 3 - 1,
          centerJ + Math.floor(index / 3) - 1,
        )
      )),
    );
    const terrain = new Uint8Array(EVENT_SIZE * EVENT_SIZE);

    chunks.forEach((chunk, chunkIndex) => {
      if (!chunk) {
        return;
      }
      const chunkX = (chunkIndex % 3) * TILE_SIZE;
      const chunkY = Math.floor(chunkIndex / 3) * TILE_SIZE;
      for (let row = 0; row < TILE_SIZE; row += 1) {
        const start = row * TILE_SIZE;
        if (start >= chunk.length) {
          break;
        }
        const rowLength = Math.min(TILE_SIZE, chunk.length - start);
        const targetStart = (chunkY + row) * EVENT_SIZE + chunkX;
        for (let column = 0; column < rowLength; column += 1) {
          terrain[targetStart + column] = chunk[start + column] & 0x7f;
        }
      }
    });
    return terrain;
  }

  constructor(centerCell, targetDuration, terrain, onDefeated) {
    // chunk coordinates
    const [i, j] = centerCell;
    this.i = i;
    this.j = j;
    this.ended = false;
    this.maxClr = canvases[CANVAS_ID].colors.length;
    const area = TARGET_RADIUS ** 2 * Math.PI;
    const online = socketEvents.onlineCounter.total || 0;
    const pacingDuration = targetDuration + 5;
    const requiredSpeed = Math.min(Math.floor(online / 12), 80);
    const siteCooldown = Math.max(canvases[CANVAS_ID].bcd || 1000, 1);
    const cooldownMultiplier = Math.min(4, Math.max(1, 1000 / siteCooldown));
    const ppm = Math.ceil(
      (area / pacingDuration + requiredSpeed) * cooldownMultiplier,
    );
    this.msTimeout = Math.max(1, 60 * 1000 / ppm);
    this.area = new Uint8Array(EVENT_SIZE * EVENT_SIZE);
    this.terrain = terrain;
    this.defenseWall = new Uint8Array(EVENT_SIZE * EVENT_SIZE);
    this.userArea = new Uint8Array(EVENT_SIZE * EVENT_SIZE);
    this.wallChanged = false;
    this.defeated = false;
    this.onDefeated = onDefeated;
    this.curRadius = 0;
    this.curAngle = 0;
    this.curAngleDelta = Math.PI;

    this.voidLoop = this.voidLoop.bind(this);
    this.cancel = this.cancel.bind(this);
    this.checkStatus = this.checkStatus.bind(this);
    this.broadcastPixelBuffer = this.broadcastPixelBuffer.bind(this);
    socketEvents.addListener('pixelUpdate', this.broadcastPixelBuffer);
    this.voidLoop();
  }

  /*
   * send pixel relative to 3x3 tile area
   */
  sendPixel(x, y, clr) {
    const [u, v, off] = Void.coordsToOffset(x, y);
    const i = this.i + u;
    const j = this.j + v;
    this.area[x + y * EVENT_SIZE] = clr;
    setPixelByOffset(CANVAS_ID, clr, i, j, off);
  }

  /*
   * check if pixel is set by us
   * x, y relative to 3x3 tiles area
   */
  isSet(x, y, resetIfSet = false) {
    const off = x + y * EVENT_SIZE;
    const clr = this.area[off];
    if (clr) {
      if (resetIfSet) this.area[off] = 0;
      return true;
    }
    return false;
  }

  /*
   * check if pixel is set by user during event
   */
  isUserSet(x, y) {
    const off = x + y * EVENT_SIZE;
    const clr = this.userArea[off];
    return clr || false;
  }

  getVoidColor() {
    let color = 0;
    while (color <= 2 || color === 24 || color === 25) {
      color = Math.floor(Math.random() * this.maxClr);
    }
    return color;
  }

  static coordsToOffset(x, y) {
    const ox = x % TILE_SIZE;
    const oy = y % TILE_SIZE;
    const off = ox + oy * TILE_SIZE;
    const u = (x - ox) / TILE_SIZE - 1;
    const v = (y - oy) / TILE_SIZE - 1;
    return [u, v, off];
  }

  voidLoop() {
    if (this.ended || this.defeated) {
      return;
    }
    const clr = this.getVoidColor();
    // build in a circle
    /* that really is the best here */
    while (true) {
      this.curAngle += this.curAngleDelta;
      if (this.curAngle > 2 * Math.PI) {
        // it does skip some pixel, but that's ok
        this.curRadius += 1;
        if (this.curRadius > TARGET_RADIUS) {
          this.cancel();
          return;
        }
        this.curAngleDelta = 2 * Math.PI / (2 * this.curRadius * Math.PI);
        this.curAngle = 0;
      }
      const { curAngle, curRadius } = this;
      let gk = Math.sin(curAngle) * curRadius;
      let ak = Math.cos(curAngle) * curRadius;
      if (gk > 0) gk = Math.floor(gk);
      else gk = Math.ceil(gk);
      if (ak > 0) ak = Math.floor(ak);
      else ak = Math.ceil(ak);
      const x = ak + TILE_SIZE * 1.5;
      const y = gk + TILE_SIZE * 1.5;
      const areaOffset = x + y * EVENT_SIZE;
      if (this.isSet(x, y)) {
        continue;
      }
      if (this.defenseWall[areaOffset]) {
        setTimeout(this.voidLoop, this.msTimeout * 4);
        return;
      }
      this.sendPixel(x, y, clr);
      if (this.isUserSet(x, y)) {
        // if drawing on a user set pixel, wait longer
        setTimeout(this.voidLoop, this.msTimeout * 4);
        return;
      }
      break;
    }
    setTimeout(this.voidLoop, this.msTimeout);
  }

  cancel() {
    this.ended = true;
    socketEvents.removeListener('pixelUpdate', this.broadcastPixelBuffer);
  }

  checkStatus() {
    if (this.ended) {
      return 100;
    }
    return Math.floor(this.curRadius * 100 / TARGET_RADIUS);
  }

  checkContainment() {
    if (!this.wallChanged) {
      return false;
    }
    this.wallChanged = false;
    const visited = new Uint8Array(EVENT_SIZE * EVENT_SIZE);
    const queue = new Int32Array(EVENT_SIZE * EVENT_SIZE);
    let queueStart = 0;
    let queueEnd = 0;
    const enqueue = (offset) => {
      if (!this.defenseWall[offset] && !visited[offset]) {
        visited[offset] = 1;
        queue[queueEnd] = offset;
        queueEnd += 1;
      }
    };
    for (let coordinate = 0; coordinate < EVENT_SIZE; coordinate += 1) {
      enqueue(coordinate);
      enqueue((EVENT_SIZE - 1) * EVENT_SIZE + coordinate);
      enqueue(coordinate * EVENT_SIZE);
      enqueue(coordinate * EVENT_SIZE + EVENT_SIZE - 1);
    }

    while (queueStart < queueEnd) {
      const offset = queue[queueStart];
      queueStart += 1;
      const x = offset % EVENT_SIZE;
      const y = (offset - x) / EVENT_SIZE;
      if (x > 0) enqueue(offset - 1);
      if (x < EVENT_SIZE - 1) enqueue(offset + 1);
      if (y > 0) enqueue(offset - EVENT_SIZE);
      if (y < EVENT_SIZE - 1) enqueue(offset + EVENT_SIZE);
      if (x > 0 && y > 0) enqueue(offset - EVENT_SIZE - 1);
      if (x < EVENT_SIZE - 1 && y > 0) enqueue(offset - EVENT_SIZE + 1);
      if (x > 0 && y < EVENT_SIZE - 1) enqueue(offset + EVENT_SIZE - 1);
      if (x < EVENT_SIZE - 1 && y < EVENT_SIZE - 1) {
        enqueue(offset + EVENT_SIZE + 1);
      }
    }

    for (let offset = 0; offset < this.area.length; offset += 1) {
      if (this.area[offset] && !visited[offset]) {
        this.defeated = true;
        this.onDefeated();
        return true;
      }
    }
    return false;
  }

  broadcastPixelBuffer(canvasId, chunkId, buffer) {
    if (String(canvasId) !== CANVAS_ID) {
      return;
    }
    const {
      i: pi,
      j: pj,
      pixels,
    } = hydratePixelUpdate(buffer);
    const { i, j } = this;
    // 3x3 chunk area (this is hardcoded on multiple places)
    if (pi >= i - 1 && pi <= i + 1 && pj >= j - 1 && pj <= j + 1) {
      pixels.forEach((pxl) => {
        const [off, color] = pxl;
        const uOff = (pi - i + 1) * TILE_SIZE;
        const vOff = (pj - j + 1) * TILE_SIZE;
        const x = uOff + off % TILE_SIZE;
        const y = vOff + Math.floor(off / TILE_SIZE);
        const areaOffset = x + y * EVENT_SIZE;
        const terrainColor = this.terrain[areaOffset];
        const isWater = WATER_COLORS.has(terrainColor);
        const isCorrectDefense = isWater
          ? color === WHITE_COLOR
          : WATER_COLORS.has(color);
        const isVoidUpdate = this.area[areaOffset] === color;
        this.userArea[areaOffset] = isVoidUpdate ? 0 : color;

        if (isCorrectDefense) {
          if (!this.defenseWall[areaOffset]) {
            this.defenseWall[areaOffset] = 1;
            this.wallChanged = true;
          }
          this.area[areaOffset] = 0;
        } else {
          if (this.defenseWall[areaOffset]) {
            this.defenseWall[areaOffset] = 0;
            this.wallChanged = true;
          }
          if (this.area[areaOffset] && !isVoidUpdate) {
            this.userArea[areaOffset] = 0;
            this.sendPixel(x, y, this.getVoidColor());
          }
        }
      });
      if (this.wallChanged) {
        this.checkContainment();
      }
    }
  }
}

export default Void;
