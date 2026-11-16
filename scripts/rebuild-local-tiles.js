import path from 'node:path';

const rootDirectory = path.resolve(import.meta.dirname, '..');
const distDirectory = path.join(rootDirectory, 'dist');
process.chdir(distDirectory);

const [
  { default: canvases },
  { default: redisClient },
  { initializeTiles },
  { TILE_FOLDER },
] = await Promise.all([
  import('../src/core/canvases.js'),
  import('../src/data/redis/client.js'),
  import('../src/core/Tile.js'),
  import('../src/core/config.js'),
]);

async function rebuildTiles() {
  await redisClient.connect();
  try {
    for (const [canvasId, canvas] of Object.entries(canvases)) {
      if (canvas.v) {
        continue;
      }
      const tileDirectory = path.resolve(TILE_FOLDER, canvasId);
      console.info(`Rebuilding cached tiles for canvas ${canvasId}`);
      // eslint-disable-next-line no-await-in-loop
      await initializeTiles(
        Number(canvasId),
        canvas,
        tileDirectory,
        true,
      );
    }
  } finally {
    await redisClient.quit();
  }
}

rebuildTiles().catch((error) => {
  console.error(`Could not rebuild local tiles: ${error.message}`);
  process.exitCode = 1;
});
