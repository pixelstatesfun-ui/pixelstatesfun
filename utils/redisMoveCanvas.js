/*
 * move 3d canvas chunks from one redis instance to another
 */

import { commandOptions, createClient } from 'redis';

const redisc = createClient({ url: 'redis://localhost:6380' });
const redist = createClient({ url: 'redis://localhost:6379' });

const CANVAS_SIZE = 1024;
const THREE_TILE_SIZE = 32;

const CHUNKS_XY = CANVAS_SIZE / THREE_TILE_SIZE;

async function move() {
  try {
    await Promise.all([redisc.connect(), redist.connect()]);
    console.log('Moving chunks...');
    // Keep transfer serial to avoid overloading either Redis instance.
    for (let x = CHUNKS_XY - 1; x >= 0; x--) {
      for (let y = CHUNKS_XY - 1; y >= 0; y--) {
        const key = `ch:2:${x}:${y}`;
        // eslint-disable-next-line no-await-in-loop
        const chunk = await redisc.get(
          commandOptions({ returnBuffers: true }),
          key,
        );
        if (chunk) {
          // eslint-disable-next-line no-await-in-loop
          const ret = await redist.set(key, Buffer.from(chunk));
          console.log('Moved chunk', key, 'to other Redis', ret);
        }
      }
    }
    console.log('Done');
  } finally {
    const closeResults = await Promise.allSettled(
      [redisc, redist].filter((client) => client.isOpen)
        .map((client) => client.quit()),
    );
    closeResults
      .filter((result) => result.status === 'rejected')
      .forEach((result) => {
        console.error('Could not close Redis client:', result.reason);
      });
  }
}

move().catch((error) => {
  console.error('Could not move canvas chunks:', error);
  process.exitCode = 1;
});
