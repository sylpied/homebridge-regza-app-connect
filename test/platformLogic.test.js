const assert = require('node:assert/strict');
const test = require('node:test');
const {
  getDeviceIdentity,
  getEffectiveModel,
  migrateDefaultInputNames,
  migrateSelectKeyMode,
  shouldScheduleLinkedRecorderPowerOff,
} = require('../dist/platform');
const { applyModelProfile } = require('../dist/modelProfiles');
const {
  findInputIdentifier,
  getBroadcastInputKey,
  getAccessorySerialNumber,
  getStatusPollDelayMs,
  getPlayPauseKey,
  getPlayPauseCompanionKey,
  getPlayPauseCommandPlan,
  getRecorderPowerSteps,
  getRecorderPlayPauseKey,
  isConnectivityFailure,
  isPlaybackDefinitelyActive,
  shouldConfirmOffAfterConnectivityFailures,
  shouldConfirmOffAfterSsdpMisses,
  shouldContinueRecorderOffNormalization,
  shouldPrepareOperationWake,
  shouldSkipPowerRequest,
  shouldAutoCloseNavigationMenu,
} = require('../dist/platformAccessory');

test('operation wake is enabled only for discrete power mode after threshold', () => {
  assert.equal(shouldPrepareOperationWake('discrete', 30_000, 30_000), true);
  assert.equal(shouldPrepareOperationWake('discrete', 29_999, 30_000), false);
  assert.equal(shouldPrepareOperationWake('toggle', 60_000, 30_000), false);
});

test('recorder power normalization has deterministic ON and OFF plans', () => {
  assert.deepEqual(getRecorderPowerSteps(true, true, true, true), ['recorderMenu', 'linkedTvOn']);
  assert.deepEqual(getRecorderPowerSteps(true, false, true, true), ['recorderMenu']);
  assert.deepEqual(getRecorderPowerSteps(true, true, false, true), ['recorderMenu']);
  assert.deepEqual(getRecorderPowerSteps(false, true, true, true), ['recorderMenu', 'delay', 'recorderToggle']);
  assert.deepEqual(getRecorderPowerSteps(false, true, true, false), ['recorderToggle']);
});

test('linked recorder OFF alignment runs only for a confirmed TV ON-to-OFF transition', () => {
  assert.equal(shouldScheduleLinkedRecorderPowerOff(true, false), true);
  assert.equal(shouldScheduleLinkedRecorderPowerOff(false, false), false);
  assert.equal(shouldScheduleLinkedRecorderPowerOff(undefined, false), false);
  assert.equal(shouldScheduleLinkedRecorderPowerOff(true, true), false);
});

test('recorder OFF normalization continues only while its linked TV remains confirmed OFF', () => {
  assert.equal(shouldContinueRecorderOffNormalization('192.0.2.10', false), true);
  assert.equal(shouldContinueRecorderOffNormalization('192.0.2.10', true), false);
  assert.equal(shouldContinueRecorderOffNormalization('192.0.2.10', undefined), false);
  assert.equal(shouldContinueRecorderOffNormalization(undefined, undefined), true);
});

test('recorder convergence runs regardless of its optimistic HomeKit power state', () => {
  assert.equal(shouldSkipPowerRequest('recorder', false, false), false);
  assert.equal(shouldSkipPowerRequest('recorder', false, true), false);
  assert.equal(shouldSkipPowerRequest('recorder', true, true), false);
  assert.equal(shouldSkipPowerRequest('tv', false, false), true);
  assert.equal(shouldSkipPowerRequest('tv', true, false), false);
});

test('accessory serial number falls back to IP when MAC is blank', () => {
  assert.equal(getAccessorySerialNumber({ mac: '', ip: '192.0.2.20' }), '192.0.2.20');
  assert.equal(getAccessorySerialNumber({ mac: '  ', ip: '192.0.2.20' }), '192.0.2.20');
  assert.equal(getAccessorySerialNumber({ mac: 'AA:BB:CC:DD:EE:FF', ip: '192.0.2.20' }), 'AA:BB:CC:DD:EE:FF');
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

test('SSDP power state is confirmed OFF only after three consecutive renderer misses', () => {
  assert.equal(shouldConfirmOffAfterSsdpMisses(1), false);
  assert.equal(shouldConfirmOffAfterSsdpMisses(2), false);
  assert.equal(shouldConfirmOffAfterSsdpMisses(3), true);
  assert.equal(shouldConfirmOffAfterSsdpMisses(4), true);
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
  assert.equal(profiled.keyMap.green, '2b');
  assert.equal(profiled.playPauseCompanionKey, 'green');
  assert.equal(profiled.playPauseCompanionDelayMs, 300);
  assert.equal(profiled.keyMap.display, '5a');
  assert.equal(profiled.keyMap.rewind, '9a');
  assert.equal(profiled.keyMap.fastForward, '98');
  assert.equal(profiled.recorderPowerOnLinkedTv, true);
  assert.equal(profiled.recorderPowerOffWithLinkedTv, true);
  assert.equal(profiled.recorderLinkedTvOffDelaySeconds, 5);
  assert.equal(profiled.recorderPowerOffDelaySeconds, 10);
});

test('55J10X profile repairs stale recorder key overrides with verified TV keys', () => {
  const profiled = applyModelProfile({
    model: '55J10X',
    keyMap: { guide: 'b5', return: '4b', enter: '44', up: 'c0' },
  });
  assert.equal(profiled.keyMap.guide, '40BF6E');
  assert.equal(profiled.keyMap.return, '40BF3B');
  assert.equal(profiled.keyMap.enter, '40BF3D');
  assert.equal(profiled.keyMap.up, '40BF3E');
  assert.equal(profiled.keyMap.blue, '40BF73');
  assert.equal(profiled.keyMap.green, '40BF75');
  assert.equal(profiled.playPauseCompanionKey, 'blue');
  assert.equal(profiled.playPauseCompanionDelayMs, 300);
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
    { name: 'HDMI Next Active', key: '40BF3A', identifier: 6 },
  ]);
  assert.equal(migrated[0].name, 'HDMI');
  assert.equal(migrated[1].name, 'HDMI');
  assert.equal(migrated[2].name, 'HDMI');
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

test('Play/Pause companion key defaults by device type and supports overrides', () => {
  assert.equal(getPlayPauseCompanionKey('tv'), 'blue');
  assert.equal(getPlayPauseCompanionKey(undefined), 'blue');
  assert.equal(getPlayPauseCompanionKey('recorder'), 'green');
  assert.equal(getPlayPauseCompanionKey('recorder', 'customColor'), 'customColor');
});

test('Play/Pause command plans preserve playback and append the model color key', () => {
  assert.deepEqual(getPlayPauseCommandPlan(false, 'tv'), ['pause', 'blue']);
  assert.deepEqual(getPlayPauseCommandPlan(true, 'tv'), ['play', 'blue']);
  assert.deepEqual(getPlayPauseCommandPlan(false, 'recorder'), ['pause', 'green']);
  assert.deepEqual(getPlayPauseCommandPlan(true, 'recorder'), ['play', 'green']);
  assert.deepEqual(getPlayPauseCommandPlan(false, 'recorder', 'yellow'), ['pause', 'yellow']);
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
