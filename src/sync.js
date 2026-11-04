'use strict';
const { spawn, execFile } = require('node:child_process');
const path = require('node:path');

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
    const readMacVolume = () => new Promise((resolve, reject) => {
      execFile('osascript', ['-e', 'output volume of (get volume settings)', '-e', 'output muted of (get volume settings)'], { timeout: 4000 }, (err, stdout) => {
        if (err) return reject(err);
        const lines = stdout.trim().split(/\r?\n/).map(s => s.trim());
        const volume = Number(lines[0]);
        const muted = lines[1] === 'true';
        if (Number.isFinite(volume)) resolve({ volume, muted });
        else reject(new Error('Invalid mac volume reading'));
      });
    });

    readMacVolume().then(({ volume, muted }) => {
      if (!stopped && onVolumeChange) {
        lastMacVolume = volume;
        lastMacMuted = muted;
        onVolumeChange(volume, muted, true);
      }
    }).catch(() => {});

    macTimer = setInterval(async () => {
      if (stopped) return;
      try {
        const { volume, muted } = await readMacVolume();
        if (volume !== lastMacVolume || muted !== lastMacMuted) {
          lastMacVolume = volume;
          lastMacMuted = muted;
          if (onVolumeChange && !stopped) onVolumeChange(volume, muted, false);
        }
      } catch {}
    }, macIntervalMs);

    return {
      setOsVolume(val) {
        execFile('osascript', ['-e', `set volume output volume ${Math.round(val)}`], () => {});
      },
      setOsMute(muted) {
        execFile('osascript', ['-e', `set volume output muted ${muted ? 'true' : 'false'}`], () => {});
      },
      stop() {
        stopped = true;
        if (macTimer) clearInterval(macTimer);
      }
    };
  }

  return {
    setOsVolume() {},
    setOsMute() {},
    stop() {}
  };
}

module.exports = { createOsAudioSync };
