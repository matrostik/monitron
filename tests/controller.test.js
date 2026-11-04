const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateReading, targetValue } = require('../src/controller');

test('accepts verified continuous ranges and rejects invalid readings', () => {
  assert.deepEqual(validateReading({ type: 1, continuous: true, current: 54, maximum: 100 }), { current: 54, maximum: 100, percent: 54 });
  assert.throws(() => validateReading({ type: 1, continuous: false, current: 54, maximum: 100 }));
  assert.throws(() => validateReading({ type: 1, continuous: true, current: 101, maximum: 100 }));
});

test('converts requested percent using the verified range', () => {
  assert.equal(targetValue(50, { current: 20, maximum: 80 }), 40);
});
