# Changelog

## 0.1.7

- Add HTTPS TV Web Interface support on port 4430.
- Default power control to verified REGZA hex key `40BF12`.
- Allow REGZA self-signed/private CA certificate by default.
- Read and log `remote.htm` plain-text response body; `0` is treated as success.
- Disable Wake on LAN by default for J10X-style HTTPS power toggle flow.
- Add configurable `protocol`, `allowSelfSignedCertificate`, `powerKey`, `keyMap`, `wakeOnLanPort`, and `wakeOnLanAddress`.
