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

const contrastSlider = $('#contrast');
const contrastValue = $('#contrast-value');
const contrastNotice = $('#contrast-notice');
const contrastStepButtons = $$('#contrast-card .step-btn');
const contrastPresetChips = $$('#contrast-card .preset-chip');

const inputChips = $$('#input-card .input-chip');
const inputValue = $('#input-value');
const inputNotice = $('#input-notice');
const standbyBtn = $('#standby-btn');

const mainView = $('#main-view');
const settingsView = $('#settings-view');
const settingsToggle = $('#settings-toggle');
const settingsBack = $('#settings-back');
const settingsNotice = $('#settings-notice');
const themeRadios = $$('input[name="theme"]');
const settingSwitches = $$('.switch[data-setting]');
const stepInputs = $$('.step-input[data-setting]');

const settingsTabs = $$('.settings-tab');
const settingsPanes = $$('.settings-pane');
const portEnableCbs = $$('.port-enable-cb[data-port-id]');
const portNameInputs = $$('.port-name-input[data-port-id]');
const shortcutKeyInputs = $$('.shortcut-key-input[data-shortcut-key]');

const isMac = window.monitor.platform === 'darwin';
const KEYS = isMac ? { mod: '⌘', alt: '⌥', shift: '⇧' } : { mod: 'Ctrl', alt: 'Alt', shift: 'Shift' };

$('#win-close')?.addEventListener('click', () => window.monitor.close());
$('#win-minimize')?.addEventListener('click', () => window.monitor.minimize());

let muted = null;
let busy = false;
let connected = false;
let brightnessBusy = false;
let brightnessConnected = false;
let contrastBusy = false;
let contrastConnected = false;
let currentInput = null;
let inputBusy = false;
let inputConnected = false;
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

// Shared step-button and keydown handler used by volume, brightness, and contrast.
function bindLevelControl({ slider: sliderEl, stepButtons: buttons, presetChips: chips, steps, isBusy, render, apply }) {
  const step = direction => {
    if (isBusy()) return;
    const { fine, large } = steps();
    const amount = direction < 0 ? -large : large;
    const target = Math.max(0, Math.min(100, Number(sliderEl.value) + amount));
    render(target);
    apply(target);
  };

  buttons.forEach(btn => btn.addEventListener('click', () => {
    if (isBusy()) return;
    const delta = Number(btn.dataset.step);
    const target = Math.max(0, Math.min(100, Number(sliderEl.value) + delta));
    render(target);
    apply(target);
  }));

  chips.forEach(chip => chip.addEventListener('click', () => {
    if (isBusy()) return;
    const target = Number(chip.dataset.val);
    render(target);
    apply(target);
  }));

  sliderEl.addEventListener('input', () => render(Number(sliderEl.value)));
  sliderEl.addEventListener('change', () => apply(Number(sliderEl.value)));

  sliderEl.addEventListener('keydown', e => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
      e.preventDefault();
      const delta = e.shiftKey ? steps().large : steps().fine;
      const target = Math.max(0, Math.min(100, Number(sliderEl.value) + delta));
      render(target);
      apply(target);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const delta = e.shiftKey ? steps().large : steps().fine;
      const target = Math.max(0, Math.min(100, Number(sliderEl.value) - delta));
      render(target);
      apply(target);
    }
  });

  let wheelTimer = null;
  sliderEl.addEventListener('wheel', e => {
    e.preventDefault();
    const delta = (e.shiftKey ? steps().large : steps().fine) * (e.deltaY < 0 ? 1 : -1);
    const target = Math.max(0, Math.min(100, Number(sliderEl.value) + delta));
    render(target);
    clearTimeout(wheelTimer);
    wheelTimer = setTimeout(() => apply(target), 80);
  }, { passive: false });
}

async function perform(operation, target) {
  if (busy) return;
  busy = true;
  setStatus('busy', 'Communicating with display…');
  syncControls();
  try {
    const result = operation === 'read'
      ? await window.monitor.read()
      : await window.monitor.set(target);
    connected = true;
    updateVisuals(result.current, result.muted);
    setMuted(result.muted);
    setStatus('connected', 'LG UltraWide 49WQ95C');
    const mismatch = result.requested != null && result.current !== result.requested;
    showNotice(notice, mismatch ? `Requested ${result.requested}%, but the monitor reports ${result.current}%.` : '');
  } catch (error) {
    connected = false;
    value.textContent = '—';
    setStatus('disconnected', 'Display unavailable');
    showNotice(notice, error.message || 'The display did not respond.');
  } finally {
    busy = false;
    syncControls();
  }
}

