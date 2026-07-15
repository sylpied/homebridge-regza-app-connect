const assert = require('node:assert/strict');
const test = require('node:test');
const { getDeviceIdentity, getEffectiveModel, migrateDefaultInputNames, migrateSelectKeyMode } = require('../dist/platform');
const { applyModelProfile } = require('../dist/modelProfiles');
const {
  findInputIdentifier,
  getBroadcastInputKey,
  getStatusPollDelayMs,
  getPlayPauseKey,
  getNavigationLayerAfterDateSelection,
  getRecorderPlayPauseKey,
  isConnectivityFailure,
  isPlaybackDefinitelyActive,
  shouldConfirmOffAfterConnectivityFailures,
  shouldPrepareOperationWake,
  shouldAutoCloseNavigationMenu,
} = require('../dist/platformAccessory');

test('operation wake is enabled only for discrete power mode after threshold', () => {
  assert.equal(shouldPrepareOperationWake('discrete', 30_000, 30_000), true);
  assert.equal(shouldPrepareOperationWake('discrete', 29_999, 30_000), false);
  assert.equal(shouldPrepareOperationWake('toggle', 60_000, 30_000), false);
});

test('only transport failures count as connectivity failures', () => {
  const unreachable = new Error('connect EHOSTUNREACH');
  unreachable.code = 'EHOSTUNREACH';
  assert.equal(isConnectivityFailure(unreachable), true);
  assert.equal(isConnectivityFailure(new Error('REGZA request timed out after 5000ms')), true);
  assert.equal(isConnectivityFailure(new Error('REGZA authentication failed')), false);
});

test('power state is confirmed OFF only after three consecutive connectivity failures', () => {
  assert.equal(shouldConfirmOffAfterConnectivityFailures(1), false);
  assert.equal(shouldConfirmOffAfterConnectivityFailures(2), false);
  assert.equal(shouldConfirmOffAfterConnectivityFailures(3), true);
  assert.equal(shouldConfirmOffAfterConnectivityFailures(4), true);
});

test('device identity is stable across display-name and MAC letter-case changes', () => {
  assert.equal(
    getDeviceIdentity({ ip: '192.0.2.10', mac: 'AA:BB:CC:DD:EE:FF' }),
    'tv:aa:bb:cc:dd:ee:ff',
  );
  assert.equal(getDeviceIdentity({ ip: '192.0.2.10' }), 'tv:192.0.2.10');
  assert.equal(
    getDeviceIdentity({ ip: '192.0.2.10', mac: 'AA:BB:CC:DD:EE:FF', deviceType: 'recorder' }),
    'recorder:192.0.2.10',
  );
});

test('TV and recorder identities remain distinct even if a MAC address was copied', () => {
  const common = { ip: '192.0.2.10', mac: 'AA:BB:CC:DD:EE:FF' };
  assert.notEqual(
    getDeviceIdentity({ ...common, deviceType: 'tv' }),
    getDeviceIdentity({ ...common, deviceType: 'recorder' }),
  );
});

test('recorder identity stays stable when its optional MAC is added or removed', () => {
  assert.equal(
    getDeviceIdentity({ ip: '192.0.2.20', deviceType: 'recorder' }),
    getDeviceIdentity({ ip: '192.0.2.20', mac: 'AA:BB:CC:DD:EE:FF', deviceType: 'recorder' }),
  );
  assert.equal(
    getDeviceIdentity({ ip: '192.0.2.20', mac: 'AA:BB:CC:DD:EE:FF', deviceType: 'recorder' }),
    'recorder:192.0.2.20',
  );
});

test('DBR profile repairs stale key overrides with verified recorder keys', () => {
  const profiled = applyModelProfile({ model: 'DBR-M590', keyMap: { display: 'custom' } });
  assert.equal(profiled.publishMode, 'external');
  assert.equal(profiled.keyMap.up, 'c0');
  assert.equal(profiled.keyMap.enter, '44');
  assert.equal(profiled.keyMap.timeshift, undefined);
  assert.equal(profiled.keyMap.blue, '29');
  assert.equal(profiled.keyMap.display, '5a');
  assert.equal(profiled.keyMap.rewind, '9a');
  assert.equal(profiled.keyMap.fastForward, '98');
});

