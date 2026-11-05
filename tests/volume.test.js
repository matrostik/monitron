const { test } = require('node:test');
const assert = require('node:assert/strict');
const { toPercent, fromPercent, stepVolume, acceptMediaKey } = require('../src/volume');

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

test('a keyboard volume burst counts as one press', () => {
  let state = { at: Number.NEGATIVE_INFINITY, direction: 0 };
  const burst = [0, 30, 60, 90, 120, 150];
  const accepted = [];
  for (const now of burst) {
    const decision = acceptMediaKey(state, 1, now, 120);
    state = decision;
    if (decision.accept) accepted.push(now);
  }
  assert.deepEqual(accepted, [0]);
  const nextPress = acceptMediaKey(state, 1, 400, 120);
  assert.equal(nextPress.accept, true);
  const opposite = acceptMediaKey(nextPress, -1, 410, 120);
  assert.equal(opposite.accept, true);
});

test('rejects invalid monitor ranges and out of bounds values', () => {
  assert.throws(() => toPercent(1, 0));
  assert.throws(() => toPercent(101, 100));
  assert.throws(() => fromPercent(-1, 100));
});