async function performMuteToggle() {
  if (busy || muted === null) return;
  busy = true;
  const next = !muted;
  setStatus('busy', `${next ? 'Muting' : 'Unmuting'}…`);
  syncControls();
  try {
    const result = next ? await window.monitor.mute() : await window.monitor.unmute();
    connected = true;
    setMuted(result.muted);
    setStatus('connected', 'LG UltraWide 49WQ95C');
    showNotice(notice, '');
  } catch (error) {
    connected = false;
    setStatus('disconnected', 'Display unavailable');
    showNotice(notice, error.message || 'The display did not respond.');
  } finally {
    busy = false;
    syncControls();
  }
}

bindLevelControl({
  slider,
  stepButtons,
  presetChips,
  steps: () => ({ fine: settings?.volumeStep ?? 1, large: settings?.largeVolumeStep ?? 5 }),
  isBusy: () => busy,
  render: level => updateVisuals(level, muted),
  apply: level => perform('set', level)
});

muteButton.addEventListener('click', performMuteToggle);
speakerIconBtn.addEventListener('click', performMuteToggle);
refreshBtn.addEventListener('click', () => perform('read'));

window.monitor.onChanged(result => {
  if (busy) return;
  connected = true;
  updateVisuals(result.current, result.muted);
  setMuted(result.muted);
  setStatus('connected', 'LG UltraWide 49WQ95C');
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
// Contrast UI
// ---------------------------------------------------------------------------

function updateContrastVisuals(level) {
  contrastSlider.value = level;
  contrastValue.textContent = `${level}%`;
  contrastSlider.style.setProperty('--vol-percent', `${level}%`);
  contrastPresetChips.forEach(chip => chip.classList.toggle('current', Number(chip.dataset.val) === level));
}

function syncContrastControls() {
  const enabled = contrastConnected && !contrastBusy;
  contrastSlider.disabled = !enabled;
  contrastStepButtons.forEach(btn => { btn.disabled = !enabled; });
  contrastPresetChips.forEach(chip => { chip.disabled = !enabled; });
}

// Contrast failures stay inside the contrast card so volume and brightness keep working.
async function performContrast(operation, target) {
  if (contrastBusy) return;
  contrastBusy = true;
  syncContrastControls();
  try {
    const result = operation === 'read'
      ? await window.monitor.contrast.read()
      : await window.monitor.contrast.set(target);
    contrastConnected = true;
    updateContrastVisuals(result.current);
    const mismatch = result.requested != null && result.current !== result.requested;
    showNotice(contrastNotice, mismatch ? `Requested ${result.requested}%, but the monitor reports ${result.current}%.` : '');
  } catch (error) {
    contrastConnected = false;
    contrastValue.textContent = '—';
    showNotice(contrastNotice, `Contrast unavailable: ${error.message || 'the monitor did not respond.'}`);
  } finally {
    contrastBusy = false;
    syncContrastControls();
  }
}

bindLevelControl({
  slider: contrastSlider,
  stepButtons: contrastStepButtons,
  presetChips: contrastPresetChips,
  steps: () => ({ fine: settings?.contrastStep ?? 1, large: settings?.largeContrastStep ?? 10 }),
  isBusy: () => contrastBusy,
  render: updateContrastVisuals,
  apply: level => performContrast('set', level)
});

window.monitor.contrast?.onChanged?.(result => {
  if (contrastBusy) return;
  contrastConnected = true;
  updateContrastVisuals(result.current);
  showNotice(contrastNotice, '');
  syncContrastControls();
});

// ---------------------------------------------------------------------------
// Input & Power UI
// ---------------------------------------------------------------------------

const PORT_LABELS = {
  15: 'DP 1',
  16: 'DP 2',
  17: 'HDMI 1',
  18: 'USB-C'
};

function getPortLabel(port) {
  return settings?.ports?.[port]?.label || PORT_LABELS[port] || `Port ${port}`;
}

function updateInputVisuals(port) {
  currentInput = port;
  inputValue.textContent = port ? getPortLabel(port) : '—';
  inputChips.forEach(chip => {
    chip.classList.toggle('current', Number(chip.dataset.port) === port);
  });
}

function syncInputControls() {
  const enabled = inputConnected && !inputBusy;
  inputChips.forEach(chip => { chip.disabled = !enabled; });
  if (standbyBtn) standbyBtn.disabled = !enabled;
}

async function performInput(operation, target) {
  if (inputBusy) return;
  inputBusy = true;
  syncInputControls();
  try {
    if (operation === 'read') {
      const result = await window.monitor.input.read();
      inputConnected = true;
      updateInputVisuals(result.current);
      showNotice(inputNotice, '');
    } else if (operation === 'set') {
      const label = getPortLabel(target);
      showNotice(inputNotice, `Switching to ${label}…`);
      const result = await window.monitor.input.set(target);
      inputConnected = true;
      updateInputVisuals(result?.current || target);
      showNotice(inputNotice, `Switched to ${label}`);
    }
  } catch (error) {
    inputConnected = false;
    inputValue.textContent = '—';
    showNotice(inputNotice, `Input unavailable: ${error.message || 'the monitor did not respond.'}`);
  } finally {
    inputBusy = false;
    syncInputControls();
  }
}

async function performStandby() {
  if (inputBusy) return;
  inputBusy = true;
  syncInputControls();
  try {
    showNotice(inputNotice, 'Putting display into standby…');
    await window.monitor.power.standby();
    showNotice(inputNotice, 'Display in standby mode.');
  } catch (error) {
    showNotice(inputNotice, `Could not set standby: ${error.message || 'no response.'}`);
  } finally {
    inputBusy = false;
    syncInputControls();
  }
}

inputChips.forEach(chip => chip.addEventListener('click', () => {
  const port = Number(chip.dataset.port);
  if (port && port !== currentInput) {
    performInput('set', port);
  }
}));

standbyBtn?.addEventListener('click', performStandby);

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

function switchTab(tabName) {
  settingsTabs.forEach(tab => {
    const isActive = tab.dataset.tab === tabName;
    tab.classList.toggle('active', isActive);
    tab.setAttribute('aria-selected', String(isActive));
  });
  settingsPanes.forEach(pane => {
    const isActive = pane.id === `pane-${tabName}`;
    pane.hidden = !isActive;
    pane.classList.toggle('active', isActive);
  });
}

settingsTabs.forEach(tab => {
  tab.addEventListener('click', () => switchTab(tab.dataset.tab));
});

function renderSettings() {
  if (!settings) return;
  themeRadios.forEach(radio => { radio.checked = radio.value === settings.theme; });
  settingSwitches.forEach(input => { input.checked = !!settings[input.dataset.setting]; });
  stepInputs.forEach(input => { input.value = settings[input.dataset.setting]; });
  labelStepButtons(stepButtons, settings.volumeStep, settings.largeVolumeStep);
  labelStepButtons(brightnessStepButtons, settings.brightnessStep, settings.largeBrightnessStep);
  labelStepButtons(contrastStepButtons, settings.contrastStep, settings.largeContrastStep);

  // Render Port Configuration in Settings & Main view
  if (settings.ports) {
    portEnableCbs.forEach(cb => {
      const pConf = settings.ports[cb.dataset.portId];
      if (pConf) cb.checked = pConf.enabled !== false;
    });
    portNameInputs.forEach(input => {
      const pConf = settings.ports[input.dataset.portId];
      if (pConf && pConf.label) input.value = pConf.label;
    });
    inputChips.forEach(chip => {
      const portId = Number(chip.dataset.port);
      const pConf = settings.ports[portId];
      if (pConf) {
        chip.hidden = !pConf.enabled;
        const textSpan = chip.querySelector('span');
        if (textSpan && pConf.label) textSpan.textContent = pConf.label;
      }
    });
    if (currentInput != null) {
      inputValue.textContent = getPortLabel(currentInput);
    }
  }

  // Render Custom Shortcuts
  if (settings.shortcuts) {
    shortcutKeyInputs.forEach(input => {
      const key = input.dataset.shortcutKey;
      if (settings.shortcuts[key]) input.value = settings.shortcuts[key];
    });
  }

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

portEnableCbs.forEach(cb => cb.addEventListener('change', () => {
  const portId = cb.dataset.portId;
  saveSetting({ ports: { [portId]: { enabled: cb.checked } } }, cb);
}));

portNameInputs.forEach(input => {
  const commit = () => {
    const portId = input.dataset.portId;
    const label = input.value.trim();
    if (label && label !== settings?.ports?.[portId]?.label) {
      saveSetting({ ports: { [portId]: { label } } }, input);
    } else if (!label) {
      input.value = settings?.ports?.[portId]?.label || '';
    }
  };
  input.addEventListener('change', commit);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') input.blur();
  });
});

shortcutKeyInputs.forEach(input => {
  const commit = () => {
    const action = input.dataset.shortcutKey;
    const val = input.value.trim();
    if (val && val !== settings?.shortcuts?.[action]) {
      saveSetting({ shortcuts: { [action]: val } }, input);
    } else if (!val) {
      input.value = settings?.shortcuts?.[action] || '';
    }
  };
  input.addEventListener('change', commit);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') input.blur();
  });
});

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
      const input = $('.switch[data-setting="launchAtLogin"]');
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
      `Monitron v${appInfo?.version || '0.1.6'}`,
      `Platform: ${appInfo?.platform || window.monitor.platform} (${appInfo?.arch || ''})`,
      `Backend: ${appInfo?.backend || 'DDC/CI'}`,
      `Target: ${appInfo?.targetDisplay || 'LG UltraWide 49WQ95C'}`,
      `Protocol: DDC/CI (VCP 0x62 / 0x8D / 0x10 / 0x12 / 0x60 / 0xD6)`,
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
syncContrastControls();
syncInputControls();
loadSettings();
loadAbout();
perform('read')
  .then(() => performBrightness('read'))
  .then(() => performContrast('read'))
  .then(() => performInput('read'));
