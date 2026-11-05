'use strict';
const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, nativeTheme, globalShortcut, dialog, shell, clipboard } = require('electron');
const { execFile } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { parseRequest } = require('./operations');
const { createMacBackend } = require('./macos');
const { stepVolume, acceptMediaKey } = require('./volume');
const { createOsAudioSync } = require('./sync');
const { createSettingsStore } = require('./settings');

const APP_NAME = 'Monitron';
if (process.platform === 'win32') {
  app.setAppUserModelId('local.monitron.app');
}

const SMOKE_TEST = process.argv.includes('--smoke-test');
const SHORTCUTS = [
  ['CommandOrControl+Alt+Up', 1, 'shortcutVolumeStep'],
  ['CommandOrControl+Alt+Down', -1, 'shortcutVolumeStep'],
  ['CommandOrControl+Alt+Shift+Up', 1, 'volumeStep'],
  ['CommandOrControl+Alt+Shift+Down', -1, 'volumeStep']
];
const WINDOW_BACKGROUND = { dark: '#1c1c1e', light: '#f2f2f7' };

let queue = Promise.resolve();
let tray;
let window;
let quitting = false;
let osSync;
let settingsStore;
let lastKnownMonitorVolume = null;
let lastKnownMonitorMuted = null;
let syncDebounceTimer = null;

function request(raw) {
  const operation = parseRequest(raw);
  if (process.platform === 'darwin') {
    const binary = path.join(__dirname, '..', 'vendor', 'm1ddc', 'm1ddc');
    const runMac = args => new Promise((resolve, reject) => execFile(binary, args, { timeout: 8000 }, (err, stdout, stderr) => err ? reject(new Error(stderr.trim() || stdout.trim() || 'Build the macOS helper with npm run build:mac')) : resolve(stdout)));
    const run = () => createMacBackend(runMac)(operation);
    const next = queue.then(run, run);
    queue = next.catch(() => {});
    return next;
  }
  if (process.platform !== 'win32') return Promise.reject(new Error('Unsupported operating system.'));
  const args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, '..', 'scripts', 'windows-volume.ps1'), '-Operation', operation.operation];
  if (operation.operation === 'set') args.push('-Percent', String(operation.value));
  const run = () => new Promise((resolve, reject) => execFile('powershell.exe', args, { timeout: 8000, windowsHide: true }, (err, stdout, stderr) => {
    if (err) return reject(new Error(stderr.trim() || err.message));
    try {
      resolve(JSON.parse(stdout.trim()));
    } catch {
      reject(new Error('Invalid monitor response'));
    }
  }));
  const next = queue.then(run, run);
  queue = next.catch(() => {});
  return next;
}

function sendToWindow(channel, payload) {
  if (window && !window.isDestroyed()) window.webContents.send(channel, payload);
}

function showWindow() {
  if (!window || window.isDestroyed()) return;
  window.show();
  window.focus();
}

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

function applyTheme(theme) {
  nativeTheme.themeSource = theme;
  if (window && !window.isDestroyed()) window.setBackgroundColor(currentBackground());
}

function currentBackground() {
  return nativeTheme.shouldUseDarkColors ? WINDOW_BACKGROUND.dark : WINDOW_BACKGROUND.light;
}

// ---------------------------------------------------------------------------
// Launch at login
// ---------------------------------------------------------------------------

const loginItemSupported = () => process.platform === 'darwin' || process.platform === 'win32';

// Windows identifies login items by executable path + args, so the same options must be used to read and write.
function loginItemOptions() {
  if (process.platform !== 'win32') return {};
  if (process.env.PORTABLE_EXECUTABLE_FILE) return { path: process.env.PORTABLE_EXECUTABLE_FILE };
  if (process.defaultApp) return { path: process.execPath, args: [path.resolve(process.argv[1] || '.')] };
  return { path: process.execPath };
}

function readLoginItem() {
  if (!loginItemSupported()) return false;
  try {
    return app.getLoginItemSettings(loginItemOptions()).openAtLogin === true;
  } catch {
    return false;
  }
}

