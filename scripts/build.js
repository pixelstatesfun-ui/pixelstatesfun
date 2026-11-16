/*
 * We got so many locals that building them all in one go can lead to out-of-memory error
 * Lets split that here
 */

import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import webpack from 'webpack';
import validate from 'ttag-cli/dist/src/commands/validate.js';

import minifyCss from './minifyCss.js';
import mapFlags from './mapFlags.js';
import minifyJs from './minifyJs.js';
import buildLanguages from './buildLanguageBundles.js';
import createImages from './createImages.js';
import serverConfig from '../webpack.config.server.js';
import clientConfig from '../webpack.config.client.js';

const __filename = import.meta.filename;
const __dirname = import.meta.dirname;

const pkg = JSON.parse(
  fs.readFileSync(path.resolve(import.meta.dirname, '..', 'package.json')),
);

const BUILD_LANGUAGES = [
  'ca', 'de', 'fa', 'hr', 'nl', 'ru', 'sq', 'szl', 'tr', 'vi', 'zh',
];
let langs = 'all';
let doBuildServer = false;
let doBuildClient = false;
let parallel = false;
let onlyValidate = false;
let development = false;
for (let i = 0; i < process.argv.length; i += 1) {
  switch (process.argv[i]) {
    case '--langs': {
      const newLangs = process.argv[++i];
      if (newLangs) langs = newLangs;
      break;
    }
    case '--client':
      doBuildClient = true;
      break;
    case `--server`:
      doBuildServer = true;
      break;
    case '--parallel':
      parallel = true;
      break;
    case '--validate':
      onlyValidate = true;
      break;
    case '--dev':
      development = true;
      break;
    default:
      // nothing
  }
}
if (!doBuildServer && !doBuildClient) {
  doBuildServer = true;
  doBuildClient = true;
}

function getBuildableLocals() {
  const i18nDir = path.resolve(__dirname, '..', 'i18n');
  const available = new Set(fs.readdirSync(i18nDir)
    .filter((file) => file.endsWith('.po') && !file.startsWith('ssr-'))
    .map((file) => file.slice(0, -3)));
  const selected = BUILD_LANGUAGES.filter((lang) => available.has(lang));
  process.stdout.write(
    `Building English and selected languages: `
    + `${['en', ...selected].join(', ')}\n`,
  );
  return ['en', ...selected];
}

/*
 * check if language files contain errors
 */
function validateLangs(langs) {
  const ts = Date.now();
  process.stdout.write(`\x1b[33mValidating Language files\x1b[0m\n`);
  const langDir = path.resolve(__dirname, '..', 'i18n');
  const brokenLangs = [];
  for (const lang of langs) {
    const langFiles = [`${lang}.po`, `ssr-${lang}.po`];
    for (const langFile of langFiles) {
      const filePath = path.join(langDir, langFile);
      if (!fs.existsSync(filePath)) {
        continue;
      }
      try {
        validate.default(filePath);
        process.stdout.write('\x1b[32m' + langFile + '\x1b[0m ');
      } catch (error) {
        brokenLangs.push(langFile);
        process.stdout.write('\x1b[31m' + langFile + '\x1b[0m ');
      }
    }
  }
  process.stdout.write(`\n\x1b[33mValidating Language files took ${Math.round((Date.now() - ts) / 1000)}s\x1b[0m\n`);
  return brokenLangs;
}

/*
 * clean up before build and copy files
 */
