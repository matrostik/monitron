const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { DEFAULTS } = require('../src/settings');

function loadShortcuts() {
  const callbacks = new Map();
  const writes = [];
  const features = [];
  const errors = [];
  let settings = { ...DEFAULTS, shortcutVolumeStep: 7, volumeStep: 3, shortcutBrightnessStep: 10, brightnessStep: 4 };
  let failRead = false;
  const electron = {
    app: { setAppUserModelId() {}, requestSingleInstanceLock: () => true,
      on() {}, whenReady: () => ({ then() {} }) },
    globalShortcut: { unregister: key => callbacks.delete(key),
      register: (key, callback) => { callbacks.set(key, callback); return true; } },
    dialog: { showErrorBox: (_title, message) => errors.push(message) }
  };
  const childProcess = { execFile(_file, args, _options, callback) {
    if (failRead) return callback(new Error('Monitor unavailable'), '', '');
    features.push(args[args.indexOf('-Feature') + 1]);
    const percentIndex = args.indexOf('-Percent');
    const current = percentIndex === -1 ? 50 : Number(args[percentIndex + 1]);
    if (percentIndex !== -1) writes.push(current);
    callback(null, JSON.stringify({ current }), '');
  } };
  const context = vm.createContext({
    require: name => name === 'electron' ? electron : name === 'node:child_process' ? childProcess
      : name.startsWith('.') ? require(path.join('../src', name)) : require(name),
    process: { platform: 'win32', argv: [] }, __dirname: path.resolve('src'), console,
    store: { get: () => settings }
  });
  vm.runInContext(fs.readFileSync(require.resolve('../src/main'), 'utf8'), context);
  vm.runInContext('settingsStore = store; registerShortcuts();', context);
  return { callbacks, writes, features, errors, update: patch => { settings = { ...settings, ...patch }; },
    fail: () => { failRead = true; } };
}

test('global shortcuts read configured steps live, including Shift and boundary clamping', async () => {
  const ui = loadShortcuts();
  await ui.callbacks.get('CommandOrControl+Alt+Up')();
  await ui.callbacks.get('CommandOrControl+Alt+Down')();
  await ui.callbacks.get('CommandOrControl+Alt+Shift+Up')();
  await ui.callbacks.get('CommandOrControl+Alt+Shift+Down')();
  assert.deepEqual(ui.writes, [57, 43, 53, 47]);
  ui.update({ shortcutVolumeStep: 100, volumeStep: 8 });
  await ui.callbacks.get('CommandOrControl+Alt+Up')();
  await ui.callbacks.get('CommandOrControl+Alt+Down')();
  await ui.callbacks.get('CommandOrControl+Alt+Shift+Up')();
  assert.deepEqual(ui.writes.slice(-3), [100, 0, 58]);
});

test('global shortcut reports backend failure without sending a volume write', async () => {
  const ui = loadShortcuts();
  ui.fail();
  await ui.callbacks.get('CommandOrControl+Alt+Up')();
  assert.deepEqual(ui.writes, []);
  assert.deepEqual(ui.errors, ['Monitor unavailable']);
});

test('brightness shortcuts step the brightness feature with their own steps', async () => {
  const ui = loadShortcuts();
  await ui.callbacks.get('CommandOrControl+Alt+Right')();
  await ui.callbacks.get('CommandOrControl+Alt+Left')();
  await ui.callbacks.get('CommandOrControl+Alt+Shift+Right')();
  await ui.callbacks.get('CommandOrControl+Alt+Shift+Left')();
  assert.deepEqual(ui.writes, [60, 40, 54, 46]);
  assert.ok(ui.features.every(feature => feature === 'brightness'));
});

test('volume shortcuts target the volume feature', async () => {
  const ui = loadShortcuts();
  await ui.callbacks.get('CommandOrControl+Alt+Up')();
  assert.deepEqual(ui.features, ['volume', 'volume']);
});
