/*
 * Media ID and filename URL utilities
 */

export function getUrlsFromMediaIdAndName(mediaId, name = 'media') {
  if (!mediaId) {
    return [null, null, null];
  }
  const str = String(mediaId);
  if (str.startsWith('/') || /^https?:\/\//i.test(str)
    || str.startsWith('data:')) {
    return [str, str, str];
  }
  const encoded = encodeURIComponent(str);
  const safeName = encodeURIComponent(name || 'media');
  const full = `/api/media/${encoded}/${safeName}`;
  return [full, full, full];
}

export function getMediaDetailsFromUrl(url) {
  if (!url) {
    return ['', ''];
  }
  const parts = String(url).split('/').filter(Boolean);
  const title = parts[parts.length - 1] || 'media';
  const mediaId = parts.length >= 2 ? parts[parts.length - 2] : title;
  return [mediaId, title];
}

export function addIdToFilename(filename, id) {
  if (!filename) return String(id || '');
  if (!id) return filename;
  const dot = filename.lastIndexOf('.');
  if (dot <= 0) return `${filename}_${id}`;
  return `${filename.slice(0, dot)}_${id}${filename.slice(dot)}`;
}

export function extractIdFromFilename(filename) {
  if (!filename) return '';
  const match = String(filename).match(/_([a-zA-Z0-9:-]+)(?:\.[^.]+)?$/);
  return match ? match[1] : '';
}
