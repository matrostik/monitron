const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { DEFAULTS } = require('../src/settings');

function element(dataset = {}, id = '') {
  const fine = Math.abs(Number(dataset.step)) === 1;
  const childSpan = { textContent: '' };
  return {
    id,
    dataset, value: '50', disabled: false, hidden: false, style: { setProperty() {} },
    classList: {
      items: new Set(),
      toggle(name, force) {
        if (force === undefined) {
          if (this.items.has(name)) this.items.delete(name);
          else this.items.add(name);
        } else if (force) this.items.add(name);
        else this.items.delete(name);
      },
      add(name) { this.items.add(name); },
      contains(name) { return (name === 'step-fine' && fine) || this.items.has(name); }
    },
    listeners: {}, children: [],
    addEventListener(name, callback) { this.listeners[name] = callback; },
    setAttribute() {},
    querySelector(sel) { return sel === 'span' ? childSpan : null; },
    replaceChildren() { this.children = []; },
    append(...children) { this.children.push(...children); }
  };
}

async function loadRenderer({ brightnessError = null, contrastError = null, inputError = null } = {}) {
  const nodes = new Map();
  const get = selector => {
    if (!nodes.has(selector)) nodes.set(selector, element());
    return nodes.get(selector);
  };
  const buttons = [-5, -1, 1, 5].map(step => element({ step: String(step) }));
  const brightnessButtons = [-10, -1, 1, 10].map(step => element({ step: String(step) }));
  const contrastButtons = [-10, -1, 1, 10].map(step => element({ step: String(step) }));
  const inputChips = [15, 16, 17, 18].map(port => element({ port: String(port) }));
  const inputs = ['volumeStep', 'largeVolumeStep', 'shortcutVolumeStep', 'contrastStep', 'largeContrastStep'].map(key => element({ setting: key }));
  const tabs = ['general', 'levels', 'shortcuts', 'about'].map(tab => element({ tab }));
  const panes = ['pane-general', 'pane-levels', 'pane-shortcuts', 'pane-about'].map(id => element({}, id));
  const portEnableCbs = [15, 16, 17, 18].map(pId => element({ portId: String(pId) }));
  const portNameInputs = [15, 16, 17, 18].map(pId => element({ portId: String(pId) }));
  const shortcutKeyInputs = ['volumeUp', 'volumeDown', 'brightnessUp', 'brightnessDown'].map(sKey => element({ shortcutKey: sKey }));

  let settings = { ...DEFAULTS, volumeStep: 3, largeVolumeStep: 9, shortcutVolumeStep: 7, brightnessStep: 2, largeBrightnessStep: 20, contrastStep: 2, largeContrastStep: 15, shortcutsEnabled: true };
  const writes = [];
  const brightnessWrites = [];
  const contrastWrites = [];
  const inputWrites = [];
  const powerWrites = [];
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
    contrast: {
      read: async () => { if (contrastError) throw new Error(contrastError); return { current: 70, requested: null }; },
      set: async value => { contrastWrites.push(value); return { current: value, requested: value }; },
      onChanged() {}
    },
    input: {
      read: async () => { if (inputError) throw new Error(inputError); return { current: 15, maximum: 18 }; },
      set: async value => { inputWrites.push(value); return { current: value, maximum: 18 }; }
    },
    power: {
      read: async () => ({ current: 1, maximum: 5 }),
      standby: async () => { powerWrites.push(4); return { current: 4, maximum: 5 }; },
      on: async () => { powerWrites.push(1); return { current: 1, maximum: 5 }; }
    },
    onChanged() {}, onOpenSettings() {}, onSettingsChanged(callback) { settingsChanged = callback; }
  };
  const document = {
    querySelector: get,
    querySelectorAll: selector => ({
      '#volume-card .step-btn': buttons,
      '#brightness-card .step-btn': brightnessButtons,
      '#contrast-card .step-btn': contrastButtons,
      '#input-card .input-chip': inputChips,
      '.step-input[data-setting]': inputs,
      '.settings-tab': tabs,
      '.settings-pane': panes,
      '.port-enable-cb[data-port-id]': portEnableCbs,
      '.port-name-input[data-port-id]': portNameInputs,
      '.shortcut-key-input[data-shortcut-key]': shortcutKeyInputs
    })[selector] || [],
    createElement: () => element(), documentElement: element(), body: element(), addEventListener() {}
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../src/renderer'), 'utf8'), {
    window: { monitor }, document, console, clearTimeout() {},
    setTimeout(callback) { wheelCallback = callback; }
  });
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
  return {
    get, buttons, brightnessButtons, contrastButtons, inputChips, inputs,
    tabs, panes, portEnableCbs, portNameInputs, shortcutKeyInputs,
    writes, brightnessWrites, contrastWrites, inputWrites, powerWrites, monitor,
    changeSettings: settingsChanged, flushWheel: () => wheelCallback(), failSave: () => { failSave = true; }
  };
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

