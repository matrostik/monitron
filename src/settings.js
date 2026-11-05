'use strict';
const fs = require('node:fs');
const path = require('node:path');

const THEMES = Object.freeze(['system', 'light', 'dark']);

const DEFAULT_PORTS = Object.freeze({
  15: Object.freeze({ enabled: true, label: 'DisplayPort 1' }),
  16: Object.freeze({ enabled: true, label: 'DisplayPort 2' }),
  17: Object.freeze({ enabled: true, label: 'HDMI 1' }),
  18: Object.freeze({ enabled: true, label: 'USB-C' })
});

const DEFAULT_SHORTCUTS = Object.freeze({
  volumeUp: 'CommandOrControl+Alt+Up',
  volumeDown: 'CommandOrControl+Alt+Down',
  brightnessUp: 'CommandOrControl+Alt+Right',
  brightnessDown: 'CommandOrControl+Alt+Left'
});

const DEFAULTS = Object.freeze({
  theme: 'system',
  launchAtLogin: false,
  startHidden: false,
  shortcutsEnabled: false,
  syncOsVolume: true,
  volumeStep: 1,
  largeVolumeStep: 5,
  shortcutVolumeStep: 2,
  brightnessStep: 1,
  largeBrightnessStep: 10,
  shortcutBrightnessStep: 5,
  contrastStep: 1,
  largeContrastStep: 10,
  ports: DEFAULT_PORTS,
  shortcuts: DEFAULT_SHORTCUTS
});

const BOOLEAN_KEYS = ['launchAtLogin', 'startHidden', 'shortcutsEnabled', 'syncOsVolume'];
const STEP_KEYS = [
  'volumeStep', 'largeVolumeStep', 'shortcutVolumeStep',
  'brightnessStep', 'largeBrightnessStep', 'shortcutBrightnessStep',
  'contrastStep', 'largeContrastStep'
];
const MIN_STEP = 1;
const MAX_STEP = 100;
const isValidStep = value => Number.isInteger(value) && value >= MIN_STEP && value <= MAX_STEP;

function clonePorts(source) {
  const ports = {};
  for (const [id, def] of Object.entries(DEFAULT_PORTS)) {
    const custom = source && source[id];
    ports[id] = {
      enabled: typeof custom?.enabled === 'boolean' ? custom.enabled : def.enabled,
      label: typeof custom?.label === 'string' && custom.label.trim() ? custom.label.trim().slice(0, 24) : def.label
    };
  }
  return ports;
}

function cloneShortcuts(source) {
  const shortcuts = {};
  for (const [key, def] of Object.entries(DEFAULT_SHORTCUTS)) {
    const val = source && source[key];
    shortcuts[key] = typeof val === 'string' && val.trim() ? val.trim() : def;
  }
  return shortcuts;
}

// Keep only known keys with valid values; anything else falls back to the default.
function normalize(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const result = {
    ...DEFAULTS,
    ports: clonePorts(source.ports),
    shortcuts: cloneShortcuts(source.shortcuts)
  };
  if (THEMES.includes(source.theme)) result.theme = source.theme;
  for (const key of BOOLEAN_KEYS) {
    if (typeof source[key] === 'boolean') result[key] = source[key];
  }
  for (const key of STEP_KEYS) {
    if (isValidStep(source[key])) result[key] = source[key];
  }
  return result;
}

// Validate a partial update. Unknown keys or invalid values throw so the UI can't silently persist garbage.
function validatePatch(patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new TypeError('Invalid settings update');
  const clean = {};
  for (const [key, value] of Object.entries(patch)) {
    if (key === 'theme') {
      if (!THEMES.includes(value)) throw new TypeError(`Invalid theme: ${value}`);
    } else if (BOOLEAN_KEYS.includes(key)) {
      if (typeof value !== 'boolean') throw new TypeError(`Invalid value for ${key}`);
    } else if (STEP_KEYS.includes(key)) {
      if (!isValidStep(value)) throw new TypeError(`Invalid value for ${key}: use a whole percentage from ${MIN_STEP} to ${MAX_STEP}`);
    } else if (key === 'ports') {
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Invalid ports update');
      const cleanPorts = {};
      for (const [pId, pConf] of Object.entries(value)) {
        if (!DEFAULT_PORTS[pId]) throw new TypeError(`Unknown port: ${pId}`);
        if (!pConf || typeof pConf !== 'object') throw new TypeError(`Invalid port configuration for port ${pId}`);
        const cleanConf = {};
        if (pConf.enabled !== undefined) {
          if (typeof pConf.enabled !== 'boolean') throw new TypeError(`Invalid enabled value for port ${pId}`);
          cleanConf.enabled = pConf.enabled;
        }
        if (pConf.label !== undefined) {
          if (typeof pConf.label !== 'string' || !pConf.label.trim()) throw new TypeError(`Invalid label for port ${pId}`);
          cleanConf.label = pConf.label.trim().slice(0, 24);
        }
        cleanPorts[pId] = cleanConf;
      }
      clean.ports = cleanPorts;
    } else if (key === 'shortcuts') {
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Invalid shortcuts update');
      const cleanShortcuts = {};
      for (const [sKey, sVal] of Object.entries(value)) {
        if (!(sKey in DEFAULT_SHORTCUTS)) throw new TypeError(`Unknown shortcut action: ${sKey}`);
        if (typeof sVal !== 'string' || !sVal.trim()) throw new TypeError(`Invalid accelerator for ${sKey}`);
        cleanShortcuts[sKey] = sVal.trim();
      }
      clean.shortcuts = cleanShortcuts;
    } else {
      throw new TypeError(`Unknown setting: ${key}`);
    }
    if (key !== 'ports' && key !== 'shortcuts') {
      clean[key] = value;
    }
  }
  return clean;
}

function mergeSettings(current, patch) {
  const next = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    if (key === 'ports' && current.ports) {
      next.ports = { ...current.ports };
      for (const [pId, pConf] of Object.entries(value)) {
        next.ports[pId] = { ...(current.ports[pId] || DEFAULT_PORTS[pId]), ...pConf };
      }
    } else if (key === 'shortcuts' && current.shortcuts) {
      next.shortcuts = { ...current.shortcuts, ...value };
    } else {
      next[key] = value;
    }
  }
  return next;
}

function createSettingsStore({ file, fsImpl = fs } = {}) {
  if (!file) throw new Error('Settings file path is required');
  let current = normalize();

  function load() {
    try {
      current = normalize(JSON.parse(fsImpl.readFileSync(file, 'utf8')));
    } catch (error) {
      if (error.code !== 'ENOENT') console.error('Could not read settings, using defaults:', error.message);
      current = normalize();
    }
    return get();
  }

  function save() {
    fsImpl.mkdirSync(path.dirname(file), { recursive: true });
    const temp = `${file}.tmp`;
    fsImpl.writeFileSync(temp, `${JSON.stringify(current, null, 2)}\n`, 'utf8');
    fsImpl.renameSync(temp, file);
  }

  function get() {
    return {
      ...current,
      ports: clonePorts(current.ports),
      shortcuts: cloneShortcuts(current.shortcuts)
    };
  }

  function update(patch) {
    const validated = validatePatch(patch);
    current = mergeSettings(current, validated);
    save();
    return get();
  }

  return { load, get, update };
}

module.exports = {
  DEFAULTS,
  DEFAULT_PORTS,
  DEFAULT_SHORTCUTS,
  THEMES,
  normalize,
  validatePatch,
  createSettingsStore
};
