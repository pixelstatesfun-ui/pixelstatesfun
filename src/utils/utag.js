/*
 * URL template tag helpers for API and CDN requests
 */

function interpolate(strings, values) {
  let out = strings[0] || '';
  for (let i = 0; i < values.length; i += 1) {
    out += String(values[i] ?? '');
    out += strings[i + 1] || '';
  }
  return out;
}

function getBase() {
  if (typeof window !== 'undefined' && window.ssv && window.ssv.basename) {
    return window.ssv.basename.replace(/\/+$/, '');
  }
  return '';
}

export function api(strings, ...values) {
  const path = interpolate(strings, values);
  if (/^https?:\/\//i.test(path)) {
    return path;
  }
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${getBase()}${normalized}`;
}

export function cdn(strings, ...values) {
  const path = interpolate(strings, values);
  if (/^https?:\/\//i.test(path) || path.startsWith('data:')) {
    return path;
  }
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${getBase()}${normalized}`;
}

export function u(strings, ...values) {
  return interpolate(strings, values);
}
