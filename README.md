# Hypervolt for Gladys Assistant

External integration for [Gladys Assistant](https://gladysassistant.com) that
controls [Hypervolt](https://www.hypervolt.co.uk) EV chargers (Home 2.0,
Home 3.0, Home 3 Pro) through the Hypervolt cloud.

Built from the official
[JavaScript integration template](https://github.com/GladysAssistant/integration-template-js)
with the SDK
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js).

- **Transport:** cloud (manifest `"transports": ["cloud"]`) — Hypervolt
  chargers have no local API.
- **Languages:** English, French, German, Spanish (manifest, messages,
  widget, documentation).
- **Gladys:** 5.1.0 or later (scene triggers, scene actions and widgets).

User documentation: [English](docs/en.md) · [Français](docs/fr.md) ·
[Deutsch](docs/de.md) · [Español](docs/es.md).

## Features

One Gladys device per charger of the account, with:

| Feature                             | Category / type                                          | Read / write |
| ----------------------------------- | -------------------------------------------------------- | ------------ |
| Charging                            | `electrical-vehicle-charge` / `charge-on`                | read/write   |
| Vehicle plugged in                  | `electrical-vehicle-charge` / `plugged`                  | read         |
| Charging power (W)                  | `electrical-vehicle-charge` / `charge-power`             | read         |
| Charging current (A)                | `electrical-vehicle-charge` / `charge-current`           | read         |
| Voltage (V)                         | `electrical-vehicle-charge` / `charge-voltage`           | read         |
| Session energy (kWh)                | `electrical-vehicle-charge` / `last-charge-energy-added` | read         |
| Max current (6–32 A)                | `electrical-vehicle-charge` / `target-current`           | read/write   |
| Lock                                | `lock` / `binary`                                        | read/write   |
| Charge mode (Boost, Eco, Super Eco) | `text` / `select`                                        | read/write   |
| LED brightness (%)                  | `light` / `brightness`                                   | read/write   |
| House, grid, solar power (W)        | `energy-sensor` / `power` (CT clamps)                    | read         |

On top of the devices:

| Capability     | Keys                                                                                |
| -------------- | ----------------------------------------------------------------------------------- |
| Scene triggers | `vehicle_plugged_in`, `vehicle_unplugged`, `charging_started`, `charging_stopped`   |
| Scene actions  | `start_charging`, `stop_charging`, `set_charge_mode`, `set_max_current`, `set_lock` |
| Widget         | `charger_status` (live tiles, status list, start/stop, Boost and Eco buttons)       |
| Action         | `test_connection` (Configuration screen)                                            |

## How it talks to Hypervolt

- **Authentication:** OpenID Connect password grant on the Hypervolt Keycloak
  realm (`kc.prod.hypervolt.co.uk`), then refresh-token grants. The access
  token is kept in memory only, never written to disk nor logged.
- **Charger list:** `GET https://api.hypervolt.co.uk/users/me?includes=chargers`.
- **Live state and commands:** one JSON-RPC WebSocket per charger,
  `wss://api.hypervolt.co.uk/ws/charger/<id>/sync` (`sync.snapshot`,
  `sync.apply`, `get.session`, `get.pilot_status`, `plugncharge.*`…), with
  automatic reconnection and a watchdog on silent sockets.

The protocol is not publicly documented; it follows the reverse-engineering
work of the community
[Home Assistant integration](https://github.com/gndean/home-assistant-hypervolt-charger).

## Project structure

```
index.js                     SDK wiring only (handlers registered before connect())
src/manager.js               the account, its chargers and their live connections
src/hypervolt/api.js         cloud REST client (login, token refresh, charger list)
src/hypervolt/sync-client.js per-charger WebSocket (JSON-RPC, reconnection, commands)
src/hypervolt/state.js       pure state model (messages -> state, protocol version)
src/devices/charger.js       charger <-> Gladys device, states and commands
src/triggers.js              scene triggers (state transitions -> events)
src/scenes.js                scene actions
src/widgets.js               dashboard widget
src/actions.js               Configuration screen actions
src/config.js                config defaults + normalization
src/i18n.js                  user-facing messages (en, fr, de, es)
docs/{en,fr,de,es}.md        user documentation, re-hosted by Gladys
test/                        node --test, against the SDK's fake Gladys
```

## Development

```bash
npm install
npm test               # node --test
npm run lint           # ESLint
npm run format:check   # Prettier
```

Run it against a local Gladys:

```bash
GLADYS_HOST_API_URL="http://localhost:1443" \
GLADYS_INTEGRATION_TOKEN="<token>" \
GLADYS_INTEGRATION_SELECTOR="hypervolt" \
LOG_LEVEL=debug \
npm start
```

The tests never touch the network: the Hypervolt API and WebSockets are
replaced by doubles, and Gladys by the SDK's `createFakeGladys()`.

## Release

Describe the changes under `## [Unreleased]` in [`CHANGELOG.md`](CHANGELOG.md),
then **Actions → Release → Run workflow** (`patch`, `minor` or `major`). The
workflow bumps `package.json` and the manifest, rolls the changelog, tags,
builds the multi-arch image to `ghcr.io/gboulvin/gladys-hypervolt` and
publishes the GitHub Release. The repository needs the GitHub topic
`gladys-assistant-integration` to be indexed by the Gladys store.

## Disclaimer

This project is not affiliated with or endorsed by Hypervolt Ltd. "Hypervolt"
is a trademark of its owner.

## License

Apache-2.0
