'use strict';

const $ = selector => document.querySelector(selector);
const $$ = selector => Array.from(document.querySelectorAll(selector));

const slider = $('#volume');
const value = $('#value');
const status = $('#status');
const statusBadge = $('#status-badge');
const statusDot = $('#status-dot');
const notice = $('#notice');
const stepButtons = $$('#volume-card .step-btn');
const presetChips = $$('#volume-card .preset-chip');
const muteButton = $('#mute');
const muteLabel = $('#mute-label');
const speakerIconBtn = $('#speaker-icon-btn');
const speakerSvg = $('#speaker-svg');
const refreshBtn = $('#refresh');
const shortcutFooter = $('#shortcut-footer');

const brightnessSlider = $('#brightness');
const brightnessValue = $('#brightness-value');
const brightnessNotice = $('#brightness-notice');
const brightnessStepButtons = $$('#brightness-card .step-btn');
const brightnessPresetChips = $$('#brightness-card .preset-chip');

const mainView = $('#main-view');
const settingsView = $('#settings-view');
const settingsToggle = $('#settings-toggle');
const settingsBack = $('#settings-back');
const settingsNotice = $('#settings-notice');
const themeRadios = $$('input[name="theme"]');
const settingSwitches = $$('.switch[data-setting]');
const stepInputs = $$('.step-input[data-setting]');

const isMac = window.monitor.platform === 'darwin';
const KEYS = isMac ? { mod: '⌘', alt: '⌥', shift: '⇧' } : { mod: 'Ctrl', alt: 'Alt', shift: 'Shift' };

$('#win-close')?.addEventListener('click', () => window.monitor.close());
$('#win-minimize')?.addEventListener('click', () => window.monitor.minimize());

let muted = null;
let busy = false;
let connected = false;
let brightnessBusy = false;
let brightnessConnected = false;
let settings = null;
let appInfo = null;

// ---------------------------------------------------------------------------
// Volume UI
// ---------------------------------------------------------------------------

const SPEAKER = '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>';
const WAVE_1 = '<path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>';
const WAVE_2 = '<path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>';
const MUTE_X = '<line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>';

function updateSpeakerIcon(vol, isMuted) {
  if (isMuted) speakerSvg.innerHTML = SPEAKER + MUTE_X;
  else if (vol === 0) speakerSvg.innerHTML = SPEAKER;
  else if (vol <= 50) speakerSvg.innerHTML = SPEAKER + WAVE_1;
  else speakerSvg.innerHTML = SPEAKER + WAVE_1 + WAVE_2;
}

function updateVisuals(vol, isMuted) {
  slider.value = vol;
  value.textContent = `${vol}%`;
  slider.style.setProperty('--vol-percent', `${vol}%`);
  document.body.classList.toggle('is-muted', !!isMuted);
  updateSpeakerIcon(vol, isMuted);
  presetChips.forEach(chip => chip.classList.toggle('current', Number(chip.dataset.val) === vol));
}

function setMuted(next) {
  muted = typeof next === 'boolean' ? next : null;
  muteLabel.textContent = muted ? 'Unmute' : 'Mute';
  muteButton.classList.toggle('active', !!muted);
  muteButton.setAttribute('aria-pressed', String(!!muted));
  speakerIconBtn.title = muted ? 'Unmute' : 'Mute';
  document.body.classList.toggle('is-muted', !!muted);
}

function setStatus(state, text) {
  statusDot.className = `status-dot ${state}`;
  status.textContent = text;
  statusBadge.title = text;
}

function showNotice(element, message) {
  element.textContent = message || '';
  element.hidden = !message;
}

// Enable/disable every control from current state in one place.
function syncControls() {
  const volumeEnabled = connected && !busy;
  slider.disabled = !volumeEnabled;
  stepButtons.forEach(btn => { btn.disabled = !volumeEnabled; });
  presetChips.forEach(chip => { chip.disabled = !volumeEnabled; });
  muteButton.disabled = !volumeEnabled || muted === null;
  speakerIconBtn.disabled = !volumeEnabled || muted === null;
  refreshBtn.disabled = busy;
  refreshBtn.querySelector('.refresh-icon')?.classList.toggle('spinning', busy);
}

