const assert = require('node:assert/strict');
const test = require('node:test');
const { getDeviceIdentity } = require('../dist/platform');
const {
  findInputIdentifier,
  getBroadcastInputKey,
  getStatusPollDelayMs,
  isPlaybackDefinitelyActive,
  shouldPrepareOperationWake,
} = require('../dist/platformAccessory');

test('operation wake is enabled only for discrete power mode after threshold', () => {
  assert.equal(shouldPrepareOperationWake('discrete', 30_000, 30_000), true);
  assert.equal(shouldPrepareOperationWake('discrete', 29_999, 30_000), false);
  assert.equal(shouldPrepareOperationWake('toggle', 60_000, 30_000), false);
});

test('device identity is stable across display-name and MAC letter-case changes', () => {
  assert.equal(
    getDeviceIdentity({ ip: '192.0.2.10', mac: 'AA:BB:CC:DD:EE:FF' }),
    'aa:bb:cc:dd:ee:ff',
  );
  assert.equal(getDeviceIdentity({ ip: '192.0.2.10' }), '192.0.2.10');
});

test('broadcast channel codes map to terrestrial, BS, and CS inputs', () => {
  assert.equal(getBroadcastInputKey('JP-G7fe00400'), '40BF7A');
  assert.equal(getBroadcastInputKey('JP-G00040065'), '40BF7C');
  assert.equal(getBroadcastInputKey('JP-G00060037'), '40BF7D');
  assert.equal(getBroadcastInputKey('JP-G000700a1'), '40BF7D');
  assert.equal(getBroadcastInputKey(''), '40BF7A');
});

test('status polling respects configured input identifiers', () => {
  const inputs = [
    { name: '地デジ', key: '40BF7A', identifier: 10 },
    { name: 'BS', key: 'bs', identifier: 20 },
    { name: 'CS', key: '40BF7D', identifier: 30 },
    { name: 'HDMI', key: '40BF3A', identifier: 40 },
  ];
  assert.equal(findInputIdentifier(inputs, '40BF7A'), 10);
  assert.equal(findInputIdentifier(inputs, '40BF7C'), 20);
  assert.equal(findInputIdentifier(inputs, '40BF7D'), 30);
  assert.equal(findInputIdentifier(inputs, '40BF3A'), 40);
  assert.equal(findInputIdentifier(inputs, 'unknown'), undefined);
});

test('only broadcast playback is definitely active on 55J10X', () => {
  assert.equal(isPlaybackDefinitelyActive(0, 'broadcast'), true);
  assert.equal(isPlaybackDefinitelyActive(0, 'external'), false);
  assert.equal(isPlaybackDefinitelyActive(1, 'broadcast'), false);
  assert.equal(isPlaybackDefinitelyActive(1, 'external'), false);
  assert.equal(isPlaybackDefinitelyActive(0, 'unknown'), false);
});

test('status polling uses a low-load interval and progressive failure backoff', () => {
  assert.equal(getStatusPollDelayMs(120, 0), 120_000);
  assert.equal(getStatusPollDelayMs(120, 1), 120_000);
  assert.equal(getStatusPollDelayMs(120, 2), 120_000);
  assert.equal(getStatusPollDelayMs(120, 3), 300_000);
  assert.equal(getStatusPollDelayMs(120, 4), 600_000);
  assert.equal(getStatusPollDelayMs(300, 1), 300_000);
});
