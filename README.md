# homebridge-regza-app-connect v0.2.0

Homebridge dynamic platform plugin for Toshiba/TVS REGZA TVs using REGZA App Connect / TV Web Interface.

## Highlights

- HomeKit Television accessory
- HTTPS TV Web Interface on port 4430
- Digest authentication
- Self-signed REGZA certificate support
- Separate Power ON/OFF keys
- Toggle power key fallback for legacy models
- Model profile support
- Verified on REGZA 55J10X

## Verified behavior on REGZA 55J10X

| Feature | Value |
|---|---|
| Protocol | HTTPS |
| Port | 4430 |
| Auth | Digest |
| Certificate | TV private/self-signed CA |
| Power ON | `40BF7E` |
| Power OFF | `40BF7F` |
| Power Toggle | `40BF12` |
| Remote endpoint | `/remote/remote.htm?key=<KEY>` |

`remote.htm` returns plain text `0` on success.

## Recommended config for 55J10X

With v0.2.0, choose the `55J10X` model profile and enter only the IP address and App Connect credentials.

```json
{
  "platform": "RegzaAppConnect",
  "debug": true,
  "devices": [
    {
      "name": "REGZA 55J10X",
      "model": "55J10X",
      "ip": "192.168.100.150",
      "mac": "5C:93:A2:DB:3C:E1",
      "username": "your-regza-username",
      "password": "your-regza-password"
    }
  ]
}
```

The profile applies:

```json
{
  "protocol": "https",
  "port": 4430,
  "allowSelfSignedCertificate": true,
  "powerMode": "discrete",
  "powerOnKey": "40BF7E",
  "powerOffKey": "40BF7F",
  "powerToggleKey": "40BF12"
}
```

## Power modes

### Discrete mode, recommended

```json
{
  "powerMode": "discrete",
  "powerOnKey": "40BF7E",
  "powerOffKey": "40BF7F"
}
```

HomeKit ON sends `powerOnKey`; HomeKit OFF sends `powerOffKey`.

### Toggle mode, legacy fallback

```json
{
  "powerMode": "toggle",
  "powerToggleKey": "40BF12"
}
```

HomeKit ON and OFF both send the toggle key. Use this only for models where separate ON/OFF keys do not work.

Existing v0.1.x configurations that only define `powerKey` keep their original toggle behavior.

## Power state

The HomeKit power state is updated optimistically after REGZA returns HTTP `200 OK` with body `0`. Responses `1` and `2` are treated as command failures and do not update the HomeKit state.

## Install locally

```bash
sudo npm install -g /path/to/homebridge-regza-app-connect-0.2.0.tgz
```

Then restart Homebridge.