test('55J10X is published as a standalone Television accessory', () => {
  assert.equal(applyModelProfile({ model: '55J10X' }).publishMode, 'external');
});

test('recorder device type repairs missing or stale model settings', () => {
  assert.equal(getEffectiveModel({ deviceType: 'recorder' }), 'DBR-M590');
  assert.equal(getEffectiveModel({ deviceType: 'recorder', model: '55J10X' }), 'DBR-M590');
  assert.equal(getEffectiveModel({ deviceType: 'tv', model: '55J10X' }), '55J10X');
  assert.equal(getEffectiveModel({ deviceType: 'tv', model: 'custom' }), 'custom');
  assert.equal(getEffectiveModel({ deviceType: 'recorder', model: 'custom' }), 'custom');
});

test('recorder navigation timers never send an automatic Back command', () => {
  assert.equal(shouldAutoCloseNavigationMenu('recorder'), false);
  assert.equal(shouldAutoCloseNavigationMenu('tv'), true);
  assert.equal(shouldAutoCloseNavigationMenu(undefined), true);
});

test('generic HomeKit input names migrate without overwriting custom names', () => {
  const migrated = migrateDefaultInputNames('55J10X', [
    { name: 'Input Source 1', key: 'unused', identifier: 1 },
    { name: '入力ソース2', key: 'unused', identifier: 2 },
    { name: 'ゲーム機', key: '40BF3A', identifier: 3 },
  ]);
  assert.deepEqual(migrated[0], { name: '地デジ', key: '40BF7A', identifier: 1 });
  assert.deepEqual(migrated[1], { name: 'BS', key: '40BF7C', identifier: 2 });
  assert.deepEqual(migrated[2], { name: 'ゲーム機', key: '40BF3A', identifier: 3 });
});

test('legacy HDMI labels migrate to a HomeKit-safe name', () => {
  const migrated = migrateDefaultInputNames('55J10X', [
    { name: 'HDMI（次のアクティブ入力）', key: '40BF3A', identifier: 4 },
    { name: 'HDMI (Next Active)', key: '40BF3A', identifier: 5 },
  ]);
  assert.equal(migrated[0].name, 'HDMI Next Active');
  assert.equal(migrated[1].name, 'HDMI Next Active');
});

test('early DBR Select defaults migrate to Start Menu-first behavior', () => {
  assert.equal(migrateSelectKeyMode('DBR-M590', 'normal'), 'menuFirst');
  assert.equal(migrateSelectKeyMode('DBR-M590', 'guideFirst'), 'menuFirst');
  assert.equal(migrateSelectKeyMode('DBR-M590', 'timeshiftFirst'), 'menuFirst');
  assert.equal(migrateSelectKeyMode('DBR-M590', 'menuFirst'), 'menuFirst');
  assert.equal(migrateSelectKeyMode('55J10X', 'guideFirst'), 'guideFirst');
});

test('recorder Play/Pause alternates between dedicated commands', () => {
  assert.equal(getRecorderPlayPauseKey(false), 'pause');
  assert.equal(getRecorderPlayPauseKey(true), 'play');
});

test('Play/Pause always alternates dedicated playback commands', () => {
  assert.equal(getPlayPauseKey(false), 'pause');
  assert.equal(getPlayPauseKey(true), 'play');
});

test('Select and Back both return date selection to the menu layer', () => {
  assert.equal(getNavigationLayerAfterDateSelection('dateSelection'), 'menu');
  assert.equal(getNavigationLayerAfterDateSelection('menu'), 'menu');
  assert.equal(getNavigationLayerAfterDateSelection('viewing'), 'viewing');
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
