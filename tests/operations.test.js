const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseRequest, INPUT_MAP, POWER_MAP } = require('../src/operations');

test('accepts only valid volume operations', () => {
  assert.deepEqual(parseRequest({ operation: 'read' }), { feature: 'volume', operation: 'read' });
  assert.deepEqual(parseRequest({ operation: 'set', value: 54 }), { feature: 'volume', operation: 'set', value: 54 });
  assert.deepEqual(parseRequest({ operation: 'mute' }), { feature: 'volume', operation: 'mute' });
  assert.deepEqual(parseRequest({ operation: 'unmute' }), { feature: 'volume', operation: 'unmute' });
  for (const value of [-1, 101, NaN, 2.5, '50']) assert.throws(() => parseRequest({ operation: 'set', value }));
  assert.throws(() => parseRequest({ operation: 'invalid', value: 1 }));
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

test('accepts contrast reads and writes but not mute', () => {
  assert.deepEqual(parseRequest({ feature: 'contrast', operation: 'read' }), { feature: 'contrast', operation: 'read' });
  assert.deepEqual(parseRequest({ feature: 'contrast', operation: 'set', value: 70 }), { feature: 'contrast', operation: 'set', value: 70 });
  assert.throws(() => parseRequest({ feature: 'contrast', operation: 'mute' }), /Only volume/);
  assert.throws(() => parseRequest({ feature: 'contrast', operation: 'set', value: 101 }), /contrast/);
});

test('accepts input reads and port switching', () => {
  assert.deepEqual(parseRequest({ feature: 'input', operation: 'read' }), { feature: 'input', operation: 'read' });
  assert.deepEqual(parseRequest({ feature: 'input', operation: 'set', value: 15 }), { feature: 'input', operation: 'set', value: 15 });
  assert.deepEqual(parseRequest({ feature: 'input', operation: 'set', value: 18 }), { feature: 'input', operation: 'set', value: 18 });
  assert.equal(INPUT_MAP[15], 'DisplayPort 1');
  assert.equal(INPUT_MAP[18], 'HDMI 2 / USB-C');
  assert.throws(() => parseRequest({ feature: 'input', operation: 'set', value: 0 }), /Invalid input/);
  assert.throws(() => parseRequest({ feature: 'input', operation: 'mute' }), /Only volume/);
});

test('accepts power reads and standby/on commands', () => {
  assert.deepEqual(parseRequest({ feature: 'power', operation: 'read' }), { feature: 'power', operation: 'read' });
  assert.deepEqual(parseRequest({ feature: 'power', operation: 'set', value: 1 }), { feature: 'power', operation: 'set', value: 1 });
  assert.deepEqual(parseRequest({ feature: 'power', operation: 'set', value: 4 }), { feature: 'power', operation: 'set', value: 4 });
  assert.deepEqual(parseRequest({ feature: 'power', operation: 'set', value: 'standby' }), { feature: 'power', operation: 'set', value: 4 });
  assert.deepEqual(parseRequest({ feature: 'power', operation: 'set', value: 'on' }), { feature: 'power', operation: 'set', value: 1 });
  assert.equal(POWER_MAP[1], 'On');
  assert.equal(POWER_MAP[4], 'Standby');
  assert.throws(() => parseRequest({ feature: 'power', operation: 'set', value: 2 }), /Invalid power/);
  assert.throws(() => parseRequest({ feature: 'power', operation: 'mute' }), /Only volume/);
});

test('rejects unknown features', () => {
  assert.throws(() => parseRequest({ feature: 'saturation', operation: 'read' }), /Invalid monitor feature/);
});
