/*
 * placeholder that shows underneath cursor
 *
 */

import templateLoader from './templateLoader.js';
import {
  getBrushPixels,
  screenToWorld,
  worldToScreen,
} from '../core/utils.js';
import { TILE_SIZE } from '../core/constants.js';
import { getProtectedTerritory } from '../core/factionTerritoryClient.js';

const PLACEHOLDER_SIZE = 1.2;
const PLACEHOLDER_BORDER = 1;
const BRUSH_MOTION_SMOOTHING = 26;
let brushMotion = null;

function getBrushMotionOffset(state, now) {
  const { hover, brushSize, canvasId } = state.canvas;
  const reset = !brushMotion
    || brushMotion.canvasId !== canvasId
    || brushMotion.brushSize !== brushSize
    || now - brushMotion.lastFrame > 150;

  if (reset) {
    brushMotion = {
      canvasId,
      brushSize,
      x: hover[0],
      y: hover[1],
      lastFrame: now,
    };
  } else {
    const elapsed = Math.max(0, Math.min(now - brushMotion.lastFrame, 50));
    const progress = 1 - Math.exp(-elapsed / BRUSH_MOTION_SMOOTHING);
    const distanceX = hover[0] - brushMotion.x;
    const distanceY = hover[1] - brushMotion.y;
    brushMotion.x += distanceX * progress;
    brushMotion.y += distanceY * progress;
    if (Math.abs(distanceX) < 0.01) brushMotion.x = hover[0];
    if (Math.abs(distanceY) < 0.01) brushMotion.y = hover[1];
    brushMotion.lastFrame = now;
  }

  return [brushMotion.x - hover[0], brushMotion.y - hover[1]];
}

export function snapBrushMotion(state, cell) {
  const { brushSize, canvasId } = state.canvas;
  if (!brushMotion
    || brushMotion.canvasId !== canvasId
    || brushMotion.brushSize !== brushSize
  ) {
    brushMotion = {
      canvasId,
      brushSize,
      x: cell[0],
      y: cell[1],
      lastFrame: 0,
    };
  } else {
    brushMotion.x = cell[0];
    brushMotion.y = cell[1];
  }
  brushMotion.lastFrame = performance.now();
}

function renderProtectionTooltip(context, viewport, x, y, territory) {
  if (!territory) return;
  const tag = territory.tag ? ` [${territory.tag}]` : '';
  const label = `Территория союзника${tag} (НАП)`;
  context.save();
  context.font = '12px sans-serif';
  const width = context.measureText(label).width + 16;
  const height = 24;
  const left = Math.max(4, Math.min(viewport.width - width - 4, x + 12));
  const top = Math.max(
    4,
    Math.min(viewport.height - height - 4, y - height - 8),
  );
  context.fillStyle = 'rgba(18, 28, 42, 0.94)';
  context.fillRect(left, top, width, height);
  context.fillStyle = '#fff';
  context.textBaseline = 'middle';
  context.fillText(label, left + 8, top + height / 2);
  context.restore();
}