function cleanUpBeforeBuild(doBuildServer, doBuildClient) {
  const parentDir = path.resolve(__dirname, '..');
  const distDir = path.resolve(__dirname, '..', 'dist');
  if (!fs.existsSync(distDir)) fs.mkdirSync(distDir);
  const legalPath = path.join(distDir, 'public', 'legal');
  if (fs.existsSync(legalPath)) {
    fs.readdirSync(legalPath)
      .filter((name) => name.endsWith('-source.zip'))
      .forEach((name) => fs.rmSync(path.join(legalPath, name)));
  }
  // remove files we need to regenerate
  const webpackCachePath = path.join(parentDir, 'node_modules', '.cache', 'webpack');
  fs.rmSync(webpackCachePath, { recursive: true, force: true });
  if (doBuildClient && doBuildServer) {
    const assetPath = path.join(distDir, 'public', 'assets');
    fs.rmSync(assetPath, { recursive: true, force: true });
    const legalPath = path.join(distDir, 'public', 'legal');
    fs.rmSync(legalPath, { recursive: true, force: true });
  }
  if (doBuildServer) {
    const captchaFontsPath = path.join(distDir, 'captchaFonts');
    fs.rmSync(captchaFontsPath, { recursive: true, force: true });
    const ppfunFontsPath = path.join(distDir, 'fonts');
    fs.rmSync(ppfunFontsPath, { recursive: true, force: true });
  }
  // copy necessary files
  if (doBuildServer) {
    // copy files to dist directory
    [
      'LICENSE',
      'COPYING',
      'AUTHORS',
      'README.md',
      path.join('src', 'canvases.json'),
      path.join('deployment', 'ecosystem.yml'),
      path.join('deployment', 'ecosystem-backup.yml'),
      path.join('deployment', 'config.ini'),
    ].forEach((f) => {
      fs.copyFileSync(
        path.join(parentDir, f),
        path.join(distDir, path.basename(f)),
      );
    });
    const envFile = path.join(parentDir, '.env');
    if (fs.existsSync(envFile)) {
      fs.copyFileSync(envFile, path.join(distDir, '.env'));
    }
    // copy folder to dist directory
    const dirsToDirectlyCopy = ['public', 'doc'];
    dirsToDirectlyCopy.push(path.join('deployment', 'captchaFonts'));
    dirsToDirectlyCopy.forEach((d) => {
      fs.cpSync(
        path.join(parentDir, d),
        path.join(distDir, path.basename(d)),
        { recursive: true },
      );
    });
    const emojiSourceDir = path.join(parentDir, 'emodge');
    const emojiTargetDir = path.join(distDir, 'emodge');
    fs.mkdirSync(emojiTargetDir, { recursive: true });
    if (fs.existsSync(emojiSourceDir)) {
      fs.readdirSync(emojiSourceDir)
        .filter((filename) => (
          /^(?:blob_\d{4}|emodge\d+|emoji_[a-f0-9-]{36})\.(?:gif|webp|png)$/
            .test(filename)
        ))
        .forEach((filename) => {
          fs.copyFileSync(
            path.join(emojiSourceDir, filename),
            path.join(emojiTargetDir, filename),
          );
          const numberedEmoji = /^emodge(\d+)(\.(?:gif|webp|png))$/
            .exec(filename);
          if (numberedEmoji) {
            const legacyFilename = `blob_${numberedEmoji[1].padStart(4, '0')}${numberedEmoji[2]}`;
            fs.rmSync(path.join(emojiTargetDir, legacyFilename), {
              force: true,
            });
          }
        });
    }
    fs.cpSync(
      path.join(parentDir, 'node_modules', 'ppfun-captcha', 'fonts'),
      path.join(distDir, 'fonts'),
      { recursive: true },
    );
    // copy stuff we have to rename
    fs.cpSync(
      path.join(parentDir, 'src', 'data', 'redis', 'lua'),
      path.join(distDir, 'workers', 'lua'),
      { recursive: true },
    );
    [
      'scheme', 'procedures', 'functions', 'migrations', 'cleanup',
    ].forEach((sqlDir) => {
      fs.cpSync(
        path.join(parentDir, 'src', 'data', 'sql', sqlDir),
        path.join(distDir, 'workers', 'sql', sqlDir),
        { recursive: true },
      );
    });
    // ./src/funcs get shipped seperately to allow overriding
    fs.cpSync(
      path.join(parentDir, 'src', 'funcs'),
      path.join(distDir, 'workers', 'funcs'),
      { recursive: true },
    );
    /*
     * overrides exist to deploy our own files
     * that are not part of the repository, like logo.svg
     */
    const overrideDir = path.join(parentDir, 'overrides');
    if (fs.existsSync(overrideDir)) {
      fs.cpSync(
        overrideDir,
        path.join(distDir),
        { dereference: true, recursive: true },
      );
    }
  }
}

/*
 * clean up after build
 */
