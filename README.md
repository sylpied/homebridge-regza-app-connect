# homebridge-regza-app-connect v0.8.1

Homebridge dynamic platform plugin for Toshiba/TVS REGZA TVs using REGZA App Connect / TV Web Interface.

## Highlights

- HomeKit Television accessory
- HTTPS TV Web Interface on port 4430
- Digest authentication
- Self-signed REGZA certificate support
- Separate Power ON/OFF keys
- Toggle power key fallback for legacy models
- Model profile support
- Toshiba DBR-M590 network remote support
- Low-load REGZA v2 power and input status polling
- Stateful HomeKit remote navigation mode
- Verified on REGZA 55J10X

The verified 55J10X and DBR-M590 profiles are published as separate HomeKit Television accessories so Apple Home Remote can identify and select both. Add each accessory once in the Home app after installing or migrating to v0.8.0.

## Installation and Home app pairing

Verified TV and recorder profiles are published as **standalone HomeKit Television accessories**, rather than child services inside the Homebridge bridge. Pairing therefore differs slightly from a typical Homebridge plugin.

1. Install `homebridge-regza-app-connect` from the Plugins page in Homebridge UI.
2. Open the plugin settings and add each TV or recorder.
3. Select the device type and model. Verified profiles automatically supply the name, transport, port, and remote-key mapping.
4. Enter the IP address, username, and password. Enter a MAC address only when a TV requires WOL. DBR-M590 identity is IP-based, so its MAC address may be left blank.
5. Save the settings and restart Homebridge.
6. In the Apple Home app, select **+ → Add Accessory → More options**.
7. Select each advertised `REGZA 55J10X` or `DBR-M590` accessory separately and enter the normal Homebridge setup code. Scanning a QR code is not required.
8. Repeat steps 6–7 for every configured device.

### Do not pair the REGZA App Connect bridge

Apple Home may show a `Homebridge Regza App Connect` bridge alongside the individual TV/recorder accessories. With the verified v0.8.0 profiles, **do not pair that bridge; pair only the individually advertised TV and recorder accessories**. The bridge does not need to be paired first.

Homebridge UI's **Child Bridge** option is an optional process-isolation feature. Whether it is enabled or disabled, the Home app pairing targets remain the separately advertised TV and recorder accessories. Homebridge or its Child Bridge must remain running in the background, but the bridge itself does not need to be registered in the Home app.

If an accessory does not appear, place the iPhone/iPad and Homebridge on the same LAN and check the Homebridge log for successful publication. If the device was paired before, check for an old pairing in both the Home app and Homebridge cache. DBR-M590 uses its IP address for HomeKit identity so adding or clearing its optional MAC address does not create another accessory.

## Toshiba DBR-M590

The DBR-M590 uses HTTP port 80 with Digest authentication. Selecting the `DBR-M590` profile applies recorder-specific short key codes.

Apple Home Remote does not expose multiple Television services inside one HomeKit bridge as separate choices. The DBR-M590 is therefore published as a standalone HomeKit accessory by default. After updating and restarting Homebridge, add the DBR-M590 once from **Add Accessory** in the Home app using the Homebridge setup code. Both the REGZA TV and recorder can then appear in the remote device picker.

- Power, Start Menu, arrows, Select, Back, and playback controls
- Terrestrial, BS, and CS switching
- First Select opens Start Menu; subsequent Select and arrows navigate normally
- Play/Pause alternates the recorder's dedicated Play and Pause commands
- Toggle power key `12`
- HTTP 2xx success validation for the recorder's blank HTML response
- No TV v2 status polling because those endpoints are unavailable on DBR-M590
- When a REGZA TV is configured too, DBR volume/mute controls are forwarded to the first REGZA TV
- Standalone (`external`) HomeKit publication is recommended

