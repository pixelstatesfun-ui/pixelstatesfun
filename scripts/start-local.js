import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const rootDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), '..',
);
const distDirectory = path.join(rootDirectory, 'dist');
const nodeExecutable = process.execPath;

const args = new Set(process.argv.slice(2));
const helpRequested = args.has('--help') || args.has('-h');
const dryRun = args.has('--dry-run');
const skipBuild = args.has('--skip-build');
const skipWorldRepair = args.has('--skip-world-repair');
const knownArgs = new Set([
  '--help',
  '-h',
  '--dry-run',
  '--skip-build',
  '--skip-world-repair',
]);
const unknownArgs = [...args].filter((arg) => !knownArgs.has(arg));

function showHelp() {
  console.info(`Usage: npm run start:local -- [options]

Builds the server and English client, restores the land mask, rebuilds
cached tiles for all 2D canvases, and starts the local server.

Options:
  --skip-build          Use existing files in dist
  --skip-world-repair   Do not update the Redis land mask or cached tiles
  --dry-run             Print the steps without running them
  -h, --help            Show this help

MariaDB and Redis must be running. Database tables are created/migrated by
the server during startup. Existing non-empty canvas pixels are preserved.`);
}

function runNode(scriptPath, scriptArgs = [], cwd = rootDirectory) {
  const command = [
    'node',
    path.relative(rootDirectory, scriptPath),
    ...scriptArgs,
  ].join(' ');
  console.info(`\n> ${command}`);
  if (dryRun) {
    return;
  }
  const result = spawnSync(nodeExecutable, [scriptPath, ...scriptArgs], {
    cwd,
    stdio: 'inherit',
    windowsHide: false,
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      `${path.basename(scriptPath)} failed with exit code ${result.status}`,
    );
  }
}

function validateBuildOutputs() {
  const assetsDirectory = path.join(distDirectory, 'public', 'assets');
  const assets = fs.existsSync(assetsDirectory)
    ? fs.readdirSync(assetsDirectory)
    : [];
  const hasClient = assets.some((name) => /^client\.en\..+\.js$/.test(name));
  const hasVendor = assets.some((name) => /^vendor\..+\.js$/.test(name));
  const hasModtools = assets.some(
    (name) => /^modtools\.en\..+\.js$/.test(name),
  );
  const fontsDirectory = path.join(distDirectory, 'captchaFonts');
  const hasCaptchaFonts = fs.existsSync(fontsDirectory)
    && fs.readdirSync(fontsDirectory)
      .some((name) => /\.(ttf|otf)$/i.test(name));
  const hasPpfunDefaultFont = fs.existsSync(
    path.join(distDirectory, 'fonts', 'Comismsh.ttf'),
  );
  if (!fs.existsSync(path.join(distDirectory, 'server.js'))
    || !hasClient || !hasVendor || !hasModtools || !hasCaptchaFonts
    || !hasPpfunDefaultFont
  ) {
    throw new Error(
      'Build output incomplete: expected server, client, vendor, Modtools, '
      + 'and CAPTCHA fonts including the PPFUN dependency font.',
    );
  }
}

function captureLocalConfig() {
  return ['config.ini', '.env'].map((filename) => {
    const rootConfig = path.join(rootDirectory, filename);
    const distConfig = path.join(distDirectory, filename);
    const sourcePath = fs.existsSync(rootConfig) ? rootConfig : distConfig;
    return {
      targetPath: distConfig,
      contents: fs.existsSync(sourcePath)
        ? fs.readFileSync(sourcePath)
        : null,
    };
  });
}

function restoreLocalConfig(configFiles) {
  configFiles.forEach(({ targetPath, contents }) => {
    if (contents) {
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.writeFileSync(targetPath, contents);
    }
  });
}

async function main() {
  if (helpRequested) {
    showHelp();
    return;
  }
  if (unknownArgs.length) {
    throw new Error(
      `Unknown option(s): ${unknownArgs.join(', ')}`,
    );
  }

  if (!skipBuild) {
    const localConfig = captureLocalConfig();
    runNode(path.join(rootDirectory, 'scripts', 'build.js'), ['--server']);
    if (!dryRun) {
      restoreLocalConfig(localConfig);
    }
    runNode(path.join(rootDirectory, 'scripts', 'build.js'), ['--client']);
  }

  if (!dryRun) {
    validateBuildOutputs();
  }

  if (!skipWorldRepair) {
    runNode(
      path.join(rootDirectory, 'utils', 'ocean-tiles', 'drawOcean.js'),
      [],
      distDirectory,
    );
    runNode(
      path.join(rootDirectory, 'scripts', 'rebuild-local-tiles.js'),
    );
  }

  console.info('\nStarting PixelStates on localhost...');
  if (dryRun) {
    return;
  }

  const server = spawn(nodeExecutable, ['server.js'], {
    cwd: distDirectory,
    stdio: 'inherit',
    windowsHide: false,
  });
  server.on('error', (error) => {
    console.error(`Could not start local server: ${error.message}`);
    process.exitCode = 1;
  });
  server.on('exit', (code, signal) => {
    process.exitCode = code ?? (signal ? 1 : 0);
  });
  const stopServer = () => {
    if (!server.killed) {
      server.kill();
    }
  };
  process.once('SIGINT', stopServer);
  process.once('SIGTERM', stopServer);
}

main().catch((error) => {
  console.error(`Local startup failed: ${error.message}`);
  process.exitCode = 1;
});
