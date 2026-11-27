/*
 * Image file to HTMLCanvasElement helper for Converter
 */

export async function fileToCanvas(file) {
  if (!file) return null;
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return canvas;
}

export default { fileToCanvas };