test('contrast card reads the monitor and writes through the contrast bridge', async () => {
  const ui = await loadRenderer();
  assert.equal(ui.get('#contrast-value').textContent, '70%');
  assert.equal(ui.get('#contrast').disabled, false);
  assert.deepEqual(ui.contrastButtons.map(button => button.textContent), ['−15', '−2', '+2', '+15']);
  const slider = ui.get('#contrast');
  slider.value = '65';
  await slider.listeners.change();
  assert.deepEqual(ui.contrastWrites, [65]);
  ui.contrastButtons[3].listeners.click();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(ui.contrastWrites, [65, 80]);
  slider.listeners.keydown({ key: 'ArrowDown', shiftKey: false, preventDefault() {} });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(ui.contrastWrites, [65, 80, 78]);
  assert.deepEqual(ui.writes, []);
});

test('contrast failure stays in its card and leaves other controls usable', async () => {
  const ui = await loadRenderer({ contrastError: 'VCP feature unsupported' });
  assert.equal(ui.get('#contrast-value').textContent, '—');
  assert.equal(ui.get('#contrast').disabled, true);
  assert.match(ui.get('#contrast-notice').textContent, /Contrast unavailable: VCP feature unsupported/);
  assert.equal(ui.get('#volume').disabled, false);
  assert.equal(ui.get('#brightness').disabled, false);
});

test('input card reads active input and allows switching port', async () => {
  const ui = await loadRenderer();
  assert.equal(ui.get('#input-value').textContent, 'DisplayPort 1');
  assert.equal(ui.inputChips[0].classList.contains('current'), true);
  await ui.inputChips[2].listeners.click();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(ui.inputWrites, [17]);
  assert.equal(ui.get('#input-value').textContent, 'HDMI 1');
});

test('standby button triggers display power standby mode', async () => {
  const ui = await loadRenderer();
  const standby = ui.get('#standby-btn');
  await standby.listeners.click();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(ui.powerWrites, [4]);
  assert.match(ui.get('#input-notice').textContent, /standby/i);
});

test('settings tabs switch active pane and tab button states', async () => {
  const ui = await loadRenderer();
  assert.equal(ui.tabs.length, 4);
  assert.equal(ui.panes.length, 4);

  // Click on levels tab
  await ui.tabs[1].listeners.click();
  assert.equal(ui.tabs[1].classList.contains('active'), true);
  assert.equal(ui.tabs[0].classList.contains('active'), false);
  assert.equal(ui.panes[1].hidden, false);
  assert.equal(ui.panes[0].hidden, true);

  // Click on shortcuts tab
  await ui.tabs[2].listeners.click();
  assert.equal(ui.tabs[2].classList.contains('active'), true);
  assert.equal(ui.panes[2].hidden, false);
  assert.equal(ui.panes[1].hidden, true);
});

test('port configuration updates chip visibility, custom names and persists settings', async () => {
  const ui = await loadRenderer();

  // Disable port 16
  const cb16 = ui.portEnableCbs[1];
  cb16.checked = false;
  await cb16.listeners.change();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(ui.inputChips[1].hidden, true);

  // Rename port 15
  const name15 = ui.portNameInputs[0];
  name15.value = 'Gaming PC';
  await name15.listeners.change();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(name15.value, 'Gaming PC');
  assert.equal(ui.get('#input-value').textContent, 'Gaming PC');
});

test('custom shortcuts inputs save new key bindings', async () => {
  const ui = await loadRenderer();
  const inputVolUp = ui.shortcutKeyInputs[0];
  inputVolUp.value = 'Alt+PageUp';
  await inputVolUp.listeners.change();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(inputVolUp.value, 'Alt+PageUp');
});
