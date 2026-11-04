'use strict';
const { parseRequest } = require('./operations');

function createMacBackend(run) {
  return async raw => {
    const request = parseRequest(raw);
    if (request.operation === 'mute' || request.operation === 'unmute') throw new Error('Mute is not yet verified on macOS.');
    const list = await run(['display', 'list', 'detailed']);
    const entries = list.split(/(?=^\[\d+\] )/m).filter(Boolean);
    const matches = entries.filter(e => /\b(?:LG\s+ULTRAWIDE|49WQ95C)\b/i.test(e) && /Vendor:\s*\d+\s*\(0x1e6d\)/i.test(e));
    if (matches.length !== 1) throw new Error('Expected exactly one LG ULTRAWIDE display; check the connection.');
    const id = matches[0].match(/^\[\d+\].*\(([0-9a-f-]{36})\)/im)?.[1];
    if (!id) throw new Error('Could not identify the LG display.');
    const getNumber = async cmd => {
      const output = (await run(['display', id, cmd, 'volume'])).trim();
      if (!/^\d+$/.test(output)) throw new Error('Invalid monitor response');
      return Number(output);
    };
    const maximum = await getNumber('max');
    let current = await getNumber('get');
    if (maximum !== 100 || current > maximum) throw new Error('Unsupported or unverified volume range');
    if (request.operation === 'set') {
      await run(['display', id, 'set', 'volume', String(request.value)]);
      current = await getNumber('get');
      if (current > maximum) throw new Error('Volume was sent but readback is invalid');
    }
    return { current, maximum, requested: request.operation === 'set' ? request.value : null };
  };
}
module.exports = { createMacBackend };