async function perform(operation, target) {
  if (busy) return;
  busy = true;
  setStatus('busy', operation === 'read' ? 'Reading…' : 'Updating…');
  syncControls();

  try {
    const result = operation === 'read'
      ? await window.monitor.read()
      : operation === 'set'
        ? await window.monitor.set(target)
        : await window.monitor.mute(target);

    connected = true;
    setMuted(result.muted);
    updateVisuals(result.current, muted === true);
    const mismatch = result.requested != null && result.current !== result.requested;
    setStatus('connected', 'Connected');
    showNotice(notice, mismatch ? `Requested ${result.requested}%, but the monitor reports ${result.current}%.` : '');
  } catch (error) {
    connected = false;
    value.textContent = '—';
    setStatus('error', 'Offline');
    showNotice(notice, error.message || 'Could not reach the monitor.');
  } finally {
    busy = false;
    syncControls();
  }
}

const clamp = n => Math.max(0, Math.min(100, n));
const WHEEL_DEBOUNCE_MS = 220;

// Wire a 0-100 slider with its arrow keys, wheel, step buttons and presets.
// `steps()` returns the current { fine, large } step sizes; `apply` writes a target value.
function bindLevelControl({ slider: input, stepButtons: buttons, presetChips: chips, steps, isBusy, render, apply }) {
  let wheelTimer = null;
  let pendingWheelTarget = null;

  input.addEventListener('input', () => render(Number(input.value)));
  input.addEventListener('change', () => apply(Number(input.value)));

  input.addEventListener('keydown', e => {
    if (isBusy()) return;
    const step = e.shiftKey ? steps().large : steps().fine;
    const current = Number(input.value);
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
      e.preventDefault();
      apply(clamp(current + step));
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
      e.preventDefault();
      apply(clamp(current - step));
    }
  });

  input.addEventListener('wheel', e => {
    e.preventDefault();
    if (isBusy() || input.disabled) return;
    const step = e.shiftKey ? steps().large : steps().fine;
    const base = pendingWheelTarget !== null ? pendingWheelTarget : Number(input.value);
    const nextVal = clamp(e.deltaY < 0 ? base + step : base - step);
    if (nextVal === base) return;

    pendingWheelTarget = nextVal;
    render(nextVal);

    clearTimeout(wheelTimer);
    wheelTimer = setTimeout(() => {
      const wheelTarget = pendingWheelTarget;
      pendingWheelTarget = null;
      apply(wheelTarget);
    }, WHEEL_DEBOUNCE_MS);
  }, { passive: false });

  buttons.forEach(btn => btn.addEventListener('click', () => {
    const step = Number(btn.dataset.step);
    if (!Number.isNaN(step)) apply(clamp(Number(input.value) + step));
  }));

  chips.forEach(chip => chip.addEventListener('click', () => {
    const target = Number(chip.dataset.val);
    if (!Number.isNaN(target)) apply(target);
  }));
}

bindLevelControl({
  slider, stepButtons, presetChips,
  steps: () => ({ fine: settings?.volumeStep ?? 1, large: settings?.largeVolumeStep ?? 5 }),
  isBusy: () => busy,
  render: vol => updateVisuals(vol, !!muted),
  apply: vol => perform('set', vol)
});

muteButton.addEventListener('click', () => perform('mute', !muted));
speakerIconBtn.addEventListener('click', () => perform('mute', !muted));
refreshBtn.addEventListener('click', () => perform('read'));

window.monitor.onChanged(result => {
  if (busy) return;
  connected = true;
  if (typeof result.muted === 'boolean') setMuted(result.muted);
  updateVisuals(result.current, muted === true);
  setStatus('connected', 'Connected');
  showNotice(notice, '');
  syncControls();
});

// ---------------------------------------------------------------------------
// Brightness UI
// ---------------------------------------------------------------------------

function updateBrightnessVisuals(level) {
  brightnessSlider.value = level;
  brightnessValue.textContent = `${level}%`;
  brightnessSlider.style.setProperty('--vol-percent', `${level}%`);
  brightnessPresetChips.forEach(chip => chip.classList.toggle('current', Number(chip.dataset.val) === level));
}

function syncBrightnessControls() {
  const enabled = brightnessConnected && !brightnessBusy;
  brightnessSlider.disabled = !enabled;
  brightnessStepButtons.forEach(btn => { btn.disabled = !enabled; });
  brightnessPresetChips.forEach(chip => { chip.disabled = !enabled; });
}

