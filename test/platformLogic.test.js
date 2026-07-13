const assert = require('node:assert/strict');
const test = require('node:test');
const { getDeviceIdentity } = require('../dist/platform');
const { shouldPrepareOperationWake } = require('../dist/platformAccessory');

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
