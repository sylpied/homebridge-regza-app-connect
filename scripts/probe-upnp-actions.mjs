import dgram from 'node:dgram';

const target = process.argv[2];
const timeoutArgument = process.argv[3] ?? '5000';
const timeoutMs = Number(timeoutArgument);
const directDescriptionUrl = target?.startsWith('http://') || target?.startsWith('https://')
  ? target
  : undefined;
const host = directDescriptionUrl ? new URL(directDescriptionUrl).hostname : target;

if (!host || !Number.isFinite(timeoutMs) || timeoutMs < 1) {
  console.error('usage: node scripts/probe-upnp-actions.mjs <device-ip-or-description-url> [timeout-ms]');
  process.exit(2);
}

function parseHeaders(message) {
  const headers = {};
  for (const line of message.toString('utf8').split(/\r?\n/).slice(1)) {
    const separator = line.indexOf(':');
    if (separator >= 0) {
      headers[line.slice(0, separator).trim().toLowerCase()] = line.slice(separator + 1).trim();
    }
  }
  return headers;
}

function discoverMediaServerLocation() {
  const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  const request = Buffer.from([
    'M-SEARCH * HTTP/1.1',
    'HOST: 239.255.255.250:1900',
    'MAN: "ssdp:discover"',
    'MX: 2',
    'ST: ssdp:all',
    '',
    '',
  ].join('\r\n'));

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (location, error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.close();
      if (error) reject(error);
      else resolve(location);
    };
    const timer = setTimeout(() => finish(undefined, new Error(`no MediaServer response from ${host}`)), timeoutMs);
    socket.on('message', (message, remote) => {
      const headers = parseHeaders(message);
      if (remote.address === host
        && headers.location
        && (headers.st?.toLowerCase() === 'urn:schemas-upnp-org:device:mediaserver:1'
          || headers.location.includes('/dms/'))) {
        finish(headers.location);
      }
    });
    socket.once('error', error => finish(undefined, error));
    socket.bind(0, '0.0.0', () => {
      socket.send(request, 1900, '239.255.255.250', error => {
        if (error) finish(undefined, error);
      });
    });
  });
}

function element(xml, name) {
  return xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i'))?.[1]?.trim() ?? '';
}

function blocks(xml, name) {
  return [...xml.matchAll(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 'gi'))].map(match => match[1]);
}

const descriptionUrl = directDescriptionUrl ?? await discoverMediaServerLocation();
console.log(`description: ${descriptionUrl}`);
const descriptionResponse = await fetch(descriptionUrl);
if (!descriptionResponse.ok) {
  throw new Error(`description request failed: HTTP ${descriptionResponse.status}`);
}
const description = await descriptionResponse.text();
const services = blocks(description, 'service').map(service => ({
  serviceType: element(service, 'serviceType'),
  serviceId: element(service, 'serviceId'),
  scpdUrl: element(service, 'SCPDURL'),
  controlUrl: element(service, 'controlURL'),
}));

for (const service of services) {
  const scpdUrl = new URL(service.scpdUrl, descriptionUrl).href;
  const response = await fetch(scpdUrl);
  const xml = response.ok ? await response.text() : '';
  const actions = blocks(xml, 'action').map(action => element(action, 'name')).filter(Boolean);
  const stateVariables = blocks(xml, 'stateVariable').map(variable => element(variable, 'name')).filter(Boolean);
  const statusCandidates = [...new Set([...actions, ...stateVariables])]
    .filter(name => /power|status|mode|system|state|standby|operation/i.test(name));
  console.log(JSON.stringify({
    ...service,
    scpdUrl,
    scpdHttpStatus: response.status,
    actions,
    statusCandidates,
  }));
}
