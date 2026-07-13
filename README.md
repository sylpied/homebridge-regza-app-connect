# homebridge-regza-app-connect v0.7.1

Homebridge dynamic platform plugin for Toshiba/TVS REGZA TVs using REGZA App Connect / TV Web Interface.

## Highlights

- HomeKit Television accessory
- HTTPS TV Web Interface on port 4430
- Digest authentication
- Self-signed REGZA certificate support
- Separate Power ON/OFF keys
- Toggle power key fallback for legacy models
- Model profile support
- REGZA v2 power, input and mute status polling
- Stateful HomeKit remote navigation mode
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
| Terrestrial | `40BF7A` |
| BS | `40BF7C` |
| CS | `40BF7D` |
| HDMI Next Active | `40BF3A` |
| Remote endpoint | `/remote/remote.htm?key=<KEY>` |

`remote.htm` returns plain text `0` on success.

## TV-side setup

Complete these steps on the TV before configuring Homebridge. Menu names vary by model; the examples below are from the REGZA J10X series.

1. Connect the TV and the Homebridge server to the same local network.
2. Give the TV a stable IP address. Either reserve its address on your router's DHCP server (recommended), or disable automatic IP acquisition on the TV and enter a valid IP address, subnet mask, gateway and DNS settings manually.
3. Open **Settings → Network/Service Settings → External Linkage Settings → REGZA Apps Connect Settings**.
4. Set **REGZA Apps Connect** to **Use**, then configure a username and password.
5. Enter that same IP address, username and password in this plugin's Homebridge UI settings.

### Authentication, remote power and Wake on LAN

- The verified 55J10X profile uses **HTTPS on port 4430 with HTTP Digest authentication**. The REGZA Apps Connect username and password are used for that Digest authentication.
- **Basic authentication is not required for the verified 55J10X profile.** Some REGZA generations or legacy applications may expose a separate Basic-authentication setting; only enable/configure it when the manual for that model or its working API requires it.
- The 55J10X profile uses the verified discrete network keys (`40BF7E`/`40BF7F`) and therefore does **not** require Wake on LAN. Leave `enableWakeOnLan` disabled for this profile.
- Wake on LAN is optional for models that cannot turn on through their remote API. When enabled, configure the MAC address of the TV's active network adapter and enable the TV's remote-power/network-standby setting. Standby power consumption may increase.
- A MAC address is otherwise optional, but supplying it gives the HomeKit accessory a stable identity if the TV's IP address later changes.

### When the username and password are unknown

REGZA generations use two different credential setup methods.

#### Models with username/password fields on the TV

On models such as 55J10X, enter credentials in REGZA Apps Connect Settings, then enter the same values in this plugin.

#### Models without username/password fields on the TV

