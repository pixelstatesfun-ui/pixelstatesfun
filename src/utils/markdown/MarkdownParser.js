/*
 * Lightweight markdown parser compatible with MdParagraph and Markdown.jsx
 */

export function parseParagraph(text) {
  if (text === null || text === undefined) {
    return [];
  }
  const str = String(text);
  const tokens = [];
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  let lastIndex = 0;
  let match = urlRegex.exec(str);

  while (match !== null) {
    if (match.index > lastIndex) {
      tokens.push(['t', str.slice(lastIndex, match.index)]);
    }
    tokens.push(['l', match[1], match[1]]);
    lastIndex = match.index + match[0].length;
    match = urlRegex.exec(str);
  }

  if (lastIndex < str.length) {
    tokens.push(['t', str.slice(lastIndex)]);
  }

  return tokens;
}

export function parse(text) {
  if (!text) return [];
  return String(text).split(/\n\n+/).map((block) => ['p', parseParagraph(block)]);
}