// Brightness failures stay inside the brightness card so volume keeps working.
async function performBrightness(operation, target) {
  if (brightnessBusy) return;
  brightnessBusy = true;
  syncBrightnessControls();
  try {
    const result = operation === 'read'
      ? await window.monitor.brightness.read()
      : await window.monitor.brightness.set(target);
    brightnessConnected = true;
    updateBrightnessVisuals(result.current);
    const mismatch = result.requested != null && result.current !== result.requested;
    showNotice(brightnessNotice, mismatch ? `Requested ${result.requested}%, but the monitor reports ${result.current}%.` : '');
  } catch (error) {
    brightnessConnected = false;
    brightnessValue.textContent = '—';
    showNotice(brightnessNotice, `Brightness unavailable: ${error.message || 'the monitor did not respond.'}`);
  } finally {
    brightnessBusy = false;
    syncBrightnessControls();
  }
}

bindLevelControl({
  slider: brightnessSlider,
  stepButtons: brightnessStepButtons,
  presetChips: brightnessPresetChips,
  steps: () => ({ fine: settings?.brightnessStep ?? 1, large: settings?.largeBrightnessStep ?? 10 }),
  isBusy: () => brightnessBusy,
  render: updateBrightnessVisuals,
  apply: level => performBrightness('set', level)
});

window.monitor.brightness.onChanged(result => {
  if (brightnessBusy) return;
  brightnessConnected = true;
  updateBrightnessVisuals(result.current);
  showNotice(brightnessNotice, '');
  syncBrightnessControls();
});

// ---------------------------------------------------------------------------
// Footer shortcut hint
// ---------------------------------------------------------------------------

function kbd(text) {
  const el = document.createElement('kbd');
  el.textContent = text;
  return el;
}

function renderFooter() {
  shortcutFooter.replaceChildren();
  if (settings?.shortcutsEnabled) {
    shortcutFooter.append(kbd(KEYS.mod), kbd(KEYS.alt), kbd('↑↓'), ` volume ±${settings.shortcutVolumeStep}%  ·  `, kbd('←→'), ` brightness ±${settings.shortcutBrightnessStep}%`);
  } else {
    const link = document.createElement('button');
    link.className = 'link-btn';
    link.textContent = 'Enable in Settings';
    link.addEventListener('click', openSettings);
    shortcutFooter.append('Global shortcuts are off · ', link);
  }
}

function shortcutDescription(current) {
  return `${KEYS.mod}+${KEYS.alt}+↑/↓ volume ±${current.shortcutVolumeStep}% (${KEYS.shift} ±${current.volumeStep}%), ←/→ brightness ±${current.shortcutBrightnessStep}% (${KEYS.shift} ±${current.brightnessStep}%)`;
}

// Show the configured fine/large step on each ± button.
function labelStepButtons(buttons, fineStep, largeStep) {
  buttons.forEach(button => {
    const direction = Math.sign(Number(button.dataset.step));
    const step = button.classList.contains('step-fine') ? fineStep : largeStep;
    button.dataset.step = String(direction * step);
    button.textContent = `${direction < 0 ? '−' : '+'}${step}`;
    button.title = `${direction < 0 ? 'Decrease' : 'Increase'} by ${step}%`;
  });
}

$('#shortcut-desc').textContent = shortcutDescription({ shortcutVolumeStep: 2, volumeStep: 1, shortcutBrightnessStep: 5, brightnessStep: 1 });

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

function renderSettings() {
  if (!settings) return;
  themeRadios.forEach(radio => { radio.checked = radio.value === settings.theme; });
  settingSwitches.forEach(input => { input.checked = !!settings[input.dataset.setting]; });
  stepInputs.forEach(input => { input.value = settings[input.dataset.setting]; });
  labelStepButtons(stepButtons, settings.volumeStep, settings.largeVolumeStep);
  labelStepButtons(brightnessStepButtons, settings.brightnessStep, settings.largeBrightnessStep);
  $('#shortcut-desc').textContent = shortcutDescription(settings);
  renderFooter();
}

async function saveSetting(patch, control) {
  const wasDisabled = control?.disabled;
  if (control) control.disabled = true;
  try {
    const result = await window.monitor.setSettings(patch);
    settings = result.settings;
    showNotice(settingsNotice, result.error);
  } catch (error) {
    showNotice(settingsNotice, error.message);
  } finally {
    if (control) control.disabled = wasDisabled;
    renderSettings();
  }
}

