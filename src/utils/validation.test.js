import test from 'node:test';
import assert from 'node:assert/strict';

import {
  validateCoorRange,
  validateEMail,
  validateName,
  validatePassword,
  validateUsername,
} from './validation.js';

test('validates account fields required by the existing game UI', () => {
  assert.equal(validateEMail('player@example.com'), false);
  assert.equal(
    validateEMail('bad'),
    'Email should be at least 5 characters long.',
  );
  assert.equal(validateName('Player One'), false);
  assert.equal(validateUsername('player_1'), false);
  assert.notEqual(validateUsername('1player'), false);
  assert.equal(validatePassword('secret1'), false);
});

test('validates coordinate bounds for canvas moderation tools', () => {
  assert.deepEqual(
    validateCoorRange('-10_0', '10_20', 65536),
    [-10, 0, 10, 20],
  );
  assert.equal(
    validateCoorRange(
      '-32769_0',
      '10_20',
      65536,
    ),
    'Coordinates of top-left corner are outside of canvas',
  );
});
