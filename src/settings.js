'use strict';
const fs = require('node:fs');
const path = require('node:path');

const THEMES = Object.freeze(['system', 'light', 'dark']);

const DEFAULTS = Object.freeze({
  theme: 'system',
  launchAtLogin: false,
  startHidden: false,
  shortcutsEnabled: false,
  syncOsVolume: true
});

const BOOLEAN_KEYS = ['launchAtLogin', 'startHidden', 'shortcutsEnabled', 'syncOsVolume'];

// Keep only known keys with valid values; anything else falls back to the default.
function normalize(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const result = { ...DEFAULTS };
  if (THEMES.includes(source.theme)) result.theme = source.theme;
  for (const key of BOOLEAN_KEYS) {
    if (typeof source[key] === 'boolean') result[key] = source[key];
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
    } else {
      throw new TypeError(`Unknown setting: ${key}`);
    }
    clean[key] = value;
  }
  return clean;
}

function createSettingsStore({ file, fsImpl = fs } = {}) {
  if (!file) throw new Error('Settings file path is required');
  let current = { ...DEFAULTS };

  function load() {
    try {
      current = normalize(JSON.parse(fsImpl.readFileSync(file, 'utf8')));
    } catch (error) {
      if (error.code !== 'ENOENT') console.error('Could not read settings, using defaults:', error.message);
      current = { ...DEFAULTS };
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
    return { ...current };
  }

  function update(patch) {
    current = { ...current, ...validatePatch(patch) };
    save();
    return get();
  }

  return { load, get, update };
}

module.exports = { DEFAULTS, THEMES, normalize, validatePatch, createSettingsStore };
