/*
 * Creation of JS Challenges in a Worker
 * This is equivalent to the creation of Captchas in captchaserver.js
 */

import path from 'path';
import { Worker } from 'worker_threads';

import logger from './logger.js';

const MAX_WAIT = 30 * 1000;
const MAX_CHALLENGE_QUEUE = 128;

/*
 * worker thread
 */
const worker = new Worker(path.resolve('workers', 'challengeloader.js'));

/*
 * queue of challenge-generation tasks
 * Map of pending challenge IDs to callbacks and timestamps.
 */
const challengeQueue = new Map();
let nextChallengeId = 0;

/*
 * generate a challenge in the worker thread
 * calls callback with arguments:
 *  (error, challenge.result, challenge.data)
 */
function requestChallenge(cb) {
  if (challengeQueue.size >= MAX_CHALLENGE_QUEUE) {
    cb('OVERLOADED');
    return;
  }
  const id = nextChallengeId;
  nextChallengeId += 1;
  challengeQueue.set(id, {
    timestamp: Date.now(),
    callback: cb,
  });
  worker.postMessage({ type: 'createChallenge', id });
}

/*
 * answer of worker thread
 */
worker.on('message', (msg) => {
  const task = challengeQueue.get(msg.id);
  if (!task) {
    return;
  }
  challengeQueue.delete(msg.id);
  try {
    task.callback?.(msg.error, msg.solution, msg.data);
  } catch {
    return;
  }
});

/*
 * clear requests if queue can't keep up
 */
function clearOldQueue() {
  const now = Date.now();
  let timedOut = false;
  for (const task of challengeQueue.values()) {
    if (task.callback && now - task.timestamp > MAX_WAIT) {
      task.callback('TIMEOUT');
      task.callback = null;
      timedOut = true;
    }
  }
  if (timedOut) {
    logger.warn('CHALLENGES Queue can not keep up!');
  }
}

setInterval(clearOldQueue, MAX_WAIT);

export default requestChallenge;
