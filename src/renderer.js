'use strict';

const slider = document.querySelector('#volume');
const value = document.querySelector('#value');
const status = document.querySelector('#status');
const statusDot = document.querySelector('#status-dot');
const stepButtons = Array.from(document.querySelectorAll('.step-btn'));
const presetChips = Array.from(document.querySelectorAll('.preset-chip'));
const muteButton = document.querySelector('#mute');
const muteLabel = document.querySelector('#mute-label');
const speakerIconBtn = document.querySelector('#speaker-icon-btn');
const speakerSvg = document.querySelector('#speaker-svg');
const refreshBtns = [document.querySelector('#refresh'), document.querySelector('#title-refresh')].filter(Boolean);

// Window controls
const winClose = document.querySelector('#win-close');
const winMinimize = document.querySelector('#win-minimize');
const winZoom = document.querySelector('#win-zoom');

if (winClose) winClose.addEventListener('click', () => window.monitor.close?.());
if (winMinimize) winMinimize.addEventListener('click', () => window.monitor.minimize?.());
if (winZoom) winZoom.addEventListener('click', () => perform('read'));

let muted = null;
let busy = false;
let wheelDebounceTimer = null;
let pendingWheelTarget = null;

function updateSpeakerIcon(val, isMuted) {
  if (!speakerSvg) return;
  if (isMuted) {
    speakerSvg.innerHTML = '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>';
  } else if (val === 0) {
    speakerSvg.innerHTML = '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>';
  } else if (val <= 50) {
    speakerSvg.innerHTML = '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>';
  } else {
    speakerSvg.innerHTML = '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>';
  }
}

function updateVisuals(vol, isMuted) {
  slider.value = vol;
  value.textContent = `${vol}%`;
  document.documentElement.style.setProperty('--vol-percent', `${vol}%`);
  updateSpeakerIcon(vol, isMuted);
}

function setBusy(isBusy, text) {
  busy = isBusy;
  slider.disabled = isBusy;
  if (muteButton) muteButton.disabled = isBusy || (muted === null);
  if (speakerIconBtn) speakerIconBtn.disabled = isBusy || (muted === null);
  stepButtons.forEach(btn => { if (btn) btn.disabled = isBusy; });
  presetChips.forEach(chip => { chip.disabled = isBusy; });
  refreshBtns.forEach(btn => {
    const icon = btn.querySelector('.refresh-icon') || btn.querySelector('.icon');
    if (icon) icon.classList.toggle('spinning', isBusy);
  });

  if (statusDot) {
    statusDot.className = 'status-dot';
    if (isBusy) {
      statusDot.classList.add('busy');
    }
  }

  if (text && status) {
    status.textContent = text;
  }
}

async function perform(operation, target) {
  if (busy) return;
  setBusy(true, operation === 'read' ? 'Reading monitor…' : 'Updating monitor…');

  try {
    const result = operation === 'read'
      ? await window.monitor.read()
      : operation === 'set'
        ? await window.monitor.set(target)
        : await window.monitor.mute(target);

    updateVisuals(result.current, result.muted === true);

    muted = typeof result.muted === 'boolean' ? result.muted : null;
    if (muteLabel) muteLabel.textContent = muted ? 'Unmute' : 'Mute';
    if (muteButton) {
      muteButton.classList.toggle('active', !!muted);
      muteButton.disabled = muted === null;
    }
    if (speakerIconBtn) {
      speakerIconBtn.disabled = muted === null;
      speakerIconBtn.title = muted ? 'Click to unmute' : 'Click to mute';
    }

    if (status) {
      status.textContent = result.requested !== null && result.current !== result.requested
        ? 'Monitor returned a different value.'
        : 'Connected';
    }
    if (statusDot) {
      statusDot.className = 'status-dot connected';
    }
    slider.disabled = false;
    stepButtons.forEach(button => { if (button) button.disabled = false; });
    presetChips.forEach(chip => { chip.disabled = false; });
  } catch (error) {
    if (status) status.textContent = error.message;
    if (statusDot) statusDot.className = 'status-dot error';
    value.textContent = '—';
  } finally {
    setBusy(false);
  }
}

// Live drag feedback on slider
slider.addEventListener('input', () => {
  const currentVal = Number(slider.value);
  value.textContent = `${currentVal}%`;
  document.documentElement.style.setProperty('--vol-percent', `${currentVal}%`);
  updateSpeakerIcon(currentVal, !!muted);
});

// Commit value on release
slider.addEventListener('change', () => perform('set', Number(slider.value)));

// Keyboard arrow key fine-tuning on slider
slider.addEventListener('keydown', e => {
  if (busy) return;
  const current = Number(slider.value);
  const step = e.shiftKey ? 5 : 1;
  if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
    e.preventDefault();
    perform('set', Math.min(100, current + step));
  } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
    e.preventDefault();
    perform('set', Math.max(0, current - step));
  }
});

// Mouse wheel on slider for smooth 1% adjustment
slider.addEventListener('wheel', e => {
  e.preventDefault();
  if (busy) return;
  const step = e.shiftKey ? 5 : 1;
  const base = pendingWheelTarget !== null ? pendingWheelTarget : Number(slider.value);
  const nextVal = e.deltaY < 0 ? Math.min(100, base + step) : Math.max(0, base - step);
  if (nextVal === base) return;

  pendingWheelTarget = nextVal;
  updateVisuals(nextVal, !!muted);

  clearTimeout(wheelDebounceTimer);
  wheelDebounceTimer = setTimeout(() => {
    const target = pendingWheelTarget;
    pendingWheelTarget = null;
    perform('set', target);
  }, 220);
}, { passive: false });

// Steppers (supports −5%, −1%, +1%, +5%)
stepButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const step = Number(btn.dataset.step);
    if (!Number.isNaN(step)) {
      perform('set', Math.max(0, Math.min(100, Number(slider.value) + step)));
    }
  });
});

// Preset chips
presetChips.forEach(chip => {
  chip.addEventListener('click', () => {
    const target = Number(chip.dataset.val);
    if (!Number.isNaN(target)) perform('set', target);
  });
});

// Mute toggle
muteButton?.addEventListener('click', () => perform('mute', !muted));
speakerIconBtn?.addEventListener('click', () => perform('mute', !muted));

// Refresh buttons
refreshBtns.forEach(btn => btn?.addEventListener('click', () => perform('read')));

// Hardware updates from shortcuts / background
window.monitor.onChanged(result => {
  if (!busy) {
    updateVisuals(result.current, result.muted === true);
    if (status) status.textContent = 'Connected';
    if (statusDot) statusDot.className = 'status-dot connected';
  }
});

// Initial read
perform('read');
