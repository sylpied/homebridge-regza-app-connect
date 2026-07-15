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

test('digest request sequences are serialized', async () => {
  const client = createClient();
  let activeRequests = 0;
  let maximumActiveRequests = 0;
  client.request = async () => {
    activeRequests += 1;
    maximumActiveRequests = Math.max(maximumActiveRequests, activeRequests);
    await new Promise(resolve => setTimeout(resolve, 5));
    activeRequests -= 1;
    return {
      statusCode: 200,
      statusMessage: 'OK',
      headers: {},
      body: '{"status":0,"content_type":"broadcast","epg_info_current":null}',
    };
  };

  await Promise.all([client.getPlaybackStatus(), client.getPlaybackStatus()]);
  assert.equal(maximumActiveRequests, 1);
});

test('request queue continues after an earlier request fails', async () => {
  const client = createClient();
  let requestCalls = 0;
  client.request = async () => {
    requestCalls += 1;
    if (requestCalls === 1) throw new Error('simulated network failure');
    return {
      statusCode: 200,
      statusMessage: 'OK',
      headers: {},
      body: '{"status":0,"content_type":"broadcast","epg_info_current":null}',
    };
  };

  const first = client.getPlaybackStatus();
  const second = client.getPlaybackStatus();
  await assert.rejects(first, /simulated network failure/);
  assert.equal((await second).status, 0);
});

test('legacy recorder mode accepts an HTTP 2xx response with an HTML body', async () => {
  const client = new RegzaClient({
    log: { debug() {}, info() {}, warn() {}, error() {} },
    name: 'DBR-M590', ip: '192.0.2.2', username: 'user', password: 'pass',
    protocol: 'http', remoteResponseMode: 'httpStatus', keyMap: { menu: '46' },
  });
  client.requestWithDigest = async () => ({
    statusCode: 200, statusMessage: 'OK', headers: {}, body: '<html><title>blank</title></html>',
  });

  assert.match(await client.sendKey('menu'), /<html>/);
});

test('TV mode still requires the response body to be zero', async () => {
  const client = createClient();
  client.requestWithDigest = async () => ({
    statusCode: 200, statusMessage: 'OK', headers: {}, body: '<html></html>',
  });

  await assert.rejects(client.sendKey('powerOn'), /did not execute/);
});

test('TV transport keys use REGZA rewind and fast-forward codes', async () => {
  const client = createClient();
  const paths = [];
  client.requestWithDigest = async path => {
    paths.push(path);
    return { statusCode: 200, statusMessage: 'OK', headers: {}, body: '0' };
  };

  await client.sendKey('rewind');
  await client.sendKey('fastForward');
  assert.deepEqual(paths, [
    '/remote/remote.htm?key=40BE2C',
    '/remote/remote.htm?key=40BE2E',
  ]);
});
