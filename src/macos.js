'use strict';
const { parseRequest } = require('./operations');

// m1ddc names for each feature (VCP 0x62 volume, 0x10 luminance, 0x12 contrast, 0x60 input).
const M1DDC_FEATURE = Object.freeze({ volume: 'volume', brightness: 'luminance', contrast: 'contrast', input: 'input' });
const EXPECTED_MAXIMUM = 100;
const READ_ATTEMPTS = 4;
const READ_DELAY_MS = 60;
// The monitor occasionally drops a write outright, so a write that never reads back is re-sent once.
const WRITE_ATTEMPTS = 2;

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

function createMacBackend(run, { delay = pause } = {}) {
  return async raw => {
    const request = parseRequest(raw);
    if (request.operation === 'mute' || request.operation === 'unmute') throw new Error('Mute is not yet verified on macOS.');
    if (request.feature === 'power') throw new Error('Power control is not yet implemented on macOS backend.');
    const list = await run(['display', 'list', 'detailed']);
    const entries = list.split(/(?=^\[\d+\] )/m).filter(Boolean);
    const matches = entries.filter(e => /\b(?:LG\s+ULTRAWIDE|49WQ95C)\b/i.test(e) && /Vendor:\s*\d+\s*\(0x1e6d\)/i.test(e));
    if (matches.length !== 1) throw new Error('Expected exactly one LG ULTRAWIDE display; check the connection.');
    const id = matches[0].match(/^\[\d+\].*\(([0-9a-f-]{36})\)/im)?.[1];
    if (!id) throw new Error('Could not identify the LG display.');
    const name = M1DDC_FEATURE[request.feature];
    const getNumber = async cmd => {
      const output = (await run(['display', id, cmd, name])).trim();
      if (!/^\d+$/.test(output)) throw new Error('Invalid monitor response');
      return Number(output);
    };
    // DDC replies are sometimes garbage (e.g. 28270, or 0 for the maximum), so retry until one looks valid.
    const readUntil = async (cmd, accept) => {
      let value = null;
      for (let attempt = 0; attempt < READ_ATTEMPTS; attempt++) {
        if (attempt > 0) await delay(READ_DELAY_MS);
        value = await getNumber(cmd);
        if (accept(value)) return value;
      }
      return value;
    };
    const isContinuous = request.feature === 'volume' || request.feature === 'brightness' || request.feature === 'contrast';
    const maximum = await readUntil('max', value => isContinuous ? value === EXPECTED_MAXIMUM : value > 0);
    let current = await readUntil('get', value => value <= maximum);
    if ((isContinuous && maximum !== EXPECTED_MAXIMUM) || current > maximum) {
      throw new Error(`Unsupported or unverified ${request.feature} range`);
    }
    if (request.operation === 'set') {
      for (let attempt = 0; attempt < WRITE_ATTEMPTS && current !== request.value; attempt++) {
        await run(['display', id, 'set', name, String(request.value)]);
        current = await readUntil('get', value => value === request.value);
      }
      const featureLabel = request.feature === 'volume' ? 'Volume' : (request.feature === 'brightness' ? 'Brightness' : (request.feature === 'contrast' ? 'Contrast' : 'Input'));
      if (isContinuous && current > maximum) throw new Error(`${featureLabel} was sent but readback is invalid`);
    }
    return { current, maximum, requested: request.operation === 'set' ? request.value : null };
  };
}
module.exports = { createMacBackend };