function applyLoginItem(enabled) {
  if (!loginItemSupported()) throw new Error('Launch at login is not supported on this platform.');
  app.setLoginItemSettings({ ...loginItemOptions(), openAtLogin: enabled });
}

// ---------------------------------------------------------------------------
// Global shortcuts
// ---------------------------------------------------------------------------

function unregisterShortcuts() {
  for (const [key] of SHORTCUTS) globalShortcut.unregister(key);
}

function registerShortcuts() {
  unregisterShortcuts();
  const ok = SHORTCUTS.every(([key, direction, setting]) => globalShortcut.register(key, async () => {
    try {
      const step = direction * settingsStore.get()[setting];
      const reading = await request({ operation: 'read' });
      const result = await request({ operation: 'set', value: stepVolume(reading.current, step) });
      lastKnownMonitorVolume = result.current;
      if (osSync) osSync.setOsVolume(result.current);
      sendToWindow('volume-changed', result);
    } catch (error) {
      dialog.showErrorBox(APP_NAME, error.message);
    }
  }));
  if (!ok) unregisterShortcuts();
  return ok;
}

// ---------------------------------------------------------------------------
// OS audio sync: keeps the monitor volume aligned with the OS volume
// ---------------------------------------------------------------------------

const MEDIA_KEY_QUIET_MS = 120;
let mediaKeyState = { at: Number.NEGATIVE_INFINITY, direction: 0 };
let mediaKeyWrite = null;
let pendingMediaDirection = null;

function applyMediaKey(direction) {
  const decision = acceptMediaKey(mediaKeyState, direction, Date.now(), MEDIA_KEY_QUIET_MS);
  mediaKeyState = { at: decision.at, direction: decision.direction };
  if (!decision.accept) return;
  pendingMediaDirection = direction;
  if (mediaKeyWrite) return;
  const write = async () => {
    while (pendingMediaDirection !== null) {
      const directionNow = pendingMediaDirection;
      pendingMediaDirection = null;
      const step = directionNow * settingsStore.get().shortcutVolumeStep;
      if (!Number.isInteger(lastKnownMonitorVolume)) {
        const reading = await request({ operation: 'read' });
        lastKnownMonitorVolume = reading.current;
      }
      const target = stepVolume(lastKnownMonitorVolume, step);
      const result = await request({ operation: 'set', value: target });
      lastKnownMonitorVolume = result.current;
      sendToWindow('volume-changed', result);
    }
  };
  mediaKeyWrite = write()
    .catch(err => {
      console.error('Keyboard volume sync failed:', err.message);
      pendingMediaDirection = null;
    })
    .finally(() => { mediaKeyWrite = null; });
}

function startOsSync() {
  if (osSync) return;
  osSync = createOsAudioSync({
    onVolumeKey: applyMediaKey,
    onListenerError: message => {
      dialog.showMessageBox({
        type: 'info',
        message: 'Keyboard volume keys are blocked',
        detail: message,
        buttons: ['Open Settings', 'Later']
      }).then(({ response }) => {
        if (response === 0) shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility');
      }).catch(err => console.error('Could not show the accessibility prompt:', err.message));
    },
    onVolumeChange: async (osVolume, osMuted, isInitial) => {
      // On start, align the monitor with the current OS volume.
      if (isInitial) {
        try {
          const result = await request({ operation: 'set', value: osVolume });
          lastKnownMonitorVolume = result.current;
          if (osMuted) {
            await request({ operation: 'mute' });
            lastKnownMonitorMuted = true;
          }
          sendToWindow('volume-changed', { current: result.current, muted: osMuted });
        } catch (err) {
          console.error('Initial OS-to-monitor volume sync failed:', err.message);
        }
        return;
      }

      if (lastKnownMonitorVolume === osVolume && lastKnownMonitorMuted === osMuted) return;

      clearTimeout(syncDebounceTimer);
      syncDebounceTimer = setTimeout(async () => {
        try {
          let lastResult = null;
          if (lastKnownMonitorVolume !== osVolume) {
            lastResult = await request({ operation: 'set', value: osVolume });
            lastKnownMonitorVolume = lastResult.current;
          }
          if (lastKnownMonitorMuted !== osMuted) {
            lastResult = await request({ operation: osMuted ? 'mute' : 'unmute' });
            lastKnownMonitorMuted = lastResult.muted;
          }
          if (lastResult) sendToWindow('volume-changed', lastResult);
        } catch (err) {
          console.error('OS volume sync update failed:', err.message);
        }
      }, 120);
    }
  });
}

