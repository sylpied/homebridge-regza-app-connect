# Changelog

## 0.4.1

### Documentation
- Added a complete Japanese translation of the REGZA App Connect protocol discovery guide.
- Added reciprocal language links between the English and Japanese protocol guides.
- Updated the Japanese README to link directly to the Japanese guide.
- Added credential-setup decision guidance and detailed PIN-registration steps to both READMEs.

## 0.4.0

### Added
- Added a configurable navigation mode for the HomeKit TV remote.
- The first Select press can open the program guide, settings menu or quick menu; later Select presses send the normal Enter key.
- Back, Exit, Power OFF and an inactivity timeout reset navigation mode.
- After a normal Select inside the opened menu, navigation mode resets after a short configurable delay; further navigation postpones the reset.
- Added REGZA keys for program guide (`40BF6E`), settings menu (`40BFD0`), quick menu (`40BF27`) and exit (`40BF3C`).

### Configuration
- Added `selectKeyMode`: `guideFirst`, `menuFirst`, `quickFirst` or `normal`.
- Added `navigationTimeoutSeconds`, defaulting to 60 seconds.
- Added `navigationPostSelectResetSeconds`, defaulting to 5 seconds.

## 0.3.0

### Added
- Added periodic power, input and mute synchronization through the REGZA v2 status API.
- Added `GET /v2/remote/play/status` support. Verified values are `other` in standby, `broadcast` for terrestrial/BS/CS and `external` for HDMI on 55J10X.
- Added `GET /v2/remote/status/mute` support.
- Persisted the last known power, input and mute state in the Homebridge accessory context.
- Added a protocol discovery guide documenting `/v2/remote/support`, `/public/feature`, verified read-only endpoints and a safe workflow for investigating other REGZA models.
- Added a verified mute-state power probe for ambiguous HDMI/standby status. The probe restores the original mute state and runs at a separately configurable interval.
- Documented PIN-based Digest credential registration for REGZA models that do not expose username/password settings on the TV.

### Fixed
- Corrected the Config UI default input keys to match the verified 55J10X keys.

### Limitations
- HDMI playback status remains cached in standby on 55J10X, so HDMI/standby detection uses the mute-state probe instead of `content_type` alone.
- The probe briefly toggles mute and may display the TV's mute indicator. It defaults to a five-minute interval.
- Some built-in apps may return an unverified playback content type.

## 0.2.1

### Fixed
- Corrected mute, volume, channel, navigation, enter, return, display, broadcast and HDMI remote key codes.
- Changed the default HDMI input control to the verified HDMI-next-active key (`40BF3A`). Direct HDMI 1-3 codes remain available for model-specific overrides but are not used by the 55J10X defaults.

### Documentation
- Added required TV-side network and REGZA Apps Connect setup instructions.
- Clarified that the verified 55J10X profile uses HTTPS/Digest authentication and does not require Basic authentication or Wake on LAN.
- Clarified when MAC address, remote-power settings and Wake on LAN are needed.

### Verified
- Verified terrestrial (`40BF7A`), BS (`40BF7C`), CS (`40BF7D`), and HDMI-next-active (`40BF3A`) input commands on a physical REGZA 55J10X.

## 0.2.0

### Added
- Added model profiles, with `55J10X` as the first verified profile.
- Added separate Power ON/OFF key support via `powerMode=discrete`.
- Added `powerOnKey`, `powerOffKey`, and `powerToggleKey` configuration options.
- Added centralized REGZA remote key definitions.
- Added request timeout configuration.

### Changed
- REGZA 55J10X now defaults to HTTPS port 4430, self-signed certificate support, and discrete power keys.
- HomeKit power state is updated optimistically after a successful REGZA response.
- Existing v0.1.x `powerKey` configs remain supported as a legacy toggle key.

### Verified
- Verified HomeKit power ON and OFF on a physical REGZA 55J10X.
- Verified `40BF7E` as discrete power ON, `40BF7F` as discrete power OFF, and `40BF12` as power toggle.
- Verified successful commands return HTTP `200 OK` with plain-text body `0`.

## 0.1.9

### Fixed
- Added HTTPS self-signed certificate support for REGZA TV Web Interface on port 4430.
- Improved Digest authentication and debug logging.
