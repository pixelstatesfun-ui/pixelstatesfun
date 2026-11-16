import express from 'express';
import busboy from 'busboy';
import { randomUUID } from 'crypto';
import {
  mkdir, readFile, readdir, rename, unlink, writeFile,
} from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import sharp from 'sharp';

import { USERLVL } from '../../core/constants.js';

const router = express.Router();
const emojiDirectories = [
  path.resolve('emodge'),
  path.resolve('..', 'emodge'),
];
const emojiDirectory = emojiDirectories.find((directory) => (
  existsSync(directory)
)) || emojiDirectories[0];
const categoryFile = path.join(emojiDirectory, 'categories.json');
const categories = new Set([
  'flags', 'unsorted', 'animated', 'best-flags', 'hedge', 'pepe', 'wojak',
]);
const acceptedFilename = new RegExp(
  '^(?:blob_\\d{4}|emodge\\d+|emoji_[a-f0-9-]{36})\\.(?:gif|webp|png)$',
);
const acceptedCode = /^[A-Z0-9_]{1,32}$/;
const maxUploadBytes = 2 * 1024 * 1024;
let catalogWrite = Promise.resolve();

function normalizeCode(value) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32) || 'EMOJI';
}

function uniqueCode(value, usedCodes) {
  const base = normalizeCode(value);
  let code = base;
  let suffix = 2;
  while (usedCodes.has(code)) {
    const suffixText = `_${suffix}`;
    code = `${base.slice(0, 32 - suffixText.length)}${suffixText}`;
    suffix += 1;
  }
  usedCodes.add(code);
  return code;
}

function createEmojiList(files, catalog) {
  const usedCodes = new Set();
  return files
    .filter((filename) => acceptedFilename.test(filename))
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
    .map((filename) => {
      const assetMatch = /^(?:emodge(\d+)|blob_(\d+))\.(?:gif|webp|png)$/
        .exec(filename);
      const assetNumber = assetMatch && Number(assetMatch[1] || assetMatch[2]);
      const legacyFilename = assetMatch?.[1]
        ? `blob_${String(assetNumber).padStart(4, '0')}${path.extname(filename)}`
        : null;
      const saved = catalog[filename] || (
        legacyFilename ? catalog[legacyFilename] : null
      );
      const defaultName = assetNumber
        ? `emodge${assetNumber}` : filename.replace(/\.[^.]+$/, '');
      const name = /^(?:blob_\d{4}|emodge\d+)$/i.test(saved?.name || '')
        ? defaultName
        : saved?.name || defaultName;
      const savedCode = acceptedCode.test(saved?.code || '')
        ? saved.code : name;
      const oldBlobCode = /^BLOB_(\d{4})$/i.exec(savedCode);
      const codeSource = oldBlobCode
        ? `emodge${Number(oldBlobCode[1])}` : savedCode;
      const category = saved?.category || (
        filename.endsWith('.gif') ? 'animated' : 'unsorted'
      );
      const code = uniqueCode(codeSource, usedCodes);
      return {
        filename,
        category: categories.has(category) ? category : 'unsorted',
        name,
        code,
      };
    });
}

