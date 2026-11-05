'use strict';

function validRange(value, maximum) {
  if (!Number.isFinite(value) || !Number.isFinite(maximum) || maximum <= 0 || value < 0 || value > maximum) {
    throw new RangeError('Invalid volume or monitor range');
  }
}

function toPercent(value, maximum) {
  validRange(value, maximum);
  return Math.round(value * 100 / maximum);
}

function fromPercent(percent, maximum) {
  validRange(percent, 100);
  if (!Number.isFinite(maximum) || maximum <= 0) throw new RangeError('Invalid monitor range');
  return Math.round(percent * maximum / 100);
}

function stepVolume(current, step) {
  validRange(current, 100);
  if (!Number.isFinite(step)) throw new RangeError('Invalid volume step');
  return Math.max(0, Math.min(100, Math.round(current + step)));
}

// Keyboard volume keys repeat many times for one press. Accept the first event,
// then ignore the rest of that burst until the events stop.
function acceptMediaKey(state, direction, now, quietMs) {
  const previous = state && Number.isFinite(state.at) ? state : { at: Number.NEGATIVE_INFINITY, direction: 0 };
  const gap = Number.isFinite(quietMs) && quietMs > 0 ? quietMs : 120;
  const sameBurst = previous.direction === direction && now - previous.at < gap;
  if (sameBurst) return { at: now, direction, accept: false };
  return { at: now, direction, accept: true };
}

module.exports = { toPercent, fromPercent, stepVolume, acceptMediaKey };
