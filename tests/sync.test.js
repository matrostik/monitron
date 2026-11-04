const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createOsAudioSync } = require('../src/sync');

test('returns dummy interface on unsupported platform', () => {
  const sync = createOsAudioSync({ platform: 'linux' });
  assert.equal(typeof sync.setOsVolume, 'function');
  assert.equal(typeof sync.setOsMute, 'function');
  assert.equal(typeof sync.stop, 'function');
  sync.setOsVolume(50);
  sync.setOsMute(true);
  sync.stop();
});
