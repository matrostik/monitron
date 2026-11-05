const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseRequest } = require('../src/operations');

test('accepts only valid volume operations', () => {
  assert.deepEqual(parseRequest({ operation: 'read' }), { feature: 'volume', operation: 'read' });
  assert.deepEqual(parseRequest({ operation: 'set', value: 54 }), { feature: 'volume', operation: 'set', value: 54 });
  assert.deepEqual(parseRequest({ operation: 'mute' }), { feature: 'volume', operation: 'mute' });
  assert.deepEqual(parseRequest({ operation: 'unmute' }), { feature: 'volume', operation: 'unmute' });
  for (const value of [-1, 101, NaN, 2.5, '50']) assert.throws(() => parseRequest({ operation: 'set', value }));
  assert.throws(() => parseRequest({ operation: 'input', value: 1 }));
});

test('defaults to volume when no request is given', () => {
  assert.deepEqual(parseRequest(undefined), { feature: 'volume', operation: 'read' });
});

test('accepts brightness reads and writes but not mute', () => {
  assert.deepEqual(parseRequest({ feature: 'brightness', operation: 'read' }), { feature: 'brightness', operation: 'read' });
  assert.deepEqual(parseRequest({ feature: 'brightness', operation: 'set', value: 0 }), { feature: 'brightness', operation: 'set', value: 0 });
  assert.throws(() => parseRequest({ feature: 'brightness', operation: 'mute' }), /Only volume/);
  assert.throws(() => parseRequest({ feature: 'brightness', operation: 'set', value: 101 }), /brightness/);
});

test('rejects unknown features', () => {
  assert.throws(() => parseRequest({ feature: 'contrast', operation: 'read' }), /Invalid monitor feature/);
});
