'use strict';

const { toPercent, fromPercent } = require('./volume');

function validateReading(reading) {
  if (!reading || reading.type !== 1 || reading.continuous !== true) {
    throw new Error('Volume range has not been verified as continuous');
  }
  return { current: reading.current, maximum: reading.maximum, percent: toPercent(reading.current, reading.maximum) };
}

function targetValue(percent, reading) {
  return fromPercent(percent, reading.maximum);
}

module.exports = { validateReading, targetValue };
