import dgram from 'node:dgram';

const broadcast = process.argv[2] ?? '255.255.255.255';
const timeoutArgument = process.argv[3] ?? '6000';
const timeoutMs = Number(timeoutArgument);
const listenPorts = [1184, 1185];
const sockets = [];
const responses = [];

if (!Number.isFinite(timeoutMs) || timeoutMs < 1) {
  console.error(`invalid timeout: ${timeoutArgument}`);
  console.error('usage: node scripts/probe-toshiba-device.mjs <broadcast-address> [timeout-ms]');
  process.exit(2);
}

function makeQuery() {
  const query = Buffer.alloc(50);
  const name = Buffer.from('TOSHIBACORPORATIONNETTVEQUIPMENT', 'utf8');
  query[0] = 0x30;
  query[1] = Math.floor(Math.random() * 256);
  query[2] = 0x01;
  query[3] = 0x10;
  query[5] = 0x01;
  query[12] = 0x20;
  name.copy(query, 13, 0, 32);
  query[47] = 0x20;
  query[49] = 0x01;
  return query;
}

await Promise.all(listenPorts.map((port) => new Promise((resolve, reject) => {
  const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  sockets.push(socket);
  socket.on('error', reject);
  socket.on('message', (message, remote) => {
    const name = message.subarray(13, 45).toString('utf8').replaceAll('\0', '').trim();
    const record = {
      listenPort: port,
      from: `${remote.address}:${remote.port}`,
      bytes: message.length,
      type: `0x${message[0].toString(16).padStart(2, '0')}`,
      name,
      hex: message.toString('hex'),
    };
    responses.push(record);
    console.log(JSON.stringify(record));
  });
  socket.bind(port, '0.0.0.0', resolve);
})));

const sender = dgram.createSocket('udp4');
sender.bind(0, '0.0.0.0', () => {
  sender.setBroadcast(true);
  const query = makeQuery();
  sender.send(query, 137, broadcast, (error) => {
    if (error) {
      console.error(error.message);
    } else {
      console.log(`sent ${query.length} bytes to ${broadcast}:137; waiting ${timeoutMs}ms`);
    }
    sender.close();
  });
});

setTimeout(() => {
  for (const socket of sockets) socket.close();
  console.log(`complete: ${responses.length} response(s)`);
}, timeoutMs);
