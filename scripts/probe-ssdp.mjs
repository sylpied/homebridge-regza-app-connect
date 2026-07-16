import dgram from 'node:dgram';

const timeoutArgument = process.argv[2] ?? '5000';
const timeoutMs = Number(timeoutArgument);
const searchTarget = process.argv[3] ?? 'ssdp:all';

if (!Number.isFinite(timeoutMs) || timeoutMs < 1) {
  console.error(`invalid timeout: ${timeoutArgument}`);
  console.error('usage: node scripts/probe-ssdp.mjs [timeout-ms] [search-target]');
  process.exit(2);
}

const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
const responses = new Map();
const request = Buffer.from([
  'M-SEARCH * HTTP/1.1',
  'HOST: 239.255.255.250:1900',
  'MAN: "ssdp:discover"',
  'MX: 2',
  `ST: ${searchTarget}`,
  '',
  '',
].join('\r\n'));

function parseHeaders(message) {
  const lines = message.toString('utf8').split(/\r?\n/);
  const headers = {};
  for (const line of lines.slice(1)) {
    const separator = line.indexOf(':');
    if (separator < 0) continue;
    headers[line.slice(0, separator).trim().toLowerCase()] = line.slice(separator + 1).trim();
  }
  return { statusLine: lines[0], headers };
}

socket.on('message', (message, remote) => {
  const { statusLine, headers } = parseHeaders(message);
  const record = {
    from: `${remote.address}:${remote.port}`,
    statusLine,
    server: headers.server ?? '',
    st: headers.st ?? '',
    usn: headers.usn ?? '',
    location: headers.location ?? '',
  };
  const key = `${record.from}|${record.st}|${record.usn}|${record.location}`;
  if (!responses.has(key)) {
    responses.set(key, record);
    console.log(JSON.stringify(record));
  }
});

socket.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});

socket.bind(0, '0.0.0.0', () => {
  socket.send(request, 1900, '239.255.255.250', (error) => {
    if (error) {
      console.error(error.message);
    } else {
      console.log(`sent SSDP discovery for ${searchTarget}; waiting ${timeoutMs}ms`);
    }
  });
});

setTimeout(() => {
  socket.close();
  console.log(`complete: ${responses.size} unique response(s)`);
}, timeoutMs);
