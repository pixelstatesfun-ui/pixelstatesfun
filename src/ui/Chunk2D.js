import { TILE_SIZE } from '../core/constants.js';
import Chunk from './Chunk.js';


class Chunk2D extends Chunk {
  // HTMLCanvasElement of chunk
  image;
  // boolean if chunk loaded (request done)
  ready;
  // boolean if chunk is empty
  isEmpty;
  // palette of canvas
  palette;
  colorIndices = null;

  constructor(palette, zoom = 0, cx = 0, cy = 0) {
    super(zoom, cx, cy);
    this.palette = palette;
    this.image = document.createElement('canvas');
    // do NOT use willReadFrequently, it massively trashes Render2D.renderChunks
    this.image.getContext('2d');
    this.image.width = TILE_SIZE;
    this.image.height = TILE_SIZE;
    this.ready = false;
    this.isEmpty = false;
  }

  // from Uint8Array
  fromBuffer(chunkBuffer) {
    this.recUpdates = true;
    const imageData = new ImageData(TILE_SIZE, TILE_SIZE);
    const imageView = new Uint32Array(imageData.data.buffer);
    this.colorIndices = new Uint8Array(TILE_SIZE ** 2);
    const { abgr } = this.palette;
    let bufferLength = chunkBuffer.byteLength;
    for (let i = 0; i < bufferLength; i += 1) {
      const colorIndex = chunkBuffer[i] & 0x3F;
      this.colorIndices[i] = colorIndex;
      imageView[i] = abgr[colorIndex];
    }
    const neededLength = TILE_SIZE ** 2;
    const background = this.palette.abgr[0];
    while (bufferLength < neededLength) {
      this.colorIndices[bufferLength] = 0;
      imageView[bufferLength] = background;
      bufferLength += 1;
    }
    const ctx = this.image.getContext('2d');
    ctx.putImageData(imageData, 0, 0);
    this.ready = true;
  }

  preLoad(img, zoomDiffAbs, sx, sy) {
    if (this.ready) {
      return;
    }
    this.ready = true;
    const ctx = this.image.getContext('2d');
    ctx.save();
    ctx.msImageSmoothingEnabled = false;
    ctx.webkitImageSmoothingEnabled = false;
    ctx.imageSmoothingEnabled = false;
    ctx.scale(zoomDiffAbs, zoomDiffAbs);
    const sDim = TILE_SIZE / zoomDiffAbs;
    ctx.drawImage(img, sx, sy, sDim, sDim, 0, 0, sDim, sDim);
    ctx.restore();
  }

  fromImage(img) {
    this.ready = true;
    const ctx = this.image.getContext('2d');
    ctx.drawImage(img, 0, 0);
  }

  empty(transparent = false) {
    this.ready = true;
    this.isEmpty = true;
    this.colorIndices = new Uint8Array(TILE_SIZE ** 2);
    if (transparent) this.colorIndices.fill(255);
    if (!transparent) {
      const { image, palette } = this;
      const ctx = image.getContext('2d');
      ctx.fillStyle = palette.colors[0];
      ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
    }
  }

  static getIndexFromCell([x, y]) {
    return x + (TILE_SIZE * y);
  }

  getColorIndex(cell, nearest = true) {
    const colorIndices = this.ensureColorIndices();
    if (!colorIndices) return null;
    const index = colorIndices[Chunk2D.getIndexFromCell(cell)];
    if (!nearest && index === 255) return null;
    return index === 255 ? 0 : index;
  }

  ensureColorIndices() {
    if (this.colorIndices || !this.ready || this.isEmpty) {
      return this.colorIndices;
    }

    const imageData = this.image.getContext('2d').getImageData(
      0,
      0,
      TILE_SIZE,
      TILE_SIZE,
    );
    const { data } = imageData;
    const indices = new Uint8Array(TILE_SIZE ** 2);
    for (let index = 0; index < indices.length; index += 1) {
      const offset = index * 4;
      if (data[offset + 3] === 0) {
        indices[index] = 255;
        continue;
      }
      const exactIndex = this.palette.getIndexOfColor(
        data[offset],
        data[offset + 1],
        data[offset + 2],
      );
      indices[index] = exactIndex ?? this.palette.getClosestIndexOfColor(
        data[offset],
        data[offset + 1],
        data[offset + 2],
      );
    }
    this.colorIndices = indices;
    return indices;
  }

  getColorIndices(cells) {
    const indices = this.ensureColorIndices();
    if (!indices) return cells.map(() => null);
    return cells.map(([, x, y]) => {
      const index = indices[Chunk2D.getIndexFromCell([x, y])];
      return index === 255 ? 0 : index;
    });
  }

  hasColorIn(cell, color) {
    const index = Chunk2D.getIndexFromCell(cell);
    const colorIndices = this.ensureColorIndices();
    return colorIndices ? colorIndices[index] === color : false;
  }

  setColor(cell, color) {
    const [x, y] = cell;
    const ctx = this.image.getContext('2d');
    ctx.fillStyle = this.palette.colors[color];
    ctx.fillRect(x, y, 1, 1);
    if (this.colorIndices) {
      this.colorIndices[Chunk2D.getIndexFromCell(cell)] = color;
    }
    return true;
  }

  setColors(pixels) {
    const ctx = this.image.getContext('2d');
    pixels.forEach(([x, y, color]) => {
      ctx.fillStyle = this.palette.colors[color];
      ctx.fillRect(x, y, 1, 1);
      if (this.colorIndices) {
        this.colorIndices[Chunk2D.getIndexFromCell([x, y])] = color;
      }
    });
  }
}

export default Chunk2D;
