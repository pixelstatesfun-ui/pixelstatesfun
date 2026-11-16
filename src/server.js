/*
 * Entrypoint for main server script
 */

import url from 'url';
import compression from 'compression';
import express from 'express';
import http from 'http';

import forceGC from './core/forceGC.js';
import rankings, { Ranks } from './core/Ranks.js';
import { ensureAdminPowers, expireVipTiers } from './data/sql/User.js';
import { syncVipRole } from './core/DiscordRoles.js';
import { startDiscordBot } from './core/DiscordBot.js';
import { deleteCloudflareIPs } from './data/sql/IP.js';
import { sync as syncSql, cleanUp as cleanUpSql } from './data/sql/index.js';
import { sync as syncAssets } from './core/assets.js';
import { connect as connectRedis } from './data/redis/client.js';
import routes from './routes/index.js';
import chatProvider from './core/ChatProvider.js';
import { loadCaptchaFontsFromDb } from './core/captchaserver.js';
import rpgEvent from './core/RpgEvent.js';
import canvasCleaner from './core/CanvasCleaner.js';
import CooldownManager from './core/CooldownManager.js';
import mailProvider from './core/MailProvider.js';
import { ModtoolsLogger, PixelLogger } from './core/logger.js';
import { User } from './middleware/session.js';
import { HourlyCron, DailyCron } from './utils/cron.js';

import socketEvents from './socket/socketEvents.js';
import SocketServer from './socket/SocketServer.js';
import APISocketServer from './socket/APISocketServer.js';

import {
  PORT, HOST, HOURLY_EVENT, BASENAME, CAPTCHA_PROVIDER,
} from './core/config.js';
import { SECOND } from './core/constants.js';

import startAllCanvasLoops from './core/tileserver.js';

/*
 * in final bundle make sure to cd to dir of script, just because
 */
if (process.env.NODE_ENV && __dirname) {
  process.chdir(__dirname);
}

const app = express();
app.disable('x-powered-by');


// Call Garbage Collector every 30 seconds
setInterval(forceGC, 10 * 60 * SECOND);

// create http server
const server = http.createServer(app);

//
// websockets
// -----------------------------------------------------------------------------
const usersocket = new SocketServer();
const apisocket = new APISocketServer();
const wsUrl = `${BASENAME}/ws`;
const apiWsUrl = `${BASENAME}/mcws`;
async function wsupgrade(request, socket, head) {
  const { pathname } = url.parse(request.url);
  try {
    if (pathname === wsUrl) {
      await usersocket.handleUpgrade(request, socket, head);
    } else if (pathname === apiWsUrl) {
      await apisocket.handleUpgrade(request, socket, head);
    } else {
      socket.write('HTTP/1.1 404 Not found\r\n\r\n');
      socket.destroy();
    }
  } catch (err) {
    console.error(`WebSocket upgrade error: ${err.message}`);
    socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n');
    socket.destroy();
  }
}
server.on('upgrade', wsupgrade);

/*
 * use gzip compression for following calls
 * level from -1 (default, 6) to 0 (no) from 1 (fastest) to 9 (best)
 *
 * Set custom filter to make sure that .bmp files get compressed
 */
app.use(compression({
  level: 3,
  filter: (req, res) => {
    const contentType = res.getHeader('Content-Type');
    if (contentType === 'application/octet-stream') {
      return true;
    }
    return compression.filter(req, res);
  },
}));

app.use(routes);

//
// ip config
// -----------------------------------------------------------------------------
// sync sql models
syncSql()
  .then(deleteCloudflareIPs)
  .then(ensureAdminPowers)
  // connect to redis
  .then(connectRedis)
  .then(syncAssets)
  .then(async () => {
    if (CAPTCHA_PROVIDER === 'ppfun') {
      await loadCaptchaFontsFromDb();
    }
    User.setMailProvider(mailProvider);

    /*
     * First make sure chatProvider is ready, then tell logger where it is.
     * Logger needs it for printing to chat.
     */
    await chatProvider.initialize();
    ModtoolsLogger.chatProvider = chatProvider;

    startDiscordBot();
    startAllCanvasLoops();
    usersocket.initialize();
    apisocket.initialize();
    canvasCleaner.initialize();
    await CooldownManager.initialize();

    const expireVipMemberships = async () => {
      try {
        const expiredUsers = await expireVipTiers();
        await Promise.all(expiredUsers.map(async ({ id }) => {
          const roleSync = await syncVipRole(id, 0);
          if (!roleSync.success) {
            console.error(
              `Expired VIP role sync failed for user ${id}: ${roleSync.reason}`,
            );
          }
          socketEvents.reloadUser(id);
        }));
      } catch (error) {
        console.error(`Failed to expire VIP memberships: ${error.message}`);
      }
    };
    expireVipMemberships();
    setInterval(expireVipMemberships, 60 * SECOND).unref();

    // start http server
    const startServer = () => {
      server.listen(PORT, HOST, () => {
        console.info(`HTTP Server listening on port ${PORT}`);
      });
    };
    server.on('error', (e) => {
      if (e.code === 'EADDRINUSE') {
        console.error(
          `HTTP server could not bind: ${HOST}:${PORT} is already in use.`,
          'Stop the other server or change PORT.',
        );
      } else {
        console.error(`HTTP Server error: ${e.message}`);
      }
      process.exit(1);
    });
    startServer();

    await socketEvents.initialize();

    /*
     * initializers that rely on the cluster being fully established
     * i.e. to know if it is the shard that runs the event
     */
    if (socketEvents.isCluster && socketEvents.important) {
      console.info('I am the main shard');
    }

    await rankings.initialize();
    HourlyCron.hook(Ranks.setHourlyRanking);
    DailyCron.hook(Ranks.setDailyRanking);
    DailyCron.hook(PixelLogger.prepareLogFile);

    HourlyCron.hook(async () => {
      if (!socketEvents.important) {
        return;
      }
      await cleanUpSql();
    });

    if (HOURLY_EVENT) {
      /*
       * give us 10s extra of negotating shards,
       * TODO: initialize RpgEvent either in a redis lua function or in a
       * single transaction, so we can not clash with other shards
       */
      setTimeout(() => {
        rpgEvent.initialize();
      }, 10000);
    }
  });