function cleanUpAfterBuild(currentJsAssets = null) {
  const assetPath = path.resolve(__dirname, '..', 'dist', 'public', 'assets');
  fs.readdirSync(assetPath)
    .filter((e) => e.endsWith('.LICENSE.txt'))
    .forEach((l) => fs.rmSync(path.join(assetPath, l)));
  if (!development) {
    fs.readdirSync(assetPath)
      .filter((e) => e.endsWith('.js.map')
        || (currentJsAssets && e.endsWith('.js')
          && !currentJsAssets.has(e)))
      .forEach((l) => fs.rmSync(path.join(assetPath, l)));
  }
  fs.readdirSync(assetPath)
    .filter((e) => e.endsWith('.js') && e.includes('WPLANGCODE'))
    .forEach((l) => fs.rmSync(path.join(assetPath, l)));
  const serverLicenseFile = path.resolve(__dirname, '..', 'dist', 'server.js.LICENSE.txt');
  if (fs.existsSync(serverLicenseFile)) {
    fs.rmSync(serverLicenseFile);
  }
}


function compile(webpackConfig) {
  return new Promise((resolve, reject) => {
    webpack(webpackConfig, (err, stats) => {
      if (err) {
        return reject(err);
      }
      if (stats.hasErrors()) {
        return reject(new Error(stats.toString('errors-only')));
      }
      const statsConfig = (webpackConfig.length) ? webpackConfig[0].stats : webpackConfig.stats;
      console.log(stats.toString(statsConfig))
      return resolve(stats);
    });
  });
}

function buildServer() {
  process.stdout.write(`\x1b[33mBuilding Server with Webpack\x1b[0m\n`);
  const ts = Date.now();

  return new Promise((resolve, reject) => {
    const argsc = ['webpack', '--config', './webpack.config.server.js'];
    if (development) {
      argsc.push('--env');
      argsc.push('development');
    } else {
      argsc.push('--env');
      argsc.push('extract');
    }
    const serverCompile = spawn('npx', argsc, {
      shell: process.platform == 'win32',
    });
    serverCompile.stdout.on('data', (data) => {
      console.log(data.toString());
    });
    serverCompile.stderr.on('data', (data) => {
      console.error(data.toString());
    });
    serverCompile.on('close', (code) => {
      if (code) {
        reject(new Error('Server compilation failed!'));
      } else {
        resolve();
      }
    });
  });
}

function getCurrentJsAssets(stats, languages) {
  const assetNames = stats.toJson({ assets: true }).assets
    .map(({ name }) => name)
    .filter((name) => name.endsWith('.js'));
  const builtLangs = new Set(['en', ...languages]);
  const currentAssets = new Set();

  assetNames.forEach((name) => {
    if (name.includes('.WPLANGCODE.')) {
      builtLangs.forEach((lang) => {
        currentAssets.add(name.replace('.WPLANGCODE.', `.${lang}.`));
      });
    } else {
      currentAssets.add(name);
    }
  });
  return currentAssets;
}

async function build() {
  const st = Date.now();
  let currentJsAssets = null;
  // cleanup old files
  cleanUpBeforeBuild(doBuildServer, doBuildClient);

  await mapFlags();

  const promises = [];
  let clientStats;

  if (doBuildServer) {
    promises.push(buildServer());
  }

  if (!parallel) {
    await Promise.all(promises);
    promises.length = 0;
  }

  if (doBuildClient) {
    process.stdout.write(`\x1b[33mBuilding Client with Webpack\x1b[0m\n`);
    clientStats = await compile(clientConfig({
      development,
      analyze: false,
    }));

    await minifyCss();

    if (doBuildServer) {
      /*
        * server copies files into ./dist/public, it
        * is needed for creating images
        */
      await createImages();
    }
  }
  await Promise.all(promises);

  // decide which languages to build
  let avlangs;
  if (!development && doBuildClient) {
    avlangs = getBuildableLocals();
    if (langs !== 'all') {
      const requested = new Set(langs.split(',').map((lang) => lang.trim()));
      avlangs = avlangs.filter((lang) => lang === 'en' || requested.has(lang));
    }
    if (avlangs.length) {
      const brokenLangs = validateLangs(avlangs);
      if (brokenLangs.length) {
        console.error('ERROR: Translation files', brokenLangs, 'contain errors.');
        process.exit(2);
        return;
      }
      if (onlyValidate) {
        console.log('Validation complete, everything is fine.');
        process.exit(0);
        return;
      }
    }

    currentJsAssets = getCurrentJsAssets(clientStats, avlangs);
    await buildLanguages(avlangs, true, parallel && 2);
    await minifyJs(avlangs, parallel && 2);
  }

  cleanUpAfterBuild(currentJsAssets);
  console.log(`Finished building in ${(Date.now() - st) / 1000}s`);
}

build();
