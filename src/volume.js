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

module.exports = { toPercent, fromPercent, stepVolume };
