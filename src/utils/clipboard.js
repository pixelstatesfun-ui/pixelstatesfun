/*
 * Clipboard copy helper with fallback
 */

export default function copyTextToClipboard(text) {
  if (!text) return Promise.resolve(false);
  if (typeof navigator !== 'undefined' && navigator.clipboard
    && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(String(text))
      .then(() => true)
      .catch(() => false);
  }
  try {
    const el = document.createElement('textarea');
    el.value = String(text);
    el.setAttribute('readonly', '');
    el.style.position = 'absolute';
    el.style.left = '-9999px';
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
    return Promise.resolve(true);
  } catch {
    return Promise.resolve(false);
  }
}
