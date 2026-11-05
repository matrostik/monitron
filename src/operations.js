'use strict';
// Monitor features Monitron can control over DDC/CI.
const FEATURES = Object.freeze(['volume', 'brightness', 'contrast', 'input', 'power']);
const INPUT_MAP = Object.freeze({
  15: 'DisplayPort 1',
  16: 'DisplayPort 2',
  17: 'HDMI 1',
  18: 'HDMI 2 / USB-C'
});
const POWER_MAP = Object.freeze({
  1: 'On',
  4: 'Standby'
});

function parseRequest(request) {
  const feature = request?.feature ?? 'volume';
  if (!FEATURES.includes(feature)) throw new Error('Invalid monitor feature');
  if (!request || request.operation === 'read') return { feature, operation: 'read' };
  if (request.operation === 'mute' || request.operation === 'unmute') {
    if (feature !== 'volume') throw new Error('Only volume can be muted');
    return { feature, operation: request.operation };
  }
  if (request.operation === 'set') {
    if (feature === 'input') {
      const val = Number(request.value);
      if (Number.isInteger(val) && val >= 1 && val <= 255) return { feature, operation: 'set', value: val };
      throw new Error('Invalid input port value');
    }
    if (feature === 'power') {
      const val = request.value === 'on' ? 1 : (request.value === 'standby' ? 4 : Number(request.value));
      if (val === 1 || val === 4) return { feature, operation: 'set', value: val };
      throw new Error('Invalid power state value');
    }
    if (Number.isInteger(request.value) && request.value >= 0 && request.value <= 100) {
      return { feature, operation: 'set', value: request.value };
    }
  }
  throw new Error(`Invalid operation or ${feature}`);
}

module.exports = { FEATURES, INPUT_MAP, POWER_MAP, parseRequest };
