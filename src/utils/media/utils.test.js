import test from 'node:test';
import assert from 'node:assert/strict';

import {
  addIdToFilename,
  extractIdFromFilename,
  getMediaDetailsFromUrl,
  getUrlFromMediaIdAndName,
  getUrlsFromMediaIdAndName,
  splitFilename,
} from './utils.js';

test('splits a media filename into its name and extension', () => {
  assert.deepEqual(splitFilename('pixel-art.png'), ['pixel-art', 'png']);
});

test('preserves legacy uploaded-media URLs and filename IDs', () => {
  assert.deepEqual(
    getUrlsFromMediaIdAndName('a1b2c3:png', 'avatar'),
    [
      '/m/a1b2c3/avatar.png',
      '/m/t/a1b2c3/avatar.png.webp',
      '/m/i/a1b2c3/avatar.png.webp',
    ],
  );
  assert.deepEqual(
    getMediaDetailsFromUrl('/m/a1b2c3/avatar.png'),
    ['a1b2c3:png', 'avatar'],
  );
  assert.equal(
    getUrlFromMediaIdAndName('a1b2c3:png', 'banner'),
    '/m/a1b2c3/banner.png',
  );
  const filename = addIdToFilename('avatar.png', 7);
  assert.equal(filename, 'avatar:7.png');
  assert.deepEqual(extractIdFromFilename(filename), ['avatar.png', 7]);
});

test('uses the preview media endpoint for generated emblems', () => {
  assert.deepEqual(
    getUrlsFromMediaIdAndName('emblem-nvg:svg', 'avatar'),
    [
      '/api/media/emblem-nvg%3Asvg/avatar',
      '/api/media/emblem-nvg%3Asvg/avatar',
      '/api/media/emblem-nvg%3Asvg/avatar',
    ],
  );
});
