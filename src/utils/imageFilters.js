/*
 * Image scaling, quantization, and grid helpers for Converter
 */

export const ColorDistanceCalculators = [
  'Euclidean',
  'Manhattan',
  'CIE94',
];

export const ImageQuantizerKernels = [
  'Nearest',
  'FloydSteinberg',
  'Atkinson',
];

export function scaleImage(sourceCanvas, width, height, aa = true) {
  const target = document.createElement('canvas');
  target.width = Math.max(1, Math.round(Number(width) || sourceCanvas.width));
  target.height = Math.max(1, Math.round(Number(height) || sourceCanvas.height));
  const ctx = target.getContext('2d');
  ctx.imageSmoothingEnabled = Boolean(aa);
  ctx.drawImage(sourceCanvas, 0, 0, target.width, target.height);
  return target;
}

export function quantizeImage(sourceCanvas, palette) {
  const target = document.createElement('canvas');
  target.width = sourceCanvas.width;
  target.height = sourceCanvas.height;
  const ctx = target.getContext('2d');
  ctx.drawImage(sourceCanvas, 0, 0);
  if (!Array.isArray(palette) || palette.length === 0) return target;

  const img = ctx.getImageData(0, 0, target.width, target.height);
  const { data } = img;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    let best = palette[0];
    let bestDist = Infinity;
    for (let p = 0; p < palette.length; p += 1) {
      const c = palette[p];
      const dr = data[i] - c[0];
      const dg = data[i + 1] - c[1];
      const db = data[i + 2] - c[2];
      const d = dr * dr + dg * dg + db * db;
      if (d < bestDist) {
        bestDist = d;
        best = c;
      }
    }
    [data[i], data[i + 1], data[i + 2]] = best;
  }
  ctx.putImageData(img, 0, 0);
  return target;
}

export function addGrid(sourceCanvas, scale = 4) {
  const factor = Math.max(2, Number(scale) || 4);
  const target = document.createElement('canvas');
  target.width = sourceCanvas.width * factor;
  target.height = sourceCanvas.height * factor;
  const ctx = target.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sourceCanvas, 0, 0, target.width, target.height);
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= target.width; x += factor) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, target.height);
    ctx.stroke();
  }
  for (let y = 0; y <= target.height; y += factor) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(target.width, y);
    ctx.stroke();
  }
  return target;
}
