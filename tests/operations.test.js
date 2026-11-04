const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseRequest } = require('../src/operations');

test('accepts only valid volume operations', () => {
  assert.deepEqual(parseRequest({ operation: 'read' }), { operation: 'read' });
  assert.deepEqual(parseRequest({ operation: 'set', value: 54 }), { operation: 'set', value: 54 });
  assert.deepEqual(parseRequest({ operation: 'mute' }), { operation: 'mute' });
  assert.deepEqual(parseRequest({ operation: 'unmute' }), { operation: 'unmute' });
  for (const value of [-1, 101, NaN, 2.5, '50']) assert.throws(() => parseRequest({ operation: 'set', value }));
  assert.throws(() => parseRequest({ operation: 'input', value: 1 }));
});
