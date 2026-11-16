
/*
 * Worker thread for creating Captchas
 * Colorful characters on a light pink background
 */

import fs from 'fs';
import path from 'path';
import { randomInt } from 'crypto';
import ppfunCaptcha from 'ppfun-captcha';
import { isMainThread, parentPort } from 'worker_threads';

import { getRandomString } from '../core/utils.js';
import filter from '../funcs/captchaFilter.js';

const FONT_FOLDER = path.resolve(__dirname, '..', 'captchaFonts');

const CAPTCHA_CHARACTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const CAPTCHA_COLORS = [
  '#E53935',
  '#1976D2',
  '#00897B',
  '#F57C00',
  '#8E24AA',
  '#D81B60',
];

function randomBetween(min, max) {
  return min + (Math.random() * (max - min));
}

function randomIntInclusive(min, max) {
  return randomInt(min, max + 1);
}

/*
 * Create CAPTCHA
 */
function createCaptcha() {
  let text = '';

  for (let i = 0; i < 6; i += 1) {
    text += CAPTCHA_CHARACTERS[randomInt(CAPTCHA_CHARACTERS.length)];
  }

  const width = 500;
  const height = 180;
  const glyphWidth = 110;
  const glyphHeight = 135;
  const captchaFont = font[0];

  const glyphs = [];

  for (let i = 0; i < text.length; i += 1) {
    const angle = randomIntInclusive(-8, 8);
    const scaleX = randomBetween(0.95, 1.05).toFixed(2);
    const scaleY = randomBetween(0.95, 1.05).toFixed(2);

    const color = CAPTCHA_COLORS[i % CAPTCHA_COLORS.length];

    const captcha = ppfunCaptcha.createCaptcha(text[i], {
      width: glyphWidth,
      height: glyphHeight,
      fontSize: 85,
      stroke: color,
      fill: color,
      nodeDeviation: 1.2,
      connectionPathDeviation: 2.4,
      style: 'stroke-width: 1.2; stroke-linecap: round; '
        + 'stroke-linejoin: round;',
      font: captchaFont,
      filter,
    });

    const pathMatch = captcha.match(/<path\b[^>]*\sd="([^"]+)"/);

    if (!pathMatch) {
      throw new Error('Could not generate CAPTCHA character path');
    }

    const centerX = 55 + (i * 78);
    const centerY = randomBetween(85, 100).toFixed(1);

    glyphs.push(
      `<g transform="translate(${centerX},${centerY}) `
      + `rotate(${angle}) scale(${scaleX},${scaleY})">`
      + `<g transform="translate(${-glyphWidth / 2},${-glyphHeight / 2})">`
      + `<path d="${pathMatch[1]}" fill="${color}" `
      + `stroke="${color}" stroke-width="2" `
      + 'stroke-linejoin="round"/>'
      + '</g></g>',
    );
  }

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" `
    + `width="${width}" height="${height}" `
    + `viewBox="0 0 ${width} ${height}">`,

    '<rect width="100%" height="100%" fill="#FFF0F5"/>',

    glyphs.join(''),

    '</svg>',
  ].join('');

  return {
    text,
    data: svg,
  };
}

/*
 * Check worker thread
 */
if (isMainThread) {
  throw new Error(
    'CaptchaLoader is run as a worker thread, not as own process',
  );
}

let font;

/*
 * Load CAPTCHA fonts
 */
function setCaptchaFonts(fontFilenames) {
  let newFont = fontFilenames
    .map((f) => path.join(FONT_FOLDER, f))
    .filter((f) => fs.existsSync(f));

  /*
   * Default to first three files if none are available
   */
  if (!newFont.length) {
    newFont = fs.readdirSync(FONT_FOLDER)
      .filter((e) => e.endsWith('.ttf') || e.endsWith('.otf'))
      .slice(0, 3)
      .map((f) => path.join(FONT_FOLDER, f));
  }

  font = newFont.map((f) => ppfunCaptcha.loadFont(f));

  console.info(
    `CAPTCHAS: change fonts to ${newFont.map((f) => f.slice(-18)).join(',')}`,
  );
}

/*
 * Worker messages
 */
parentPort.on('message', (msg) => {
  try {
    if (msg === 'createCaptcha') {
      if (!font?.length) {
        throw new Error('No Fonts Loaded');
      }

      const captcha = createCaptcha();
      const captchaid = getRandomString();

      parentPort.postMessage([
        null,
        captcha.text,
        captcha.data,
        captchaid,
      ]);

      return;
    }

    const comma = msg.indexOf(',');

    if (comma === -1) {
      throw new Error('No comma');
    }

    const key = msg.slice(0, comma);
    const val = JSON.parse(msg.slice(comma + 1));

    switch (key) {
      case 'setCaptchaFonts': {
        setCaptchaFonts(val);
        break;
      }

      default:
        break;
    }
  } catch (error) {
    console.warn(
      `CAPTCHAS: Error on ${msg}: ${error.message}`,
    );

    parentPort.postMessage(['Failure!']);
  }
});
