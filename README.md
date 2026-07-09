# homebridge-regza-app-connect v0.1.7

Homebridge dynamic platform plugin for Toshiba/TVS REGZA TVs.

v0.1.7 defaults to the REGZA HTTPS TV Web Interface discovered on J10X series:

```text
https://<REGZA-IP>:4430/remote/remote.htm?key=40BF12
```

## Verified behavior on REGZA-55J10X

- TCP 4430 is the REGZA `TV Web Interface` HTTPS server.
- It uses Digest authentication.
- It uses a private/self-signed TV certificate, so self-signed certificates are allowed by default.
- `key=40BF12` is the power toggle key.
- The API returns plain text `0` on success.

## Example config

```json
{
  "platform": "RegzaAppConnect",
  "debug": true,
  "devices": [
    {
      "name": "REGZA-55J10X",
      "ip": "192.168.100.150",
      "mac": "5C:93:A2:DB:3C:E1",
      "username": "saki",
      "password": "saki",
      "protocol": "https",
      "port": 4430,
      "allowSelfSignedCertificate": true,
      "powerKey": "40BF12",
      "enableWakeOnLan": false
    }
  ]
}
```

## Install locally

```bash
npm install -g /path/to/homebridge-regza-app-connect-0.1.7
```
