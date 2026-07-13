# Changelog

## 0.7.3

### Fixed

- Reflected HDMI playback as ON in HomeKit when the REGZA v2 API reports an active external input.
- Processed playback and mute polling independently so a mute-status failure no longer discards a successful power/input update.
- Resolved terrestrial, BS, CS, and HDMI state updates using configured input identifiers instead of fixed identifiers.
- Made contextual terrestrial/BS/CS cycling follow the configured inputs and identifiers.
- Avoided a mute-based power probe when broadcast or HDMI playback already proves that the TV is ON.

### Tests

- Added regression coverage for broadcast channel classification, custom input identifiers, and definite broadcast/HDMI ON states.

## 0.7.2

### Fixed

- Prevented the operation-wake preflight from sending a toggle key on legacy toggle-only models, which could turn an active TV off.
- Added best-effort mute restoration when a mute-based power probe fails after sending its first Mute command.
- Serialized mute probes and normal HomeKit Mute changes to prevent overlapping toggle sequences.
- Applied operation-wake preflight consistently to Next/Previous channel actions.
- Updated HomeKit input state only after the REGZA input command succeeds.
- Preserved cached HomeKit accessories across TV display-name changes by matching stable MAC/IP identity while retaining legacy UUID compatibility.
- Removed stale HomeKit input services after inputs are deleted from plugin configuration.
- Updated the REGZA HTTP User-Agent version.
- Kept the Input Sources section open while adding or deleting entries in the custom settings UI.
- Assigned new input identifiers from the highest existing identifier to avoid duplicates after deletions.

### Tests

- Added regression tests for discrete/toggle operation wake, stable device identity, successful mute probing, standby detection, and mute restoration after failure.

## 0.7.1

### Fixed

- Suppressed repeated REGZA v2 status-poll errors after the first consecutive failure, even when debug logging is enabled.
- Added one debug recovery message showing how many polling attempts failed before communication resumed.

## 0.7.0

### Added

- Added an operation wake preflight for terrestrial, BS, CS, volume, Mute, and contextual channel operations.
- After 30 seconds without a user operation, the discrete Power ON key is sent before the requested operation; the threshold is configurable.
- Added a one-shot stale-state probe after eight hours without a user operation, configurable in hours, so power OFF performed with another remote is eventually reflected in HomeKit.
- Persisted the last user-operation time across Homebridge restarts.
- Added configurable command spacing for preparatory Power ON and mute-probe commands.
- Added Japanese and English remote-key reference documents with verified and explicitly unverified codes.

### Changed

- Operation-linked mode no longer probes at startup or on a short periodic timer.
- Long-idle probing is postponed while the HomeKit remote is navigating a TV menu.

## 0.6.1

### Changed

- Added operation-linked power-state detection and made it the 55J10X default.
- Operation-linked mode performs one mute probe at startup and does not run periodic mute probes.
- HomeKit power operations, confirmed broadcast input changes, and successful Mute changes now refresh the optimistic power state.
- Added selectable Operation-linked, Periodic, and Optimistic probe modes to the custom settings UI.
- Suppressed recurring status-poll diagnostics unless plugin debug logging is enabled.

## 0.6.0

### Added

- Added a custom Homebridge settings UI modeled after Alexa Smart Home Plus 0.9.0.
- Added Japanese and English UI languages with automatic language selection.
- Grouped each TV into Basic, Connection, Power, Remote, Input, and Advanced sections.
- Added conditional fields so power keys, Wake on LAN, and mute-probe options appear only when relevant.

## 0.5.1

### Changed

- Reduced the default mute-based power probe interval from 300 seconds to 60 seconds so ambiguous HDMI/standby power states are corrected sooner.
- Clarified the tradeoff between power-detection speed and brief mute/on-screen-display side effects.
- Skip mute probes while the cached power state is fresh, while navigating menus, or when broadcast playback already confirms that the TV is on.
- Refresh stale power state when HomeKit requests the Active characteristic.

## 0.5.0

### Added
- Added contextual HomeKit arrow behavior for normal viewing and guide/menu navigation.
- During normal viewing, Up/Down send Channel Up/Down. Right cycles terrestrial → BS → CS; Left cycles in reverse. HDMI returns to terrestrial on the first cycle.
- After Select opens the guide/menu, all arrows return to normal directional navigation.
- After a selection is made, 15 seconds without Select/arrow input sends Back automatically and exits navigation mode.
- Additional Select or arrow input restarts the 15-second auto-close timer.

### Configuration
- Added `contextualRemoteArrows`, enabled by default for the 55J10X profile.
- Changed `navigationPostSelectResetSeconds` to a guide auto-close delay, defaulting to 15 seconds.

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
