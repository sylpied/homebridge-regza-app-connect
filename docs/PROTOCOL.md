# REGZA App Connect protocol discovery

## DBR-M590 legacy remote

DBR-M590 does not expose the TV v2 API, but provides this Digest-authenticated remote endpoint over HTTP port 80:

```text
GET /remote/remote.htm?key=<recorder short code>
```

### DBR-M590 power-state investigation

Physical-device ON/OFF comparisons produced identical responses through all of the following paths:

- The 655-byte TCP port 1048 status payload
- All nine SSDP-advertised MediaServer services
- Nine zero-input, read-only UPnP SOAP actions

The SOAP captures were both 10,767 bytes and had identical SHA-256 hashes. `GetSystemUpdateID` remained `40487`, `GetCurrentConnectionIDs` remained `0`, and Time Shift settings, recording destinations, and FriendlyName were also unchanged. The recorder's DLNA/network server therefore appears to stay active independently of its front-panel power state.

DBR-M590 power is consequently managed optimistically for now. No read-only API that reliably detects power changes made through the physical remote has been verified.

Success returns HTTP 200 with a blank HTML page. Unlike the TV API it does not return body `0`, so success validation is selected by model profile.

English | [日本語](PROTOCOL.ja.md)

Some REGZA models expose a self-describing v2 API. Querying the support endpoint is the recommended first step when investigating a new model.

See also the [REGZA remote-key reference](REMOTE_KEYS.md). It contains unverified entries, so test each key carefully on the target model.

## Supported-command discovery

Verified on REGZA 55J10X:

```text
GET https://TV_IP:4430/v2/remote/support
```

The endpoint uses the same HTTP Digest username and password configured in REGZA Apps Connect. REGZA may use a private or self-signed TLS certificate, so `curl` needs `-k` for local testing:

```bash
curl -k --digest \
  -u 'REGZA_USERNAME:REGZA_PASSWORD' \
  'https://TV_IP:4430/v2/remote/support'
```

The response contains a `command` array. Each entry describes:

- `http_method`: required HTTP method
- `resource`: API path
- `params`: accepted parameter names

Example:

```json
{
  "http_method": "GET",
  "resource": "/v2/remote/status/mute",
  "params": []
}
```

Do not publish real TV IP addresses, usernames, passwords, access codes, device identifiers or full responses containing private account/device data.

## Device feature discovery

The following endpoint reports model and API feature information:

```bash
curl -k \
  'https://TV_IP:4430/public/feature'
```

The 55J10X response identifies `ipc_version` as `v2` and reports `V1Support` and `PIN_Auth` capabilities.

## Verified read-only status endpoints

```text
GET /v2/remote/play/status
GET /v2/remote/status/mute
GET /v2/remote/status/foreground_dtvapp
GET /v2/remote/settings/channel_list
```

Verified `play/status` values on 55J10X:

| TV state/input | `content_type` |
|---|---|
| Standby | `other` |
| Terrestrial / BS / CS | `broadcast` |
| HDMI | `external` |

Important: 55J10X can retain `external` after entering standby from HDMI, so `external` cannot confirm ON by itself. Physical-device testing found that SSDP `urn:schemas-upnp-org:device:MediaRenderer:1` responds while terrestrial, BS, CS, or HDMI is active and disappears in standby. The plugin sends a targeted query and confirms OFF after three consecutive misses. MediaServer is ignored because it can remain available in standby.

## Models without editable credentials

Some newer REGZA models let users enable REGZA Apps Connect but do not provide editable username/password fields. These models may support PIN-based client registration that issues a Digest user ID and password.

The community reference implementation [9SQ/regza-digest-auth](https://github.com/9SQ/regza-digest-auth) documents the flow (see also [the related X post](https://x.com/9SQ/status/1357970437683040257)):

1. Fix the TV IP address and enable REGZA Apps Connect.
2. Choose a client user ID in MAC-address format.
3. Run the registration client while the TV is ON and displaying television normally.
4. Enter the four-digit PIN displayed by the TV.
5. Store the returned user ID and generated password securely.

The issued credentials can be used with Digest authentication for `/remote/` and `/v2/remote/` APIs. This registration method is not needed on models such as 55J10X where credentials can be configured directly on the TV. Never commit or publish generated credentials.

## Investigating another model

1. Enable REGZA Apps Connect and configure credentials on the TV.
2. Query `/public/feature` and record the model, `ipc_version` and feature names.
3. Query `/v2/remote/support` and save the command list.
4. Test read-only `GET` endpoints first.
5. Before testing `POST` or `DELETE`, check every parameter and assume the request may change TV settings, recordings or reservations.
6. Report the model, firmware/version fields, endpoint, request method and sanitized response in a GitHub issue.
