const assert = require('node:assert/strict');
const test = require('node:test');
const {
  MEDIA_RENDERER_DEVICE_TYPE,
  isMediaRendererResponse,
  parseSsdpResponse,
} = require('../dist/ssdpPowerProbe');

test('target TV MediaRenderer response is recognized', () => {
  const message = Buffer.from([
    'HTTP/1.1 200 OK',
    `ST: ${MEDIA_RENDERER_DEVICE_TYPE}`,
    'LOCATION: http://192.0.2.10:20001/description.xml',
    '',
    '',
  ].join('\r\n'));
  const response = parseSsdpResponse(message, '192.0.2.10');
  assert.equal(isMediaRendererResponse(response, '192.0.2.10'), true);
});

test('MediaServer and another device are not accepted as TV power evidence', () => {
  assert.equal(isMediaRendererResponse({
    address: '192.0.2.10',
    searchTarget: 'urn:schemas-upnp-org:device:MediaServer:1',
  }, '192.0.2.10'), false);
  assert.equal(isMediaRendererResponse({
    address: '192.0.2.11',
    searchTarget: MEDIA_RENDERER_DEVICE_TYPE,
  }, '192.0.2.10'), false);
});
