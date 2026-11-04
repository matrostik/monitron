const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createMacBackend } = require('../src/macos');

const listing = '[1] LG ULTRAWIDE (12345678-1234-1234-1234-123456789ABC)\n - Vendor:        7789 (0x1e6d)\n';
test('reads and targets only the identified LG display', async () => {
  const calls = [];
  const run = async args => { calls.push(args); if (args[0] === 'display' && args[1] === 'list') return listing; if (args.includes('max')) return '100\n'; if (args.includes('get')) return '54\n'; return 'Writing 54\n'; };
  const backend = createMacBackend(run);
  assert.deepEqual(await backend({ operation: 'read' }), { current: 54, maximum: 100, requested: null });
  assert.ok(calls.some(args => args.includes('12345678-1234-1234-1234-123456789ABC')));
});
test('rejects ambiguous or missing LG displays before writing', async () => {
  const backend = createMacBackend(async () => listing + listing);
  await assert.rejects(backend({ operation: 'set', value: 20 }), /exactly one/i);
});
test('recognizes the specific model name as well as the generic LG name', async () => {
  const modelListing = listing.replace('LG ULTRAWIDE', 'LG 49WQ95C');
  const backend = createMacBackend(async args => args.includes('list') ? modelListing : args.includes('max') ? '100' : '40');
  assert.equal((await backend({ operation: 'read' })).current, 40);
});