function stopOsSync() {
  clearTimeout(syncDebounceTimer);
  mediaKeyState = { at: Number.NEGATIVE_INFINITY, direction: 0 };
  pendingMediaDirection = null;
  if (osSync) osSync.stop();
  osSync = null;
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

// Apply the side effects of changed settings. Returns the settings that actually took effect plus any error.
function applySettings(previous, next) {
  const errors = [];
  const corrections = {};

  if (previous.theme !== next.theme) applyTheme(next.theme);

  if (previous.launchAtLogin !== next.launchAtLogin) {
    try {
      applyLoginItem(next.launchAtLogin);
    } catch (error) {
      corrections.launchAtLogin = previous.launchAtLogin;
      errors.push(error.message);
    }
  }

  if (previous.shortcutsEnabled !== next.shortcutsEnabled) {
    if (!next.shortcutsEnabled) unregisterShortcuts();
    else if (!registerShortcuts()) {
      corrections.shortcutsEnabled = false;
      errors.push('Could not register the volume shortcuts. They may already be in use by another app.');
    }
  }

  if (previous.syncOsVolume !== next.syncOsVolume) {
    if (next.syncOsVolume) startOsSync();
    else stopOsSync();
  }

  const settings = Object.keys(corrections).length ? settingsStore.update(corrections) : next;
  return { settings, error: errors.join(' ') || null };
}

function updateSettings(patch) {
  const previous = settingsStore.get();
  const next = settingsStore.update(patch);
  const outcome = applySettings(previous, next);
  buildTrayMenu();
  sendToWindow('settings-changed', outcome.settings);
  return outcome;
}

// Load persisted settings and apply them before the window is shown.
function initSettings() {
  settingsStore = createSettingsStore({ file: path.join(app.getPath('userData'), 'settings.json') });
  let settings = settingsStore.load();

  // The OS is the source of truth for login items: the user may have removed it in System Settings.
  const osLoginItem = readLoginItem();
  if (loginItemSupported() && osLoginItem !== settings.launchAtLogin) {
    settings = settingsStore.update({ launchAtLogin: osLoginItem });
  }

  applyTheme(settings.theme);

  if (!SMOKE_TEST) {
    if (settings.shortcutsEnabled && !registerShortcuts()) {
      settings = settingsStore.update({ shortcutsEnabled: false });
      console.error('Volume shortcuts could not be registered at startup; disabled.');
    }
    if (settings.syncOsVolume) startOsSync();
  }
  return settings;
}

// ---------------------------------------------------------------------------
// Tray
// ---------------------------------------------------------------------------

function buildTrayMenu() {
  if (!tray) return;
  const settings = settingsStore.get();
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: `Show ${APP_NAME}`, click: showWindow },
    { label: 'Settings…', click: () => { showWindow(); sendToWindow('open-settings'); } },
    { type: 'separator' },
    {
      label: 'Volume shortcuts',
      type: 'checkbox',
      checked: settings.shortcutsEnabled,
      click: item => {
        const { error } = updateSettings({ shortcutsEnabled: item.checked });
        if (error) dialog.showErrorBox(APP_NAME, error);
      }
    },
    {
      label: 'Sync with system volume',
      type: 'checkbox',
      checked: settings.syncOsVolume,
      click: item => updateSettings({ syncOsVolume: item.checked })
    },
    {
      label: 'Appearance',
      submenu: [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']].map(([value, label]) => ({
        label,
        type: 'radio',
        checked: settings.theme === value,
        click: () => updateSettings({ theme: value })
      }))
    },
    { type: 'separator' },
    { label: 'Quit', click: () => { quitting = true; app.quit(); } }
  ]));
}

function appIconFile() {
  if (process.platform === 'win32' && fs.existsSync(path.join(__dirname, 'icon.ico'))) {
    return path.join(__dirname, 'icon.ico');
  }
  return path.join(__dirname, 'icon.png');
}