function renderBrushPlaceholder(
  state,
  context,
  viewport,
  view,
  scale,
) {
  const {
    hover,
    palette,
    selectedColor,
    brushSize,
    canvasSize,
  } = state.canvas;
  const cells = getBrushPixels(canvasSize, hover[0], hover[1], brushSize);
  if (!cells.length) {
    return;
  }
  const screenCells = [];
  const animateBrush = state.gui.animateBrush && !state.gui.holdPaint;
  const [offsetX, offsetY] = animateBrush
    ? getBrushMotionOffset(state, performance.now())
    : [0, 0];
  if (!animateBrush) {
    brushMotion = null;
  }
  for (const [, , , worldX, worldY] of cells) {
    const [x, y] = worldToScreen(
      view,
      scale,
      viewport,
      [worldX + offsetX, worldY + offsetY],
    );
    screenCells.push({
      x,
      y,
      worldX,
      worldY,
    });
  }
  const styles = getComputedStyle(document.documentElement);
  const outlineColor = styles.getPropertyValue('--brush-preview-outline').trim()
    || '#111';
  const haloColor = styles.getPropertyValue('--brush-preview-halo').trim()
    || '#fff';
  const fillOpacity = Number.parseFloat(
    styles.getPropertyValue('--brush-preview-opacity'),
  ) || 0.62;
  let protectedTerritory = null;
  for (const { worldX, worldY } of screenCells) {
    protectedTerritory = getProtectedTerritory(
      state.canvas.canvasId,
      Math.floor(worldX),
      Math.floor(worldY),
    );
    if (protectedTerritory) {
      break;
    }
  }
  const inProtectedTerritory = !!protectedTerritory;
  const cursorColor = inProtectedTerritory
    ? '#3987e8'
    : palette.colors[selectedColor];
  const cursorOutlineColor = inProtectedTerritory ? '#0759bd' : outlineColor;
  const left = Math.min(...screenCells.map(({ x }) => x));
  const top = Math.min(...screenCells.map(({ y }) => y));
  const right = Math.max(...screenCells.map(({ x }) => x)) + scale;
  const bottom = Math.max(...screenCells.map(({ y }) => y)) + scale;
  const borderWidth = Math.max(1, Math.floor(scale / 8));

  context.save();
  context.fillStyle = cursorColor;
  context.globalAlpha = fillOpacity;
  screenCells.forEach(({ x, y }) => {
    context.fillRect(x, y, scale, scale);
  });

  if (scale >= 3) {
    context.globalAlpha = 0.7;
    context.fillStyle = cursorOutlineColor;
    screenCells.forEach(({ x, y }) => {
      if (x > left) context.fillRect(x, y, 1, scale);
      if (y > top) context.fillRect(x, y, scale, 1);
    });
  }

  context.globalAlpha = 1;
  context.lineWidth = borderWidth + 2;
  context.strokeStyle = haloColor;
  context.strokeRect(
    left - borderWidth,
    top - borderWidth,
    right - left + (borderWidth * 2),
    bottom - top + (borderWidth * 2),
  );
  context.lineWidth = borderWidth;
  context.strokeStyle = cursorOutlineColor;
  context.strokeRect(
    left - borderWidth,
    top - borderWidth,
    right - left + (borderWidth * 2),
    bottom - top + (borderWidth * 2),
  );
  context.restore();
  renderProtectionTooltip(context, viewport, left, top, protectedTerritory);
}

export function renderPlaceholder(
  state,
  $viewport,
  view,
  scale,
) {
  const viewportCtx = $viewport.getContext('2d');

  const { hover, palette, selectedColor, brushSize } = state.canvas;

  if (brushSize > 1) {
    renderBrushPlaceholder(
      state,
      viewportCtx,
      $viewport,
      view,
      scale,
    );
    return;
  }
  const [sx, sy] = worldToScreen(view, scale, $viewport, hover);
  const protectedTerritory = getProtectedTerritory(
    state.canvas.canvasId, hover[0], hover[1],
  );

  viewportCtx.save();
  viewportCtx.translate(sx + (scale / 2), sy + (scale / 2));
  const angle = Math.sin(Date.now() / 250) / 4;
  viewportCtx.rotate(angle);
  viewportCtx.fillStyle = '#000';
  viewportCtx.fillRect(
    -(scale * (PLACEHOLDER_SIZE / 2)) - PLACEHOLDER_BORDER,
    -(scale * (PLACEHOLDER_SIZE / 2)) - PLACEHOLDER_BORDER,
    (scale * PLACEHOLDER_SIZE) + (2 * PLACEHOLDER_BORDER),
    (scale * PLACEHOLDER_SIZE) + (2 * PLACEHOLDER_BORDER),
  );
  viewportCtx.fillStyle = protectedTerritory
    ? '#3987e8' : palette.colors[selectedColor];
  viewportCtx.fillRect(
    -scale * (PLACEHOLDER_SIZE / 2),
    -scale * (PLACEHOLDER_SIZE / 2),
    scale * PLACEHOLDER_SIZE,
    scale * PLACEHOLDER_SIZE,
  );
  viewportCtx.restore();
  renderProtectionTooltip(
    viewportCtx,
    $viewport,
    sx + scale,
    sy,
    protectedTerritory,
  );
}


export function renderPotatoPlaceholder(
  state,
  $viewport,
  view,
  scale,
) {
  const viewportCtx = $viewport.getContext('2d');

  const { palette, selectedColor, hover } = state.canvas;
  if (state.canvas.brushSize > 1) {
    renderBrushPlaceholder(state, viewportCtx, $viewport, view, scale);
    return;
  }

  const [sx, sy] = worldToScreen(view, scale, $viewport, hover);
  const protectedTerritory = getProtectedTerritory(
    state.canvas.canvasId, hover[0], hover[1],
  );

  viewportCtx.save();
  viewportCtx.fillStyle = '#000';
  viewportCtx.fillRect(sx - 1, sy - 1, 4, scale + 2);
  viewportCtx.fillRect(sx - 1, sy - 1, scale + 2, 4);
  viewportCtx.fillRect(sx + scale - 2, sy - 1, 4, scale + 2);
  viewportCtx.fillRect(sx - 1, sy + scale - 2, scale + 1, 4);
  viewportCtx.fillStyle = protectedTerritory ? '#3987e8' : palette.colors[selectedColor];
  viewportCtx.fillRect(sx, sy, 2, scale);
  viewportCtx.fillRect(sx, sy, scale, 2);
  viewportCtx.fillRect(sx + scale - 1, sy, 2, scale);
  viewportCtx.fillRect(sx, sy + scale - 1, scale, 2);
  viewportCtx.restore();
  renderProtectionTooltip(
    viewportCtx,
    $viewport,
    sx + scale,
    sy,
    protectedTerritory,
  );
}


