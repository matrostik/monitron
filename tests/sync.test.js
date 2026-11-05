const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createOsAudioSync, parseMacVolumeReading } = require('../src/sync');

test('returns dummy interface on unsupported platform', () => {
  const sync = createOsAudioSync({ platform: 'linux' });
  assert.equal(typeof sync.setOsVolume, 'function');
  assert.equal(typeof sync.setOsMute, 'function');
  assert.equal(typeof sync.stop, 'function');
  sync.setOsVolume(50);
  sync.setOsMute(true);
  sync.stop();
});

test('parses a macOS volume reading and a display with no system volume', () => {
  assert.deepEqual(parseMacVolumeReading('40\nfalse\n'), { volume: 40, muted: false });
  assert.deepEqual(parseMacVolumeReading('missing value\nmissing value'), { volume: null, muted: false });
  assert.equal(parseMacVolumeReading('false'), null);
});
