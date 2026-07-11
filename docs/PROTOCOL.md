# REGZA App Connect protocol discovery

Some REGZA models expose a self-describing v2 API. Querying the support endpoint is the recommended first step when investigating a new model.

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

Important: 55J10X retains `external` after entering standby from HDMI. The plugin distinguishes this ambiguous state with a reversible mute probe: read mute, send `40BF10`, read mute again, and restore the original value when it changed.

## Models without editable credentials

Some newer REGZA models let users enable REGZA Apps Connect but do not provide editable username/password fields. These models may support PIN-based client registration that issues a Digest user ID and password.

The community reference implementation [9SQ/regza-digest-auth](https://github.com/9SQ/regza-digest-auth) documents the flow:

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
