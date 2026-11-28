/*
 * Media ID and filename URL utilities
 */

export function splitFilename(filename) {
  const separator = filename.lastIndexOf('.');
  return [
    filename.substring(0, separator),
    filename.substring(separator + 1),
  ];
}

export function addIdToFilename(filename, id) {
  id = String(id);
  const extSeparator = filename.lastIndexOf('.');
  if (extSeparator === -1) {
    return `${filename}:${id}`;
  }
  return `${filename.substring(0, extSeparator)}:${id
  }${filename.substring(extSeparator)}`;
}

export function extractIdFromFilename(filename) {
  const idSeparator = filename.lastIndexOf(':');
  if (idSeparator === -1) {
    return [filename, null];
  }
  let extSeparator = filename.indexOf('.', idSeparator + 1);
  if (extSeparator === -1) {
    extSeparator = filename.length;
  }
  return [
    filename.substring(0, idSeparator) + filename.substring(extSeparator),
    parseInt(filename.substring(idSeparator + 1, extSeparator), 10),
  ];
}

export function getMediaDetailsFromUrl(url) {
  if (url?.startsWith('/m/') && url[4] !== '/' && url[9] === '/') {
    const shortId = url.substring(3, 9);
    let extEnd = url.indexOf('&', 10);
    if (extEnd === -1) {
      extEnd = url.length;
    }
    const extStart = url.lastIndexOf('.', extEnd) + 1;
    const extension = url.substring(extStart, extEnd);
    const name = decodeURIComponent(url.substring(10, extStart - 1));
    return [`${shortId}:${extension}`, name];
  }
  return [null, null];
}

export function getUrlFromMediaIdAndName(mediaId, name) {
  return getUrlsFromMediaIdAndName(mediaId, name)[0];
}

export function getUrlsFromMediaIdAndName(mediaId, name = 'm') {
  if (typeof mediaId !== 'string' || !mediaId) {
    return [null, null, null];
  }
  if (mediaId.startsWith('/') || /^https?:\/\//i.test(mediaId)
    || mediaId.startsWith('data:')) {
    return [mediaId, mediaId, mediaId];
  }
  const [shortId, extension] = mediaId.split(':');
  if (!shortId || !extension) {
    return [null, null, null];
  }
  const safeName = encodeURIComponent(name || 'm');
  if (/^[a-zA-Z0-9]{6}$/.test(shortId)) {
    return [
      `/m/${shortId}/${safeName}.${extension}`,
      `/m/t/${shortId}/${safeName}.${extension}.webp`,
      `/m/i/${shortId}/${safeName}.${extension}.webp`,
    ];
  }
  const previewUrl = `/api/media/${encodeURIComponent(mediaId)}/${safeName}`;
  return [previewUrl, previewUrl, previewUrl];
}
