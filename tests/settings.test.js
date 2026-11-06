const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DEFAULTS, DEFAULT_PORTS, DEFAULT_SHORTCUTS, MAIN_TABS, normalize, validatePatch, createSettingsStore } = require('../src/settings');

test('normalize falls back to defaults for missing or invalid values', () => {
  assert.deepEqual(normalize(null), DEFAULTS);
  assert.deepEqual(normalize({ theme: 'neon', startHidden: 'yes', extra: 1 }), DEFAULTS);
  assert.deepEqual(normalize({ theme: 'light', startHidden: true }), { ...DEFAULTS, theme: 'light', startHidden: true });
});

test('validatePatch rejects unknown keys and wrong types', () => {
  assert.deepEqual(validatePatch({ theme: 'dark' }), { theme: 'dark' });
  assert.throws(() => validatePatch({ theme: 'blue' }));
  assert.throws(() => validatePatch({ launchAtLogin: 1 }));
  assert.throws(() => validatePatch({ nope: true }));
  assert.throws(() => validatePatch(null));
});

test('defaultMainTab validation and normalization', () => {
  assert.equal(normalize({}).defaultMainTab, 'all');
  for (const tab of MAIN_TABS) {
    assert.equal(normalize({ defaultMainTab: tab }).defaultMainTab, tab);
    assert.deepEqual(validatePatch({ defaultMainTab: tab }), { defaultMainTab: tab });
  }
  assert.equal(normalize({ defaultMainTab: 'other' }).defaultMainTab, 'all');
  assert.throws(() => validatePatch({ defaultMainTab: 'other' }), /Invalid defaultMainTab/);
});

test('ports and shortcuts validation and normalization', () => {
  assert.deepEqual(normalize({}).ports, DEFAULT_PORTS);
  assert.deepEqual(normalize({}).shortcuts, DEFAULT_SHORTCUTS);

  // Partial port update
  const validPortPatch = { ports: { 15: { enabled: false, label: 'MacBook' } } };
  assert.deepEqual(validatePatch(validPortPatch), validPortPatch);
  assert.throws(() => validatePatch({ ports: { 99: { enabled: true } } }));
  assert.throws(() => validatePatch({ ports: { 15: { enabled: 'yes' } } }));
  assert.throws(() => validatePatch({ ports: { 15: { label: '' } } }));

  // Partial shortcut update
  const validShortcutPatch = { shortcuts: { volumeUp: 'Alt+PageUp' } };
  assert.deepEqual(validatePatch(validShortcutPatch), validShortcutPatch);
  assert.throws(() => validatePatch({ shortcuts: { unknownAction: 'Alt+A' } }));
  assert.throws(() => validatePatch({ shortcuts: { volumeUp: '' } }));
});

test('volume, brightness, and contrast steps retain defaults and accept whole percentages from 1 to 100', () => {
  const defaults = {
    volumeStep: 1,
    largeVolumeStep: 5,
    shortcutVolumeStep: 2,
    brightnessStep: 1,
    largeBrightnessStep: 10,
    shortcutBrightnessStep: 5,
    contrastStep: 1,
    largeContrastStep: 10
  };
  for (const [key, defaultValue] of Object.entries(defaults)) {
    assert.equal(normalize({})[key], defaultValue);
    for (const value of [1, 7, 100]) {
      assert.equal(normalize({ [key]: value })[key], value);
      assert.deepEqual(validatePatch({ [key]: value }), { [key]: value });
    }
    for (const value of [null, undefined, 0, -1, 101, 1.5, '5', NaN, Infinity]) {
      assert.equal(normalize({ [key]: value })[key], defaultValue);
      assert.throws(() => validatePatch({ [key]: value }), /Invalid value/);
    }
  }
});

test('store persists updates and reloads them at startup', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'monitron-settings-'));
  const file = path.join(dir, 'nested', 'settings.json');
  try {
    const store = createSettingsStore({ file });
    assert.deepEqual(store.load(), DEFAULTS);
    store.update({
      theme: 'light',
      defaultMainTab: 'picture',
      shortcutsEnabled: true,
      volumeStep: 3,
      largeVolumeStep: 10,
      shortcutVolumeStep: 4,
      shortcutBrightnessStep: 15,
      contrastStep: 2,
      largeContrastStep: 8,
      ports: { 15: { enabled: false, label: 'Work PC' } },
      shortcuts: { volumeUp: 'Alt+F12' }
    });

    const reloaded = createSettingsStore({ file }).load();
    assert.equal(reloaded.theme, 'light');
    assert.equal(reloaded.defaultMainTab, 'picture');
    assert.equal(reloaded.shortcutsEnabled, true);
    assert.equal(reloaded.syncOsVolume, true);
    assert.equal(reloaded.volumeStep, 3);
    assert.equal(reloaded.largeVolumeStep, 10);
    assert.equal(reloaded.shortcutVolumeStep, 4);
    assert.equal(reloaded.shortcutBrightnessStep, 15);
    assert.equal(reloaded.contrastStep, 2);
    assert.equal(reloaded.largeContrastStep, 8);
    assert.equal(reloaded.ports[15].enabled, false);
    assert.equal(reloaded.ports[15].label, 'Work PC');
    assert.equal(reloaded.ports[16].enabled, true); // retains other defaults
    assert.equal(reloaded.shortcuts.volumeUp, 'Alt+F12');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('store recovers from a corrupt settings file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'monitron-settings-'));
  const file = path.join(dir, 'settings.json');
  fs.writeFileSync(file, '{not json');
  const originalError = console.error;
  console.error = () => {};
  try {
    assert.deepEqual(createSettingsStore({ file }).load(), DEFAULTS);
  } finally {
    console.error = originalError;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
