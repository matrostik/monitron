'use strict';
function parseRequest(request) {
  if (!request || request.operation === 'read') return { operation: 'read' };
  if (request.operation === 'mute' || request.operation === 'unmute') return { operation: request.operation };
  if (request.operation === 'set' && Number.isInteger(request.value) && request.value >= 0 && request.value <= 100) return { operation: 'set', value: request.value };
  throw new Error('Invalid operation or volume');
}
module.exports = { parseRequest };
