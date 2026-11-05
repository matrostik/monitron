'use strict';
// Monitor features Monitron can control over DDC/CI.
const FEATURES = Object.freeze(['volume', 'brightness']);

function parseRequest(request) {
  const feature = request?.feature ?? 'volume';
  if (!FEATURES.includes(feature)) throw new Error('Invalid monitor feature');
  if (!request || request.operation === 'read') return { feature, operation: 'read' };
  if (request.operation === 'mute' || request.operation === 'unmute') {
    if (feature !== 'volume') throw new Error('Only volume can be muted');
    return { feature, operation: request.operation };
  }
  if (request.operation === 'set' && Number.isInteger(request.value) && request.value >= 0 && request.value <= 100) return { feature, operation: 'set', value: request.value };
  throw new Error(`Invalid operation or ${feature}`);
}
module.exports = { FEATURES, parseRequest };
