# REGZA App Connect protocol discovery

## DBR-M590 legacy remote

DBR-M590 does not expose the TV v2 API, but provides this Digest-authenticated remote endpoint over HTTP port 80:

```text
GET /remote/remote.htm?key=<recorder short code>
```

### DBR-M590 power-state investigation

Physical-device ON/OFF comparisons produced identical responses through all of the following paths:

- The 655-byte TCP port 1048 status payload
- UDP port 137 AV-device discovery (`0x10` / `TOSHIBACORPORATIONNETAVEQUIPMENT`)
- All nine SSDP-advertised MediaServer services
- Nine zero-input, read-only UPnP SOAP actions

The SOAP captures were both 10,767 bytes and had identical SHA-256 hashes. `GetSystemUpdateID` remained `40487`, `GetCurrentConnectionIDs` remained `0`, and Time Shift settings, recording destinations, and FriendlyName were also unchanged. The recorder's DLNA/network server therefore appears to stay active independently of its front-panel power state.

DBR-M590 read-back power state is consequently managed optimistically. No read-only API that reliably detects power changes made through the physical remote has been verified. Start Menu key `46`, however, was verified to wake the recorder from standby. For ON, the plugin sends `46` to the DBR and immediately sends discrete ON to the selected linked TV, without waiting for TV startup. For OFF, wake-then-toggle normalization is used only while the linked TV is confirmed OFF: `46`, a configurable delay (10 seconds by default), then `12`. While the linked TV is ON, only `12` is sent so current viewing is not interrupted by a Start Menu or HDMI transition. A confirmed linked-TV ON-to-OFF transition also schedules `46` → 10 seconds → `12` after an initial configurable delay (5 seconds by default). An already-OFF state at startup does not trigger it. If the TV turns ON during either wait, the final `12` is cancelled. Per-recorder serialization invalidates an older unfinished sequence when a newer power request arrives.

Recorder channel-up `1e` and channel-down `1f` work while ON but do not wake the DBR from standby. Inspection of the official application's per-device key table found empty recorder columns for TV discrete ON `40BF7E` and OFF `40BF7F`; short candidates `7e` and `7f` were also inert on the tested DBR-M590.

The implementation in RZ Program Guide 1.6.3 was also inspected. It reads DBR display information over TCP port 1048, but its power button does not derive an ON/OFF state from that payload and instead sends the toggle key. Device discovery distinguishes TV (`0x30`), CL (`0x20`), and AV (`0x10`) profiles. DBR-M590 responded to the AV query, but physical-device OFF/ON captures were identical apart from the transaction ID. Discovery therefore remains available in standby and is not power-state evidence.

The discovery profiles can be tested with the following script. Its final argument accepts `tv`, `cl`, `av`, or `all`.

```bash
node scripts/probe-toshiba-device.mjs 192.168.100.255 6000 av
```

Success returns HTTP 200 with a blank HTML page. Unlike the TV API it does not return body `0`, so success validation is selected by model profile.

English | [日本語](PROTOCOL.ja.md)

Some REGZA models expose a self-describing v2 API. Querying the support endpoint is the recommended first step when investigating a new model.

See also the [REGZA remote-key reference](REMOTE_KEYS.md). It contains unverified entries, so test each key carefully on the target model.

Linked-TV OFF convergence runs whether HomeKit currently displays the DBR as ON or OFF, because that display is optimistic rather than a read-back state.

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
