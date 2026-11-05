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

const noDelay = async () => {};
function fakeMonitor(readings, maximums = [100]) {
  const calls = [];
  const queue = [...readings];
  const maxQueue = [...maximums];
  const run = async args => {
    calls.push(args);
    if (args[1] === 'list') return listing;
    if (args.includes('max')) return `${maxQueue.length > 1 ? maxQueue.shift() : maxQueue[0]}\n`;
    if (args.includes('get')) return `${queue.length > 1 ? queue.shift() : queue[0]}\n`;
    return 'Writing\n';
  };
  return { run, calls };
}

test('brightness uses the m1ddc luminance feature', async () => {
  const monitor = fakeMonitor([75, 40]);
  const backend = createMacBackend(monitor.run, { delay: noDelay });
  assert.deepEqual(await backend({ feature: 'brightness', operation: 'set', value: 40 }), { current: 40, maximum: 100, requested: 40 });
  assert.ok(monitor.calls.some(args => args.join(' ') === 'display 12345678-1234-1234-1234-123456789ABC set luminance 40'));
  assert.ok(!monitor.calls.some(args => args.includes('volume')));
});

test('retries a glitched readback after a write until it settles', async () => {
  const monitor = fakeMonitor([75, 28270, 0, 70]);
  const backend = createMacBackend(monitor.run, { delay: noDelay });
  const result = await backend({ feature: 'brightness', operation: 'set', value: 70 });
  assert.equal(result.current, 70);
});

test('re-sends a write the monitor dropped', async () => {
  const monitor = fakeMonitor([75, 75, 75, 75, 75, 70]);
  const backend = createMacBackend(monitor.run, { delay: noDelay });
  const result = await backend({ feature: 'brightness', operation: 'set', value: 70 });
  assert.equal(result.current, 70);
  assert.equal(monitor.calls.filter(args => args.includes('set')).length, 2);
});

test('skips the write when the monitor already has the requested value', async () => {
  const monitor = fakeMonitor([70]);
  const backend = createMacBackend(monitor.run, { delay: noDelay });
  assert.equal((await backend({ feature: 'brightness', operation: 'set', value: 70 })).current, 70);
  assert.equal(monitor.calls.filter(args => args.includes('set')).length, 0);
});

test('retries a glitched maximum reply', async () => {
  const monitor = fakeMonitor([75], [0, 100]);
  const backend = createMacBackend(monitor.run, { delay: noDelay });
  assert.equal((await backend({ feature: 'brightness', operation: 'read' })).maximum, 100);
});

test('reports a brightness readback that never settles', async () => {
  const monitor = fakeMonitor([75, 28270]);
  const backend = createMacBackend(monitor.run, { delay: noDelay });
  await assert.rejects(backend({ feature: 'brightness', operation: 'set', value: 70 }), /Brightness was sent but readback is invalid/);
});

test('rejects a brightness range other than 0-100', async () => {
  const backend = createMacBackend(async args => args[1] === 'list' ? listing : args.includes('max') ? '255' : '80', { delay: noDelay });
  await assert.rejects(backend({ feature: 'brightness', operation: 'read' }), /unverified brightness range/);
});

test("contrast uses the m1ddc contrast feature", async () => {
  const monitor = fakeMonitor([70, 65]);
  const backend = createMacBackend(monitor.run, { delay: noDelay });
  assert.deepEqual(await backend({ feature: "contrast", operation: "set", value: 65 }), { current: 65, maximum: 100, requested: 65 });
  assert.ok(monitor.calls.some(args => args.join(" ") === "display 12345678-1234-1234-1234-123456789ABC set contrast 65"));
  assert.ok(!monitor.calls.some(args => args.includes("volume")));
});
