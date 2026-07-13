const assert = require('node:assert/strict');
const test = require('node:test');
const { RegzaClient } = require('../dist/regzaClient');

const createClient = () => new RegzaClient({
  log: { debug() {}, info() {}, warn() {}, error() {} },
  name: 'Test REGZA',
  ip: '192.0.2.1',
  username: 'user',
  password: 'pass',
});

test('mute probe restores mute after a status request fails', async () => {
  const client = createClient();
  let statusCalls = 0;
  let muteCalls = 0;
  client.getMuteStatus = async () => {
    statusCalls += 1;
    if (statusCalls === 1) return { status: 0, mute: 'off' };
    throw new Error('simulated timeout');
  };
  client.mute = async () => { muteCalls += 1; };

  await assert.rejects(client.probePowerWithMute(0), /simulated timeout/);
  assert.equal(muteCalls, 2);
});

test('mute probe reports standby and still sends the safety restore command', async () => {
  const client = createClient();
  let muteCalls = 0;
  client.getMuteStatus = async () => ({ status: 0, mute: 'off' });
  client.mute = async () => { muteCalls += 1; };

  assert.equal(await client.probePowerWithMute(0), false);
  assert.equal(muteCalls, 2);
});

test('mute probe restores a changed mute state when TV is active', async () => {
  const client = createClient();
  const statuses = [
    { status: 0, mute: 'off' },
    { status: 0, mute: 'on' },
    { status: 0, mute: 'off' },
  ];
  let muteCalls = 0;
  client.getMuteStatus = async () => statuses.shift();
  client.mute = async () => { muteCalls += 1; };

  assert.equal(await client.probePowerWithMute(0), true);
  assert.equal(muteCalls, 2);
});
