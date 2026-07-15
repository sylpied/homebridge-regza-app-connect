import dgram from 'node:dgram';

export const MEDIA_RENDERER_DEVICE_TYPE = 'urn:schemas-upnp-org:device:MediaRenderer:1';

interface SsdpResponse {
  address: string;
  searchTarget: string;
}

export function parseSsdpResponse(message: Buffer, address: string): SsdpResponse {
  const headers: Record<string, string> = {};
  for (const line of message.toString('utf8').split(/\r?\n/).slice(1)) {
    const separator = line.indexOf(':');
    if (separator >= 0) {
      headers[line.slice(0, separator).trim().toLowerCase()] = line.slice(separator + 1).trim();
    }
  }
  return { address, searchTarget: headers.st ?? '' };
}

export function isMediaRendererResponse(response: SsdpResponse, expectedIp: string): boolean {
  return response.address === expectedIp
    && response.searchTarget.toLowerCase() === MEDIA_RENDERER_DEVICE_TYPE.toLowerCase();
}

/**
 * Sends one targeted SSDP query. On 55J10X the MediaRenderer service exists
 * while the panel is active, including HDMI playback, but disappears in
 * standby. MediaServer is deliberately not used because it may remain active
 * in standby.
 */
export function probeMediaRenderer(expectedIp: string, timeoutMs = 1800): Promise<boolean> {
  const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  const request = Buffer.from([
    'M-SEARCH * HTTP/1.1',
    'HOST: 239.255.255.250:1900',
    'MAN: "ssdp:discover"',
    'MX: 1',
    `ST: ${MEDIA_RENDERER_DEVICE_TYPE}`,
    '',
    '',
  ].join('\r\n'));

  return new Promise((resolve, reject) => {
    let settled = false;

    const finish = (active: boolean, error?: Error): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      socket.close();
      if (error) {
        reject(error);
      } else {
        resolve(active);
      }
    };

    const timer = setTimeout(() => finish(false), timeoutMs);
    timer.unref();

    socket.on('message', (message, remote) => {
      if (isMediaRendererResponse(parseSsdpResponse(message, remote.address), expectedIp)) {
        finish(true);
      }
    });
    socket.once('error', error => finish(false, error));
    socket.bind(0, '0.0.0.0', () => {
      socket.send(request, 1900, '239.255.255.250', error => {
        if (error) {
          finish(false, error);
        }
      });
    });
  });
}
