# Changelog

## 0.8.2

- Added non-disruptive 55J10X power detection using targeted SSDP MediaRenderer discovery.
- Confirmed OFF only after three consecutive MediaRenderer misses to tolerate transient UDP loss.
- Avoided repeated HTTPS status connections while the TV is off; playback status is requested only after SSDP confirms ON.
- Kept standby MediaServer advertisements out of power-state decisions.
- Added Toshiba/SSDP/UPnP diagnostic scripts, including DBR service/action enumeration.
- Documented that DBR-M590 TCP 1048, SSDP, and read-only UPnP SOAP results are identical in ON and OFF states, so recorder power remains optimistic.

## 0.8.1

- Added HomeKit `REWIND` and `FAST_FORWARD` remote-key handling.
- Mapped TV rewind/fast-forward to `40BE2C`/`40BE2E`.
- Mapped DBR-M590 rewind/fast-forward to its recorder-specific `9a`/`98` codes.
- Added regression coverage for both model mappings.

## 0.8.0

- Added a verified Toshiba DBR-M590 recorder profile using HTTP port 80 and Digest authentication.
- Added recorder-specific short remote codes for power, navigation, playback and broadcast-band selection.
- Added HTTP-status response validation for legacy recorder commands that return blank HTML.
- Disabled unavailable TV v2 polling and mute probing for the DBR-M590 profile.
- Kept REGZA TV and DBR accessories separate even when a copied MAC address remains in both configurations.
- Forwarded DBR HomeKit volume and mute controls to the first configured REGZA TV.
- Added Start Menu-first Select behavior and alternating Play/Pause behavior for DBR-M590.
- Added an explicit TV/recorder device-type selector to the Homebridge settings UI.
- Kept Play/Pause mapped to the recorder's dedicated Play and Pause commands.
- Marked restored and new accessories as HomeKit Television category for remote selection.
- Published DBR-M590 as a standalone HomeKit accessory by default so it can appear alongside a REGZA TV in Apple Home Remote.
- Added a HomeKit publication mode setting for bridged and standalone accessories.
- Marked each Television service as the primary service so standalone recorders are recognized by Apple Home Remote.
- Reordered the settings form and replaced environment-specific address examples with generic placeholders.
- Migrated early DBR settings, including the incorrectly identified Time Shift mode, to Start Menu-first navigation.
- Reset TV input defaults when selecting the 55J10X profile and explicitly persisted HomeKit accessory/input names.
- Persisted restored Television category and primary-service metadata through Homebridge's accessory cache.
- Repaired early recorder configurations whose device type and model profile became inconsistent.
- Published verified TVs as standalone Television accessories too, avoiding the child bridge/home icon.
- Added debug logging for effective HomeKit remote-key routing and marked broadcast inputs as tuners.
- Mapped TV and recorder Play/Pause to alternating Pause/Play using model-specific codes.
- Added explicit viewing, menu, and date-selection navigation layers; Select now returns from date selection to the guide. TV timeouts can close the on-screen menu, while recorder timeouts only reset internal state to avoid interrupting playback.
- Migrated only generic `Input Source X` names to the verified 55J10X input defaults while preserving custom names.
- Migrated legacy HDMI labels containing unsupported full-width punctuation to the HomeKit-safe `HDMI Next Active` name.
- Kept Accessory Information limited to its standard Name and Model characteristics so Apple Home can validate standalone TVs and recorders.
- Made the verified DBR-M590 remote map override stale TV/default mappings, including navigation, playback, Select and Back.
- Unified Select and Back transitions from date selection to the guide/Time Shift menu layer and added navigation-state debug logging.
- Explicitly set the standard Television Name characteristic for model-name publication.
- Made recorder HomeKit identity IP-based so adding or clearing its optional MAC address no longer creates another accessory.
- Documented the DBR-M590 legacy remote protocol and extracted key map.
- Preserved explicit Custom model selections and user-edited recorder names in the settings UI.
- Prevented recorder navigation timers from automatically sending Back during playback or menu use.
- Documented the standalone TV/recorder pairing flow and clarified that the REGZA App Connect bridge itself is not paired in Apple Home.

## 0.7.5

### Fixed

- Serialized all REGZA HTTP/HTTPS Digest request sequences per TV to avoid concurrent network bursts.
- Coalesced concurrent operation-linked Power ON preparation into one command sequence.
- Marked a stale TV state as OFF only after three consecutive connection failures.
- Suppressed repeated power-probe failures and logged recovery only in debug mode.

### Tests

- Added coverage for request serialization and connectivity-error classification.

## 0.7.4

### Changed

- Reduced normal REGZA v2 polling to playback status only, removing periodic mute-status requests.
- Changed the default and runtime minimum polling interval from 30 seconds to 120 seconds.
- Added progressive retry backoff up to 10 minutes after communication failures.
- Prevented overlapping status polls and kept the poll scheduler running after recoverable failures.
- Migrated legacy custom-UI polling values below 120 seconds to the new low-load minimum.

### Fixed

- Kept HDMI `external` states ambiguous because 55J10X can retain them after standby; only broadcast playback positively confirms ON.
- Updated Japanese and English settings and protocol documentation to match the low-load behavior.

### Tests

- Added regression coverage for polling intervals, failure backoff, and safe broadcast-only positive power detection.

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
