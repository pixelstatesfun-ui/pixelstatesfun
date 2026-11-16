/*
 * worker thread for creating JS Challenges
 */

import { randomInt } from 'crypto';
import { compile } from 'watr';
import { isMainThread, parentPort } from 'worker_threads';

import createChallenge from '../funcs/createChallenge.js';

if (isMainThread) {
  throw new Error(
    'ChallengeLoader is run as a worker thread, not as own process',
  );
}

const randomStr = () => `a${Math.random().toString(36).substring(2, 8)}`;

parentPort.on('message', ({ type, id }) => {
  try {
    if (type === 'createChallenge') {
      const challenge = createChallenge(randomInt, randomStr, compile);
      parentPort.postMessage({
        id,
        solution: challenge.solution,
        data: challenge.data,
      });
    }
  } catch (error) {
    console.warn(
      `CHALLENGES: Error on createChallenge: ${error.message}`,
    );
    parentPort.postMessage({ id, error: 'Failure!' });
  }
});