Some newer models issue Digest credentials through four-digit PIN client registration. The community tool [9SQ/regza-digest-auth](https://github.com/9SQ/regza-digest-auth) documents this procedure:

1. Fix the TV IP address and enable REGZA Apps Connect.
2. Set the TV IP in `register.py`.
3. Choose a client `user_id` in MAC-address format, for example `AA-AA-AA-AA-AA-AA`.
4. Install the requirements with `pip3 install -r requirements.txt`.
5. Turn the TV ON, close settings screens, and leave it in normal television viewing mode.
6. Run `python3 register.py`.
7. Enter the four-digit PIN displayed on the TV.
8. Enter the returned `user_id` and `user_pw` as this plugin's username and password.

The issued credentials work with Digest authentication for `/remote/` and `/v2/remote/`. Store them securely and never post them in GitHub issues or logs. References: [the original X post by 9SQ](https://x.com/9SQ/status/1357970437683040257), [registration tool and instructions](https://github.com/9SQ/regza-digest-auth), and the [protocol discovery guide](docs/PROTOCOL.md).

See the [official J10X instruction manual](https://cs.regza.com/document/manual/87826_01.pdf) for the model-specific network, REGZA Apps Connect and remote-power menus.

### HDMI input

The terrestrial `40BF7A`, BS `40BF7C`, CS `40BF7D`, and HDMI-next-active `40BF3A` commands have been verified on a physical 55J10X. Selecting “HDMI (Next Active)” in HomeKit advances to the next active HDMI input. Direct HDMI 1-3 codes remain available for model-specific custom configurations, but are not used by the 55J10X defaults.

## Recommended config for 55J10X

The Homebridge custom settings UI groups essential settings first and keeps connection, power, remote, and input options in collapsible sections. Choose the `55J10X` model profile and enter only the IP address and App Connect credentials.

```json
{
  "platform": "RegzaAppConnect",
  "debug": true,
  "devices": [
    {
      "name": "REGZA 55J10X",
      "model": "55J10X",
      "ip": "192.168.100.150",
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

The HomeKit power state is updated immediately after REGZA returns HTTP `200 OK` with body `0`. Broadcast playback reports a reliable ON state. HDMI playback remains cached as `external` after the 55J10X enters standby, so ambiguous states use a verified mute-state probe:

1. Read the current mute state.
2. Send mute (`40BF10`).
3. Read mute again.
4. An unchanged value means standby; a changed value means ON.
5. When changed, send mute again and verify the original state was restored.

Verified 55J10X playback states:

| TV state/input | `content_type` | HomeKit state |
|---|---|---|
| Standby after broadcast | `other` | Confirmed by mute probe |
| Terrestrial / BS / CS | `broadcast` | ON |
| HDMI or standby after HDMI | `external` | Distinguished by mute probe |

Mute is synchronized through `GET /v2/remote/status/mute`. Normal input/mute polling defaults to 30 seconds and remains active in every probe mode. Whenever periodic playback status reports `broadcast` for terrestrial, BS, or CS, the TV is positively identified as ON.

In the default `operation` mode, terrestrial, BS, CS, volume, and Mute operations are prefixed with the discrete Power ON key when 30 seconds have passed since the previous user operation. The discrete key cannot turn an already-active TV off, so an operation can wake a TV that was switched off with another remote while HDMI was selected. Configure the threshold with `operationPowerOnThresholdSeconds`.

After eight hours without a user operation, the plugin runs one reversible mute probe and updates HomeKit. This detects an OFF state set by another remote without causing frequent periodic audio interruptions. Configure the duration with `stalePowerProbeHours` and the minimum command spacing with `operationCommandDelayMs` (250 ms by default). Select `interval` only when more frequent HDMI/standby correction matters more than uninterrupted viewing, or `optimistic` to disable mute probing completely. Built-in application states have not yet been fully verified.

See the [REGZA remote-key reference](docs/REMOTE_KEYS.md) for verified and community-provided unverified codes.

## Investigating another REGZA model

Compatible TVs may publish their supported v2 commands at:

```text
https://TV_IP:4430/v2/remote/support
```

See the [REGZA App Connect protocol discovery guide](docs/PROTOCOL.md) ([日本語](docs/PROTOCOL.ja.md)) for safe commands, response format, verified status endpoints and instructions for reporting another model. Remove credentials, access codes and device identifiers before sharing results.

## HomeKit remote navigation mode

The HomeKit TV remote does not provide a dedicated REGZA menu button. v0.4.0 can use the first Select press to open a menu, then use later Select presses as the normal Enter key.

```json
{
  "selectKeyMode": "guideFirst",
  "navigationTimeoutSeconds": 60,
  "navigationPostSelectResetSeconds": 15,
  "contextualRemoteArrows": true
}
```

- `guideFirst`: first Select opens the program guide (`40BF6E`)
- `menuFirst`: first Select opens settings (`40BFD0`)
- `quickFirst`: first Select opens the quick menu (`40BF27`)
- `normal`: every Select sends Enter (`40BF3D`)

Outside navigation mode, Up/Down change channel. Right cycles terrestrial → BS → CS → terrestrial, while Left cycles in reverse. From HDMI, the first cycle returns to terrestrial. Absolute terrestrial/BS/CS/HDMI selection remains available in HomeKit's separate input-selection screen. The first Select opens the configured guide/menu; arrows then become normal directional keys and Select becomes Enter.

After a selection is made, 15 seconds without another arrow or Select sends Back automatically, closes the guide/menu and exits navigation mode. Additional navigation restarts the timer. The next Select can therefore open the guide again without requiring a manual Back press.

Back, Exit, Power OFF, or the longer inactivity timeout also resets navigation mode. The plugin cannot directly observe a menu being closed with the physical remote, so these timers act as fallbacks.

## Install locally

```bash
sudo npm install -g /path/to/homebridge-regza-app-connect-0.7.1.tgz
```

Then restart Homebridge.
