const { test } = require('node:test');
const assert = require('node:assert/strict');
const { toPercent, fromPercent, stepVolume } = require('../src/volume');

test('normalizes a monitor volume range', () => {
  assert.equal(toPercent(40, 80), 50);
  assert.equal(fromPercent(50, 80), 40);
});

test('volume steps clamp to the monitor range', () => {
  assert.equal(stepVolume(98, 5), 100);
  assert.equal(stepVolume(2, -5), 0);
  assert.equal(stepVolume(50, 5), 55);
  assert.equal(stepVolume(50, 1), 51);
  assert.equal(stepVolume(50, -1), 49);
  assert.equal(stepVolume(50, 2), 52);
  assert.equal(stepVolume(1, -2), 0);
  assert.equal(stepVolume(99, 2), 100);
});

test('rejects invalid monitor ranges and out of bounds values', () => {
  assert.throws(() => toPercent(1, 0));
  assert.throws(() => toPercent(101, 100));
  assert.throws(() => fromPercent(-1, 100));
});
