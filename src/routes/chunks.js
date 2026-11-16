/**
 *
 * Outputs binary chunk directly from redis
 *
 */

import etag from 'etag';
import RedisCanvas from '../data/redis/RedisCanvas.js';
import logger from '../core/logger.js';
import { CDN_HOST, NO_CDN_COUNTRIES, NO_CDN } from '../core/config.js';

/*
 * Send binary chunk to the client
 */
export default async (req, res, next) => {
  if (CDN_HOST
    && CDN_HOST !== req.ip.getHost(false, false)
    && !NO_CDN
    && !NO_CDN_COUNTRIES?.includes(req.ip.country)
  ) {
    /*
     * do not allow chunks and tiles requests from any other URL than CDN,
     * if CDN_URL is set
     */
    res.redirect(`${req.protocol}://${CDN_HOST}${req.originalUrl}`);
    return;
  }

  const {
    c: paramC,
    x: paramX,
    y: paramY,
  } = req.params;
  const c = parseInt(paramC, 10);
  const x = parseInt(paramX, 10);
  const y = parseInt(paramY, 10);
  if (Number.isNaN(paramC) || Number.isNaN(paramX) || Number.isNaN(paramY)) {
    next();
    return;
  }
  try {
    res.set({
      'Access-Control-allow-origin': '*',
    });
    // botters where using cachebreakers to update via chunk API
    // lets not allow that for now
    if (Object.keys(req.query).length !== 0) {
      res.status(400).end();
      return;
    }

    const preEtag = req.headers['if-none-match'];

    res.set({
      'Cache-Control': 'public, no-cache, max-age=0, must-revalidate',
    });

    let chunk;
    try {
      await RedisCanvas.flushPixels();
      const stime = Date.now();
      chunk = await RedisCanvas.getChunk(c, x, y);
      const dur = Date.now() - stime;
      if (dur > 6000) {
        // eslint-disable-next-line max-len
        logger.warn(`Long redis response times of ${dur}ms for chunk ${c}:${x},${y}`);
      }
    } catch (error) {
      logger.error(`Error on routes/chunks: ${error.message}`);
      res.status(503).end();
      return;
    }

    res.set({
      'Content-Type': 'application/octet-stream',
    });

    if (!chunk) {
      res.status(200).end();
      return;
    }

    const curEtag = etag(chunk, { weak: true });
    res.set({
      ETag: curEtag,
    });
    if (preEtag === curEtag) {
      res.status(304).end();
      return;
    }

    res.end(chunk, 'binary');
  } catch (error) {
    next(error);
  }
};