async function readCatalog() {
  try {
    return JSON.parse(await readFile(categoryFile, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {};
    }
    throw error;
  }
}

function readUpload(req) {
  return new Promise((resolve, reject) => {
    let upload = false;
    let uploadError = null;
    let category = null;
    let originalName = '';
    const chunks = [];
    let size = 0;
    const parser = busboy({
      headers: req.headers,
      limits: { files: 1, fields: 1, fileSize: maxUploadBytes },
    });

    parser.on('file', (fieldName, stream, info) => {
      if (fieldName !== 'file' || upload) {
        uploadError = new Error('Expected one image file');
        stream.resume();
        return;
      }
      upload = true;
      originalName = info.filename;
      stream.on('data', (chunk) => {
        size += chunk.length;
        chunks.push(chunk);
      });
      stream.on('limit', () => {
        uploadError = new Error('Image exceeds the 2 MB limit');
      });
      stream.on('error', (error) => {
        uploadError = error;
      });
    });
    parser.on('field', (fieldName, value) => {
      if (fieldName === 'category') {
        category = value;
      } else {
        uploadError = new Error('Unknown form field');
      }
    });
    parser.on('filesLimit', () => {
      uploadError = new Error('Only one image can be uploaded at a time');
    });
    parser.on('fieldsLimit', () => {
      uploadError = new Error('Too many form fields');
    });
    parser.on('error', reject);
    parser.on('close', () => {
      if (uploadError) {
        reject(uploadError);
      } else if (!upload || !size) {
        reject(new Error('Choose an image to upload'));
      } else {
        resolve({ buffer: Buffer.concat(chunks), category, originalName });
      }
    });
    req.pipe(parser);
  });
}

router.get('/', async (req, res) => {
  req.tickRateLimiter(1000);
  const [files, catalog] = await Promise.all([
    readdir(emojiDirectory),
    readCatalog(),
  ]);
  const emojis = createEmojiList(files, catalog);
  res.set('Cache-Control', 'no-store');
  res.json({ emojis });
});

router.get('/code/:code', async (req, res) => {
  const code = req.params.code.toUpperCase();
  if (!acceptedCode.test(code)) {
    res.status(404).end();
    return;
  }
  const [files, catalog] = await Promise.all([
    readdir(emojiDirectory),
    readCatalog(),
  ]);
  const emoji = createEmojiList(files, catalog)
    .find((entry) => entry.code === code)
    || (() => {
      const legacyCode = /^BLOB_(\d{4})$/.exec(code);
      if (!legacyCode) {
        return null;
      }
      const baseName = `emodge${Number(legacyCode[1])}`;
      return createEmojiList(files, catalog)
        .find((entry) => entry.filename.startsWith(`${baseName}.`));
    })();
  if (!emoji) {
    res.status(404).end();
    return;
  }
  res.set('Cache-Control', 'public, max-age=3600');
  res.sendFile(path.join(emojiDirectory, emoji.filename), (error) => {
    if (error && !res.headersSent) {
      res.status(error.statusCode === 404 ? 404 : 500).end();
    }
  });
});

router.get('/file/:filename', (req, res) => {
  let { filename } = req.params;
  if (!acceptedFilename.test(filename)) {
    res.status(404).end();
    return;
  }
  const legacyMatch = /^blob_(\d{4})(\.(?:gif|webp|png))$/.exec(filename);
  if (legacyMatch) {
    filename = `emodge${Number(legacyMatch[1])}${legacyMatch[2]}`;
  }
  res.set('Cache-Control', 'public, max-age=3600');
  res.sendFile(path.join(emojiDirectory, filename), (error) => {
    if (error && !res.headersSent) {
      res.status(error.statusCode === 404 ? 404 : 500).end();
    }
  });
});

router.post('/move', async (req, res) => {
  req.tickRateLimiter(1000);
  const { t } = req.ttag;
  if (!req.user || req.user.userlvl < USERLVL.ADMIN) {
    res.status(403).json({
      errors: [t`Only administrators can manage chat emojis`],
    });
    return;
  }

  const { filenames, category } = req.body || {};
  if (!Array.isArray(filenames) || !filenames.length || filenames.length > 500
    || !filenames.every(
      (filename) => typeof filename === 'string'
        && acceptedFilename.test(filename),
    )
    || !categories.has(category)
  ) {
    res.status(400).json({ errors: [t`Invalid emoji selection or category`] });
    return;
  }

  try {
    const uniqueFilenames = [...new Set(filenames)];
    const files = await readdir(emojiDirectory);
    if (!uniqueFilenames.every((filename) => files.includes(filename))) {
      res.status(400).json({ errors: [t`One or more emojis no longer exist`] });
      return;
    }
    const write = catalogWrite.then(async () => {
      const catalog = await readCatalog();
      for (const filename of uniqueFilenames) {
        const legacyMatch = /^emodge(\d+)\.(gif|webp|png)$/.exec(filename);
        const oldFilename = legacyMatch
          ? `blob_${legacyMatch[1].padStart(4, '0')}.${legacyMatch[2]}`
          : null;
        catalog[filename] = {
          ...catalog[oldFilename],
          ...catalog[filename],
          category,
        };
        if (oldFilename) {
          delete catalog[oldFilename];
        }
      }
      const tempPath = `${categoryFile}.${randomUUID()}.tmp`;
      await writeFile(tempPath, JSON.stringify(catalog));
      await rename(tempPath, categoryFile);
    });
    catalogWrite = write.catch(() => undefined);
    await write;
    res.json({ moved: uniqueFilenames.length, category });
  } catch (error) {
    console.error(`Could not move chat emojis: ${error.message}`);
    res.status(500).json({ errors: [t`Could not move the selected emojis`] });
  }
});

router.post('/', async (req, res) => {
  req.tickRateLimiter(1000);
  const { t } = req.ttag;
  if (!req.user || req.user.userlvl < USERLVL.ADMIN) {
    res.status(403).json({
      errors: [t`Only administrators can add chat emojis`],
    });
    return;
  }

  let uploaded;
  try {
    uploaded = await readUpload(req);
  } catch (error) {
    res.status(400).json({ errors: [error.message] });
    return;
  }
  if (!categories.has(uploaded.category)) {
    res.status(400).json({ errors: [t`Choose a valid emoji category`] });
    return;
  }

  let metadata;
  try {
    metadata = await sharp(uploaded.buffer, { animated: true }).metadata();
  } catch {
    res.status(400).json({
      errors: [t`The uploaded file is not a supported image`],
    });
    return;
  }
  if (!['gif', 'webp', 'png'].includes(metadata.format)
    || !metadata.width || !metadata.height
    || metadata.width > 512 || metadata.height > 512
    || (metadata.pages && metadata.pages > 100)
  ) {
    res.status(400).json({
      errors: [
        t`Images must be GIF, WebP, or PNG and no larger than 512 × 512`,
      ],
    });
    return;
  }

  const filename = `emoji_${randomUUID()}.${metadata.format}`;
  const filePath = path.join(emojiDirectory, filename);
  const baseName = path.basename(
    uploaded.originalName,
    path.extname(uploaded.originalName),
  );
  const originalName = baseName
    .replace(/[^a-zA-Z0-9 _-]/g, '')
    .trim()
    .slice(0, 40) || filename;
  let code;
  try {
    await mkdir(emojiDirectory, { recursive: true });
    await writeFile(filePath, uploaded.buffer, { flag: 'wx' });
    const write = catalogWrite.then(async () => {
      const catalog = await readCatalog();
      const files = await readdir(emojiDirectory);
      const usedCodes = new Set(
        createEmojiList(files, catalog)
          .filter((entry) => entry.filename !== filename)
          .map((entry) => entry.code),
      );
      code = uniqueCode(originalName, usedCodes);
      catalog[filename] = {
        category: uploaded.category,
        name: originalName,
        code,
      };
      const tempPath = `${categoryFile}.${randomUUID()}.tmp`;
      await writeFile(tempPath, JSON.stringify(catalog));
      await rename(tempPath, categoryFile);
    });
    catalogWrite = write.catch(() => undefined);
    await write;
  } catch (error) {
    try {
      await unlink(filePath);
    } catch (cleanupError) {
      if (cleanupError.code !== 'ENOENT') {
        console.error(
          `Could not clean up failed emoji upload: ${cleanupError.message}`,
        );
      }
    }
    console.error(`Could not save uploaded chat emoji: ${error.message}`);
    res.status(500).json({ errors: [t`Could not save the uploaded image`] });
    return;
  }
  res.status(201).json({
    emoji: {
      filename, category: uploaded.category, name: originalName, code,
    },
  });
});

export default router;
