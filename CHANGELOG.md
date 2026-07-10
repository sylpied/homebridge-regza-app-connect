# Changelog

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
