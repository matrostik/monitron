'use strict';
const { spawn, execFile } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const MAC_VOLUME_SCRIPT = [
  'set s to get volume settings',
  'if output volume of s is missing value then',
  'set vol to "missing value"',
  'else',
  'set vol to (output volume of s as integer) as text',
  'end if',
  'if output muted of s is missing value then',
  'set mut to "missing value"',
  'else',
  'set mut to (output muted of s as text)',
  'end if',
  'return vol & linefeed & mut'
].join('\n');

function parseMacVolumeReading(stdout) {
  const lines = String(stdout || '').trim().split(/\r?\n/).map(line => line.trim());
  if (lines.length < 2) return null;
  const muted = lines[1] === 'true';
  if (lines[0] === 'missing value') return { volume: null, muted };
  const volume = Number(lines[0]);
  if (!Number.isFinite(volume)) return null;
  return { volume, muted };
}

function createOsAudioSync(options = {}) {
  const {
    platform = process.platform,
    onVolumeChange, // (volume: number, muted: boolean, isInitial: boolean) => void
    scriptPath = path.join(__dirname, '..', 'scripts', 'windows-audio-listener.ps1'),
    macIntervalMs = 800
  } = options;

  let stopped = false;
  let processHandle = null;
  let macTimer = null;
  let lastMacVolume = null;
  let lastMacMuted = null;

  if (platform === 'win32') {
    const child = spawn('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      scriptPath
    ], { windowsHide: true });

    processHandle = child;
    let buffer = '';

    child.stdout.on('data', chunk => {
      buffer += chunk.toString();
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop(); // keep remainder
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const parsed = JSON.parse(trimmed);
          if (parsed && typeof parsed.volume === 'number') {
            const isInitial = parsed.type === 'init';
            if (onVolumeChange && !stopped) {
              onVolumeChange(parsed.volume, !!parsed.muted, isInitial);
            }
          }
        } catch {}
      }
    });

    child.on('error', err => {
      console.error('Windows audio listener error:', err.message);
    });

    return {
      setOsVolume(val) {
        if (!stopped && child.stdin && !child.stdin.destroyed) {
          try { child.stdin.write(`SET ${Math.round(val)}\n`); } catch {}
        }
      },
      setOsMute(muted) {
        if (!stopped && child.stdin && !child.stdin.destroyed) {
          try { child.stdin.write(`MUTE ${muted ? 'true' : 'false'}\n`); } catch {}
        }
      },
      stop() {
        stopped = true;
        if (child.stdin && !child.stdin.destroyed) {
          try { child.stdin.write('QUIT\n'); } catch {}
        }
        setTimeout(() => {
          try { child.kill(); } catch {}
        }, 500);
      }
    };
  }

  if (platform === 'darwin') {
    const {
      onVolumeKey,
      onListenerError,
      mediaKeyPath = path.join(__dirname, '..', 'scripts', 'mac-media-keys')
    } = options;
    let keyProcess = null;
    let keyBuffer = '';
    let osVolumeAvailable = false;
    let reportedKeyError = false;

    const readMacVolume = () => new Promise((resolve, reject) => {
      execFile('osascript', ['-e', MAC_VOLUME_SCRIPT], { timeout: 4000 }, (err, stdout) => {
        if (err) return reject(err);
        const reading = parseMacVolumeReading(stdout);
        if (!reading) return reject(new Error('Invalid mac volume reading'));
        resolve(reading);
      });
    });

    const stopKeyListener = () => {
      if (!keyProcess) return;
      const child = keyProcess;
      keyProcess = null;
      try { child.kill(); } catch {}
    };

    const startKeyListener = () => {
      if (keyProcess || stopped) return;
      if (!fs.existsSync(mediaKeyPath)) {
        if (!reportedKeyError && onListenerError) {
          reportedKeyError = true;
          onListenerError('The keyboard volume helper is not built. Run npm run build:mac.');
        }
        return;
      }
      const child = spawn(mediaKeyPath, [], { stdio: ['ignore', 'pipe', 'pipe'] });
      keyProcess = child;
      child.stdout.on('data', chunk => {
        keyBuffer += chunk.toString();
        const lines = keyBuffer.split(/\r?\n/);
        keyBuffer = lines.pop();
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          let parsed;
          try { parsed = JSON.parse(trimmed); } catch { continue; }
          if (parsed.type === 'error' && !reportedKeyError && onListenerError) {
            reportedKeyError = true;
            onListenerError('Allow Monitron to receive keyboard volume keys in System Settings → Privacy & Security → Accessibility, then reopen the app.');
          }
          if (parsed.type === 'key' && !osVolumeAvailable && !stopped && onVolumeKey) {
            const direction = parsed.direction;
            if (direction === 1 || direction === -1) onVolumeKey(direction);
          }
        }
      });
      child.on('error', err => {
        if (!reportedKeyError && onListenerError) {
          reportedKeyError = true;
          onListenerError(err.message);
        }
      });
      child.on('exit', () => {
        if (keyProcess === child) keyProcess = null;
      });
    };

    const applyReading = (reading, isInitial) => {
      osVolumeAvailable = Number.isFinite(reading.volume);
      if (!osVolumeAvailable) {
        startKeyListener();
        return;
      }
      stopKeyListener();
      if (reading.volume === lastMacVolume && reading.muted === lastMacMuted) return;
      lastMacVolume = reading.volume;
      lastMacMuted = reading.muted;
      if (onVolumeChange && !stopped) onVolumeChange(reading.volume, reading.muted, isInitial);
    };

    readMacVolume().then(reading => {
      if (!stopped) applyReading(reading, true);
    }).catch(err => {
      console.error('macOS volume read failed:', err.message);
      if (!stopped) startKeyListener();
    });

    macTimer = setInterval(async () => {
      if (stopped) return;
      try {
        applyReading(await readMacVolume(), false);
      } catch (err) {
        console.error('macOS volume read failed:', err.message);
        startKeyListener();
      }
    }, macIntervalMs);

    return {
      setOsVolume(val) {
        if (!osVolumeAvailable) return;
        execFile('osascript', ['-e', `set volume output volume ${Math.round(val)}`], () => {});
      },
      setOsMute(muted) {
        if (!osVolumeAvailable) return;
        execFile('osascript', ['-e', `set volume output muted ${muted ? 'true' : 'false'}`], () => {});
      },
      stop() {
        stopped = true;
        if (macTimer) clearInterval(macTimer);
        stopKeyListener();
      }
    };
  }

  return {
    setOsVolume() {},
    setOsMute() {},
    stop() {}
  };
}

module.exports = { createOsAudioSync, parseMacVolumeReading };