export function renderGrid(
  state,
  $viewport,
  view,
  scale,
  isLightGrid,
) {
  const { width, height } = $viewport;

  const viewportCtx = $viewport.getContext('2d');
  if (!viewportCtx) return;

  viewportCtx.globalAlpha = 0.5;
  viewportCtx.fillStyle = (isLightGrid) ? '#DDDDDD' : '#222222';

  let [xoff, yoff] = screenToWorld(view, scale, $viewport, [0, 0])
    .map(Math.floor);
  let [x, y] = worldToScreen(view, scale, $viewport, [xoff, yoff]);

  for (; x < width; x += scale) {
    const thick = (xoff++ % 10 === 0) ? 2 : 1;
    viewportCtx.fillRect(x, 0, thick, height);
  }

  for (; y < height; y += scale) {
    const thick = (yoff++ % 10 === 0) ? 2 : 1;
    viewportCtx.fillRect(0, y, width, thick);
  }

  viewportCtx.globalAlpha = 1;
}

/*
 * Overlay draws onto offscreen canvas, so its doing weirder math
 */
export function renderOverlay(
  state,
  $canvas,
  centerChunk,
  scale,
  tiledScale,
  scaleThreshold,
) {
  if (!templateLoader.ready || scale < 0.035) return;
  const { canvasSize, canvasId } = state.canvas;
  // world coordinates of center of center chunk
  const [x, y] = centerChunk
    .map((z) => z * TILE_SIZE / tiledScale
      + TILE_SIZE / 2 / tiledScale - canvasSize / 2);

  // if scale > scaleThreshold, then scaling happens in renderer
  // instead of offscreen canvas
  const offscreenScale = (scale > scaleThreshold) ? 1.0 : scale;

  const { width, height } = $canvas;
  const horizontalRadius = width / 2 / offscreenScale;
  const verticalRadius = height / 2 / offscreenScale;
  const templates = templateLoader.getTemplatesInView(
    canvasId, x, y, horizontalRadius, verticalRadius,
  );

  if (!templates.length) return;
  const context = $canvas.getContext('2d');
  if (!context) return;

  context.imageSmoothingEnabled = false;
  context.save();
  context.scale(offscreenScale, offscreenScale);
  context.globalAlpha = state.templates.oOpacity / 100;
  for (const template of templates) {
    if (template.width * offscreenScale < 1
      || template.height * offscreenScale < 1
    ) continue;

    const image = templateLoader.getTemplateSync(template.imageId);
    if (!image) continue;

    context.drawImage(
      image,
      template.x - x + width / 2 / offscreenScale,
      template.y - y + height / 2 / offscreenScale,
    );
  }
  context.restore();
}

/*
 * Small pixel overlay draws into viewport, because it needs
 * high scale values
 */
export function renderSmallPOverlay(
  state,
  $viewport,
  view,
  scale,
) {
  if (!templateLoader.ready) return;
  const { canvasId } = state.canvas;
  const [x, y] = view;
  const { width, height } = $viewport;
  const horizontalRadius = width / 2 / scale;
  const verticalRadius = height / 2 / scale;
  const templates = templateLoader.getTemplatesInView(
    canvasId, x, y, horizontalRadius, verticalRadius,
  );

  if (!templates.length) return;
  const context = $viewport.getContext('2d');
  if (!context) return;

  const relScale = scale / 3;
  context.imageSmoothingEnabled = false;
  context.save();
  context.scale(relScale, relScale);
  for (const template of templates) {
    const image = templateLoader.getSmallTemplateSync(template.imageId);
    if (!image) continue;
    context.drawImage(image,
      (template.x - x) * 3 + width / 2 / relScale,
      (template.y - y) * 3 + height / 2 / relScale,
    );
  }
  context.restore();
}