Power state is optimistic. Power changes made through the physical remote or another control path may not be reflected in HomeKit. ON/OFF captures from TCP 1048, SSDP, and read-only UPnP SOAP were completely identical because the network/DLNA server remains active in standby. See the [protocol notes](docs/PROTOCOL.md) for the measured results.

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
      "ip": "192.0.2.10",
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

The HomeKit power state is updated immediately after REGZA returns HTTP `200 OK` with body `0`. On 55J10X the plugin also sends a targeted SSDP query for `urn:schemas-upnp-org:device:MediaRenderer:1`. Physical-device testing shows that MediaRenderer responds while terrestrial, BS, CS, or HDMI is active and disappears in standby. OFF is confirmed only after three consecutive misses to tolerate transient UDP loss.

MediaServer is deliberately ignored because it can remain available in standby. SSDP does not alter video or audio, so the verified 55J10X profile no longer needs a mute probe. Unverified custom models can retain the reversible mute probe as a fallback.

Verified 55J10X playback states:

| TV state/input | `content_type` | HomeKit state |
|---|---|---|
| Standby after broadcast | `other` | OFF after three MediaRenderer misses |
| Terrestrial / BS / CS | `broadcast` | ON |
| HDMI | `external` | ON when MediaRenderer responds |
| Standby after HDMI | May retain `external` | OFF after three MediaRenderer misses |

Normal polling runs every 120 seconds by default. On 55J10X it first sends one targeted MediaRenderer SSDP query and reads `GET /v2/remote/play/status` only after an ON response. This avoids repeated port 4430 connections and timeouts while the TV is off. Legacy intervals below 120 seconds are raised to 120 seconds at runtime.

A MediaRenderer response identifies the TV as ON, including HDMI. Playback status then updates HomeKit input selection: `broadcast` identifies terrestrial/BS/CS and `external` identifies HDMI.

In the default `operation` mode, terrestrial, BS, CS, volume, and Mute operations are prefixed with the discrete Power ON key when 30 seconds have passed since the previous user operation. The discrete key cannot turn an already-active TV off, so an operation can wake a TV that was switched off with another remote while HDMI was selected. Configure the threshold with `operationPowerOnThresholdSeconds`.

After eight hours without a user operation, the plugin also rechecks power over SSDP. This causes no mute overlay or audio interruption. Configure the duration with `stalePowerProbeHours`. Only custom models without SSDP detection use the older mute-probe settings.

See the [REGZA remote-key reference](docs/REMOTE_KEYS.md) for verified and community-provided unverified codes.

## Investigating another REGZA model

Compatible TVs may publish their supported v2 commands at:

```text
https://TV_IP:4430/v2/remote/support
```

The bundled diagnostic script lists SSDP responses:

```bash
node scripts/probe-ssdp.mjs 5000
```

For a DBR or another UPnP MediaServer, provide only its IP address to enumerate device/service definitions, actions, and power-state candidates:

```bash
node scripts/probe-upnp-actions.mjs 192.168.1.151 5000
```

If discovery does not respond, pass the description URL observed in the SSDP log directly (the port can vary):

```bash
node scripts/probe-upnp-actions.mjs http://192.168.1.151:55247/dms/
```

The following command invokes only zero-input, read-only SOAP actions and prints their response bodies and comparison SHA-256 values:

```bash
node scripts/probe-upnp-read-state.mjs http://192.168.1.151:55247/dms/
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

On REGZA TVs, after a selection is made, 15 seconds without another arrow or Select sends Back automatically, closes the guide/menu and exits navigation mode. Additional navigation restarts the timer. The next Select can therefore open the guide again without requiring a manual Back press. Recorders only reset the plugin's internal navigation state after the timeout; they do not receive an automatic Back command that could interrupt playback.

Back, Exit, Power OFF, or the longer inactivity timeout also resets navigation mode. The plugin cannot directly observe a menu being closed with the physical remote, so these timers act as fallbacks.

## Install locally

```bash
sudo npm install -g /path/to/homebridge-regza-app-connect-0.8.1.tgz
```

Then restart Homebridge.
