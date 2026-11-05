const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { DEFAULTS } = require('../src/settings');

function element(dataset = {}) {
  const fine = Math.abs(Number(dataset.step)) === 1;
  return {
    dataset, value: '50', disabled: false, style: { setProperty() {} },
    classList: { toggle() {}, add() {}, contains: name => name === 'step-fine' && fine }, listeners: {}, children: [],
    addEventListener(name, callback) { this.listeners[name] = callback; },
    setAttribute() {}, querySelector() { return null; },
    replaceChildren() { this.children = []; },
    append(...children) { this.children.push(...children); }
  };
}

async function loadRenderer({ brightnessError = null } = {}) {
  const nodes = new Map();
  const get = selector => {
    if (!nodes.has(selector)) nodes.set(selector, element());
    return nodes.get(selector);
  };
  const buttons = [-5, -1, 1, 5].map(step => element({ step: String(step) }));
  const brightnessButtons = [-10, -1, 1, 10].map(step => element({ step: String(step) }));
  const inputs = ['volumeStep', 'largeVolumeStep', 'shortcutVolumeStep'].map(key => element({ setting: key }));
  let settings = { ...DEFAULTS, volumeStep: 3, largeVolumeStep: 9, shortcutVolumeStep: 7, brightnessStep: 2, largeBrightnessStep: 20, shortcutsEnabled: true };
  const writes = [];
  const brightnessWrites = [];
  let settingsChanged;
  let failSave = false;
  let wheelCallback;
  const monitor = {
    platform: 'win32', read: async () => ({ current: 50, muted: false }),
    set: async value => { writes.push(value); return { current: value, muted: false }; },
    getSettings: async () => ({ settings, capabilities: { launchAtLogin: true } }),
    setSettings: async patch => {
      if (failSave) throw new Error('Could not save settings');
      settings = { ...settings, ...patch };
      return { settings };
    },
    brightness: {
      read: async () => { if (brightnessError) throw new Error(brightnessError); return { current: 75, requested: null }; },
      set: async value => { brightnessWrites.push(value); return { current: value, requested: value }; },
      onChanged() {}
    },
    onChanged() {}, onOpenSettings() {}, onSettingsChanged(callback) { settingsChanged = callback; }
  };
  const document = {
    querySelector: get,
    querySelectorAll: selector => ({ '#volume-card .step-btn': buttons, '#brightness-card .step-btn': brightnessButtons,
      '.step-input[data-setting]': inputs })[selector] || [],
    createElement: () => element(), documentElement: element(), body: element(), addEventListener() {}
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../src/renderer'), 'utf8'), {
    window: { monitor }, document, console, clearTimeout() {},
    setTimeout(callback) { wheelCallback = callback; }
  });
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
  return { get, buttons, brightnessButtons, inputs, writes, brightnessWrites, monitor, changeSettings: settingsChanged,
    flushWheel: () => wheelCallback(), failSave: () => { failSave = true; } };
}

test('renderer applies configured fine and large steps to buttons, arrows and wheel', async () => {
  const ui = await loadRenderer();
  assert.deepEqual(ui.buttons.map(button => button.textContent), ['−9', '−3', '+3', '+9']);
  await ui.buttons[2].listeners.click();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(ui.writes.at(-1), 53);
  const slider = ui.get('#volume');
  slider.listeners.keydown({ key: 'ArrowUp', shiftKey: true, preventDefault() {} });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(ui.writes.at(-1), 62);
  slider.listeners.wheel({ deltaY: 1, shiftKey: false, preventDefault() {} });
  ui.flushWheel();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(ui.writes.at(-1), 59);
  slider.value = 99;
  await ui.buttons[3].listeners.click();
  assert.equal(ui.writes.at(-1), 100);
  assert.match(ui.get('#shortcut-desc').textContent, /volume ±7%.*±3%/);
});

test('renderer saves numeric steps, updates live and restores values after save failure', async () => {
  const ui = await loadRenderer();
  const input = ui.inputs[0];
  input.value = '4';
  input.listeners.change();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(ui.buttons[2].textContent, '+4');
  ui.failSave();
  input.value = '8';
  input.listeners.change();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(Number(input.value), 4);
  assert.match(ui.get('#settings-notice').textContent, /Could not save/);
  assert.equal(input.disabled, false);
  ui.changeSettings({ ...DEFAULTS, volumeStep: 6 });
  assert.equal(ui.buttons[2].textContent, '+6');
});

test('brightness card reads the monitor and writes through the brightness bridge', async () => {
  const ui = await loadRenderer();
  assert.equal(ui.get('#brightness-value').textContent, '75%');
  assert.equal(ui.get('#brightness').disabled, false);
  assert.deepEqual(ui.brightnessButtons.map(button => button.textContent), ['−20', '−2', '+2', '+20']);
  const slider = ui.get('#brightness');
  slider.value = '40';
  await slider.listeners.change();
  assert.deepEqual(ui.brightnessWrites, [40]);
  ui.brightnessButtons[3].listeners.click();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(ui.brightnessWrites, [40, 60]);
  slider.listeners.keydown({ key: 'ArrowDown', shiftKey: false, preventDefault() {} });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(ui.brightnessWrites, [40, 60, 58]);
  assert.deepEqual(ui.writes, []);
});

test('brightness failure stays in its card and leaves volume usable', async () => {
  const ui = await loadRenderer({ brightnessError: 'VCP feature unsupported' });
  assert.equal(ui.get('#brightness-value').textContent, '—');
  assert.equal(ui.get('#brightness').disabled, true);
  assert.match(ui.get('#brightness-notice').textContent, /Brightness unavailable: VCP feature unsupported/);
  assert.equal(ui.get('#volume').disabled, false);
  assert.equal(ui.get('#notice').hidden, true);
});