themeRadios.forEach(radio => radio.addEventListener('change', () => {
  if (radio.checked) saveSetting({ theme: radio.value });
}));

settingSwitches.forEach(input => input.addEventListener('change', () => {
  saveSetting({ [input.dataset.setting]: input.checked }, input);
}));

stepInputs.forEach(input => input.addEventListener('change', () => {
  saveSetting({ [input.dataset.setting]: Number(input.value) }, input);
}));

window.monitor.onSettingsChanged(next => {
  settings = next;
  renderSettings();
});

function openSettings() {
  mainView.hidden = true;
  settingsView.hidden = false;
  settingsToggle.setAttribute('aria-expanded', 'true');
  (settingsView.querySelector('input:checked') || settingsBack).focus({ preventScroll: true });
}

function closeSettings() {
  settingsView.hidden = true;
  mainView.hidden = false;
  settingsToggle.setAttribute('aria-expanded', 'false');
  showNotice(settingsNotice, '');
}

settingsToggle.addEventListener('click', () => (settingsView.hidden ? openSettings() : closeSettings()));
settingsBack.addEventListener('click', closeSettings);
window.monitor.onOpenSettings(openSettings);
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !settingsView.hidden) closeSettings();
});

async function loadSettings() {
  try {
    const { settings: loaded, capabilities } = await window.monitor.getSettings();
    settings = loaded;
    if (!capabilities.launchAtLogin) {
      const input = $('.switch[data-setting=\"launchAtLogin\"]');
      input.disabled = true;
      $('#row-launchAtLogin').classList.add('unavailable');
    }
  } catch (error) {
    showNotice(settingsNotice, `Could not load settings: ${error.message}`);
  }
  renderSettings();
}

// ---------------------------------------------------------------------------
// About section
// ---------------------------------------------------------------------------

async function loadAbout() {
  try {
    if (!window.monitor.getAppInfo) return;
    appInfo = await window.monitor.getAppInfo();
    if (!appInfo) return;

    const versionEl = $('#about-version');
    if (versionEl && appInfo.version) {
      versionEl.textContent = `v${appInfo.version}`;
    }

    const backendEl = $('#about-backend');
    if (backendEl && appInfo.backend) {
      backendEl.textContent = appInfo.backend;
    }

    const runtimeEl = $('#about-runtime');
    if (runtimeEl && appInfo.electronVersion) {
      runtimeEl.textContent = `Electron ${appInfo.electronVersion}`;
    }
  } catch (error) {
    console.error('Could not load app info:', error);
  }
}

const openFolderBtn = $('#open-config-folder-btn');
const copyDiagnosticsBtn = $('#copy-diagnostics-btn');
const copyDiagnosticsLabel = $('#copy-diagnostics-label');

openFolderBtn?.addEventListener('click', async () => {
  try {
    if (window.monitor.openUserData) {
      const res = await window.monitor.openUserData();
      if (res && res.error) showNotice(settingsNotice, res.error);
    }
  } catch (error) {
    showNotice(settingsNotice, error.message);
  }
});

copyDiagnosticsBtn?.addEventListener('click', async () => {
  try {
    const text = [
      `Monitron v${appInfo?.version || '0.1.4'}`,
      `Platform: ${appInfo?.platform || window.monitor.platform} (${appInfo?.arch || ''})`,
      `Backend: ${appInfo?.backend || 'DDC/CI'}`,
      `Target: ${appInfo?.targetDisplay || 'LG UltraWide 49WQ95C'}`,
      `Protocol: DDC/CI (VCP 0x62 / 0x8D / 0x10)`,
      `Electron: ${appInfo?.electronVersion || ''}`,
      `Node: ${appInfo?.nodeVersion || ''}`
    ].join('\n');

    if (window.monitor.copyToClipboard) {
      await window.monitor.copyToClipboard(text);
    } else if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    }

    if (copyDiagnosticsLabel) {
      const original = copyDiagnosticsLabel.textContent;
      copyDiagnosticsLabel.textContent = 'Copied!';
      setTimeout(() => {
        copyDiagnosticsLabel.textContent = original;
      }, 1500);
    }
  } catch (error) {
    showNotice(settingsNotice, `Failed to copy: ${error.message}`);
  }
});

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

syncControls();
syncBrightnessControls();
loadSettings();
loadAbout();
perform('read').then(() => performBrightness('read'));
