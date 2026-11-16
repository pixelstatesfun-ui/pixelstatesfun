/*
 * redis client
 * REDIS_URL can be url or path to unix socket
 */
import fs from 'fs';
import path from 'path';
import { createClient, defineScript } from 'redis';
import { isMainThread } from 'worker_threads';

import { REDIS_URL, IS_CLUSTER, BACKUP_URL } from '../../core/config.js';

const scripts = {
  placePixel: {
    NUMBER_OF_KEYS: 9,
    transformArguments(...args) {
      return args.map((a) => ((typeof a === 'string') ? a : a.toString()));
    },
    transformReply(arr) { return arr.map((r) => Number(r)); },
  },
  placePixelBrush: {
    NUMBER_OF_KEYS: 108,
    transformArguments(...args) {
      return args.map((a) => ((typeof a === 'string') ? a : a.toString()));
    },
    transformReply(arr) { return arr.map((r) => Number(r)); },
  },
  getRanks: {
    NUMBER_OF_KEYS: 2,
    transformArguments(...args) {
      return args.map((a) => ((typeof a === 'string') ? a : a.toString()));
    },
    transformReply(arr) { return arr.map((r) => Number(r)); },
  },
  zmRankRev: {
    NUMBER_OF_KEYS: 1,
    transformArguments(key, uids) {
      return [
        key,
        ...uids.map((a) => ((typeof a === 'string') ? a : a.toString())),
      ];
    },
    transformReply(arr) {
      return arr.map((r) => {
        const rank = Number(r);
        return Number.isNaN(rank) || rank === 0 ? null : rank;
      });
    },
  },
};

(() => {
  const scriptIdent = Object.keys(scripts);
  let i = scriptIdent.length;
  while (i > 0) {
    i -= 1;
    const name = scriptIdent[i];
    let filepath = path.resolve(
      import.meta.dirname, 'workers', 'lua', `${name}.lua`,
    );
    if (!fs.existsSync(filepath)) {
      filepath = path.resolve(
        import.meta.dirname, 'lua', `${name}.lua`,
      );
    }
    scripts[name] = defineScript({
      ...scripts[name],
      SCRIPT: fs.readFileSync(filepath),
    });
  }
})();

const socketOptions = {
  reconnectStrategy: (retries) => Math.min(500 * (2 ** retries), 5000),
};

const client = createClient(REDIS_URL.startsWith('redis://')
  ? {
      url: REDIS_URL,
      scripts,
      socket: socketOptions,
    }
  : {
      socket: {
        path: REDIS_URL,
        ...socketOptions,
      },
      scripts,
    },
);

client.on('error', (error) => {
  const detail = error.message || 'connection interrupted';
  console.error(
    `Redis client error (${error.code || error.name}): ${detail}`,
  );
});

/*
 * for sending messages via cluster
 */
export const pubsub = {
  subscriber: null,
  publisher: null,
};

export const connect = async () => {
  console.log(`Connecting to redis server at ${REDIS_URL}`);
  await client.connect();
  if (IS_CLUSTER && isMainThread) {
    const subscriber = client.duplicate();
    subscriber.on('error', (error) => {
      const detail = error.message || 'connection interrupted';
      console.error(
        `Redis subscriber error (${error.code || error.name}): ${detail}`,
      );
    });
    await subscriber.connect();
    pubsub.publisher = client;
    pubsub.subscriber = subscriber;
  }
  if (BACKUP_URL?.includes('pixmap.fun')) {
    client.flushAll('ASYNC');
  }
};

export default client;
