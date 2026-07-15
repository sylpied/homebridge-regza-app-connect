import net from 'node:net';

const host = process.argv[2];
const timeoutMs = Number(process.argv[3] ?? 5000);

if (!host) {
  console.error('usage: node scripts/probe-dbr-status.mjs <DBR-IP> [timeout-ms]');
  process.exit(2);
}

const startedAt = Date.now();
const socket = net.createConnection({ host, port: 1048 });

socket.setTimeout(timeoutMs);
socket.once('connect', () => {
  console.log(JSON.stringify({ event: 'connected', host, port: 1048, elapsedMs: Date.now() - startedAt }));
});
socket.once('data', (data) => {
  console.log(JSON.stringify({
    event: 'data',
    bytes: data.length,
    elapsedMs: Date.now() - startedAt,
    hex: data.toString('hex'),
  }));
  socket.destroy();
});
socket.once('timeout', () => {
  console.log(JSON.stringify({ event: 'timeout', elapsedMs: Date.now() - startedAt }));
  socket.destroy();
});
socket.once('error', (error) => {
  console.log(JSON.stringify({ event: 'error', code: error.code, message: error.message, elapsedMs: Date.now() - startedAt }));
});
socket.once('close', () => {
  console.log(JSON.stringify({ event: 'closed', elapsedMs: Date.now() - startedAt }));
});
