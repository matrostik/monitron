'use strict';
const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, globalShortcut, dialog } = require('electron');
const { execFile } = require('node:child_process');
const path = require('node:path');
const { parseRequest } = require('./operations');
const { createMacBackend } = require('./macos');
const { stepVolume } = require('./volume');
const { createOsAudioSync } = require('./sync');

let queue = Promise.resolve();
let tray;
let quitting = false;
let osSync;
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

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);

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

  const window = new BrowserWindow({
    width: 380,
    height: 480,
    resizable: false,
    maximizable: false,
    frame: false,
    backgroundColor: '#18181b',
    title: 'LG Monitor Control',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  ipcMain.handle('window-minimize', () => {
    if (window && !window.isDestroyed()) window.minimize();
  });
  ipcMain.handle('window-close', () => {
    if (!quitting && window && !window.isDestroyed()) window.hide();
    else app.quit();
  });

  if (!process.argv.includes('--smoke-test')) {
    // OS Audio Sync: connects OS volume to monitor volume
    osSync = createOsAudioSync({
      onVolumeChange: async (osVolume, osMuted, isInitial) => {
        // Requirement 2: On load, update monitor volume to match the OS volume
        if (isInitial) {
          try {
            console.log(`OS volume initialized (${osVolume}%, muted: ${osMuted}). Syncing monitor volume...`);
            const result = await request({ operation: 'set', value: osVolume });
            lastKnownMonitorVolume = result.current;
            if (osMuted) {
              await request({ operation: 'mute' });
              lastKnownMonitorMuted = true;
            }
            if (window && !window.isDestroyed()) {
              window.webContents.send('volume-changed', { current: osVolume, muted: osMuted });
            }
          } catch (err) {
            console.error('Initial OS-to-monitor volume sync failed:', err.message);
          }
          return;
        }

        // Requirement 1: When OS volume changes, update monitor volume to keep both at the same level
        if (lastKnownMonitorVolume === osVolume && lastKnownMonitorMuted === osMuted) {
          return;
        }

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
            if (window && !window.isDestroyed() && lastResult) {
              window.webContents.send('volume-changed', lastResult);
            }
          } catch (err) {
            console.error('OS volume sync update failed:', err.message);
          }
        }, 120);
      }
    });

    const icon = nativeImage.createFromPath(path.join(__dirname, 'icon.png')).resize({ width: 16, height: 16 });
    tray = new Tray(icon);
    tray.setToolTip('LG Monitor Control');
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Show volume', click: () => { window.show(); window.focus(); } },
      { label: 'Enable volume shortcuts (Ctrl+Alt+Up/Down ±2%, Shift ±1%)', type: 'checkbox', click: item => {
        const keys = [
          'CommandOrControl+Alt+Up',
          'CommandOrControl+Alt+Down',
          'CommandOrControl+Alt+Shift+Up',
          'CommandOrControl+Alt+Shift+Down'
        ];
        globalShortcut.unregisterAll();
        if (!item.checked) return;
        const register = (key, step) => globalShortcut.register(key, async () => {
          try {
            const reading = await request({ operation: 'read' });
            const nextVal = stepVolume(reading.current, step);
            const result = await request({ operation: 'set', value: nextVal });
            lastKnownMonitorVolume = result.current;
            if (osSync) osSync.setOsVolume(nextVal);
            window.webContents.send('volume-changed', result);
          } catch (error) { dialog.showErrorBox('Monitor control', error.message); }
        });
        const reg1 = register(keys[0], 2);
        const reg2 = register(keys[1], -2);
        const reg3 = register(keys[2], 1);
        const reg4 = register(keys[3], -1);
        if (!reg1 || !reg2 || !reg3 || !reg4) {
          globalShortcut.unregisterAll();
          item.checked = false;
          dialog.showErrorBox('Monitor control', 'Could not register the volume shortcuts. They may already be in use.');
        }
      } },
      { label: 'Quit', click: () => { quitting = true; app.quit(); } }
    ]));
    tray.on('click', () => { if (window.isVisible()) window.hide(); else { window.show(); window.focus(); } });
    window.on('close', event => { if (!quitting) { event.preventDefault(); window.hide(); } });
  }

  if (process.argv.includes('--smoke-test')) {
    window.hide();
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
  }

  window.loadFile(path.join(__dirname, 'index.html'));
});

app.on('window-all-closed', () => app.quit());
app.on('will-quit', () => {
  if (osSync) osSync.stop();
  globalShortcut.unregisterAll();
});
