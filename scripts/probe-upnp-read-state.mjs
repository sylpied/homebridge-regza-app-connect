import crypto from 'node:crypto';

const descriptionUrl = process.argv[2];
if (!descriptionUrl?.startsWith('http://') && !descriptionUrl?.startsWith('https://')) {
  console.error('usage: node scripts/probe-upnp-read-state.mjs <description-url>');
  process.exit(2);
}

function element(xml, name) {
  return xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i'))?.[1]?.trim() ?? '';
}

function blocks(xml, name) {
  return [...xml.matchAll(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 'gi'))].map(match => match[1]);
}

function normalizeXml(xml) {
  return xml.replace(/>\s+</g, '><').replace(/\s+/g, ' ').trim();
}

const descriptionResponse = await fetch(descriptionUrl);
if (!descriptionResponse.ok) {
  throw new Error(`description request failed: HTTP ${descriptionResponse.status}`);
}
const description = await descriptionResponse.text();
const services = blocks(description, 'service').map(service => ({
  serviceType: element(service, 'serviceType'),
  scpdUrl: new URL(element(service, 'SCPDURL'), descriptionUrl).href,
  controlUrl: new URL(element(service, 'controlURL'), descriptionUrl).href,
}));

for (const service of services) {
  const scpdResponse = await fetch(service.scpdUrl);
  if (!scpdResponse.ok) continue;
  const scpd = await scpdResponse.text();
  for (const actionBlock of blocks(scpd, 'action')) {
    const action = element(actionBlock, 'name');
    const inputArguments = blocks(actionBlock, 'argument')
      .filter(argument => element(argument, 'direction').toLowerCase() === 'in');
    const readOnlyName = /^(?:Get|X_(?:Toshiba_)?Get)/i.test(action);
    if (!readOnlyName || inputArguments.length > 0) continue;

    const envelope = `<?xml version="1.0" encoding="utf-8"?>` +
      `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" ` +
      `s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">` +
      `<s:Body><u:${action} xmlns:u="${service.serviceType}"></u:${action}></s:Body></s:Envelope>`;
    try {
      const response = await fetch(service.controlUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml; charset="utf-8"',
          'SOAPACTION': `"${service.serviceType}#${action}"`,
        },
        body: envelope,
      });
      const body = normalizeXml(await response.text());
      console.log(JSON.stringify({
        serviceType: service.serviceType,
        action,
        httpStatus: response.status,
        bodyBytes: Buffer.byteLength(body),
        bodySha256: crypto.createHash('sha256').update(body).digest('hex'),
        body: body.length <= 4000 ? body : `${body.slice(0, 4000)}…`,
      }));
    } catch (error) {
      console.log(JSON.stringify({
        serviceType: service.serviceType,
        action,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }
}