function applyDockIcon() {
  if (process.platform !== 'darwin' || !app.dock) return;
  const image = nativeImage.createFromPath(path.join(__dirname, 'icon.png'));
  if (!image.isEmpty()) app.dock.setIcon(image);
}

function createTray() {
  const trayIconPath = path.join(__dirname, 'tray-icon.png');
  const iconPath = fs.existsSync(trayIconPath) ? trayIconPath : path.join(__dirname, 'icon.png');
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  tray = new Tray(icon);
  tray.setToolTip(APP_NAME);
  tray.on('click', () => { if (window.isVisible()) window.hide(); else showWindow(); });
  buildTrayMenu();
}

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

if (!SMOKE_TEST && !app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', showWindow);
  app.whenReady().then(start);
}

function start() {
  applyDockIcon();
  Menu.setApplicationMenu(null);
  const settings = initSettings();

  ipcMain.handle('volume', async (_event, operation) => {
    const result = await request(operation);
    if (operation.operation === 'set' && Number.isInteger(result.current)) {
      lastKnownMonitorVolume = result.current;
      if (osSync) osSync.setOsVolume(result.current);
    } else if ((operation.operation === 'mute' || operation.operation === 'unmute') && typeof result.muted === 'boolean') {
      lastKnownMonitorMuted = result.muted;
      if (osSync) osSync.setOsMute(result.muted);
    } else if (operation.operation === 'read') {
      lastKnownMonitorVolume = result.current;
      lastKnownMonitorMuted = result.muted;
    }
    return result;
  });

  ipcMain.handle('settings-get', () => ({
    settings: settingsStore.get(),
    capabilities: { launchAtLogin: loginItemSupported() }
  }));
  ipcMain.handle('settings-set', (_event, patch) => updateSettings(patch));

  ipcMain.handle('app-info', () => ({
    name: APP_NAME,
    version: app.getVersion(),
    electronVersion: process.versions.electron,
    chromeVersion: process.versions.chrome,
    nodeVersion: process.versions.node,
    platform: process.platform,
    arch: process.arch,
    backend: process.platform === 'win32'
      ? 'Windows DDC/CI (dxva2)'
      : (process.platform === 'darwin' ? 'macOS Apple Silicon (m1ddc)' : 'Unsupported'),
    targetDisplay: 'LG UltraWide 49WQ95C',
    userDataPath: app.getPath('userData')
  }));

  ipcMain.handle('open-user-data', async () => {
    try {
      await shell.openPath(app.getPath('userData'));
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('copy-to-clipboard', (_event, text) => {
    clipboard.writeText(String(text || ''));
    return true;
  });

  window = new BrowserWindow({
    width: 380,
    height: 520,
    show: false,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    frame: false,
    icon: appIconFile(),
    backgroundColor: currentBackground(),
    title: APP_NAME,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  nativeTheme.on('updated', () => {
    if (!window.isDestroyed()) window.setBackgroundColor(currentBackground());
  });

  ipcMain.handle('window-minimize', () => {
    if (!window.isDestroyed()) window.minimize();
  });
  ipcMain.handle('window-close', () => {
    if (!quitting && !window.isDestroyed()) window.hide();
    else app.quit();
  });

  if (SMOKE_TEST) {
    window.webContents.once('did-finish-load', async () => {
      try {
        const result = await request({ operation: 'read' });
        if (!Number.isInteger(result.current)) throw new Error('Invalid volume result');
        console.log('Electron smoke test passed; monitor volume:', result.current);
        app.exit(0);
      } catch (error) {
        console.error(error.message);
        app.exit(1);
      }
    });
  } else {
    createTray();
    window.on('close', event => { if (!quitting) { event.preventDefault(); window.hide(); } });
    window.once('ready-to-show', () => { if (!settings.startHidden) showWindow(); });
  }

  window.loadFile(path.join(__dirname, 'index.html'));
}

app.on('before-quit', () => { quitting = true; });
app.on('window-all-closed', () => app.quit());
app.on('will-quit', () => {
  stopOsSync();
  globalShortcut.unregisterAll();
});
