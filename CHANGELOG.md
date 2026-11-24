# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [1.0.1] - 2026-11-24

### Added

- Hypervolt integration for Gladys Assistant 5.1 or later, through the
  Hypervolt cloud: sign in with the Hypervolt app account, every charger of
  the account is discovered.
- Per charger: start and stop charging, charge mode (Boost, Eco, Super Eco),
  max current (6 to 32 A), lock, LED brightness, vehicle plugged in, live
  charging power, current, voltage and session energy, and the house, grid
  and solar power of chargers fitted with CT clamps.
- Live updates over one WebSocket per charger, with automatic reconnection,
  and a cloud transport badge on the devices.
- Scene triggers: vehicle plugged in, vehicle unplugged, charging started,
  charging stopped (with the energy of the session).
- Scene actions: start charging, stop charging, set the charge mode, set the
  max current, lock or unlock the charger.
- Dashboard widget: live power, session energy and max current, vehicle,
  charge, mode, lock and cloud status, start/stop, Boost and Eco buttons.
- "Test the connection" action in the Configuration screen.
- English, French, German and Spanish translations, and user documentation
  in the four languages.

[Unreleased]: https://github.com/gboulvin/Gladys-Hypervolt/compare/v1.0.1...HEAD
[1.0.1]: https://github.com/gboulvin/Gladys-Hypervolt/releases/tag/v1.0.1
