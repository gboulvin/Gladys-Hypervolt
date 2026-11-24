# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for human
contributors.

## What this is

The **Hypervolt** external integration for Gladys Assistant: a Node.js service
(Node 22+, ESM, no build step) that runs in its own sandboxed Docker container,
talks to Gladys through
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js)
and to Hypervolt EV chargers through the **Hypervolt cloud** (no local API
exists). Runtime dependencies: the SDK and `ws` (WebSocket client with custom
headers). It started from the official JavaScript template.

## Commands

```bash
npm install
npm test                                  # node --test, the built-in runner
node --test test/manager.test.js          # one file
node --test --test-name-pattern "widget"  # tests whose name matches
npm run lint                              # ESLint
npm run format:check                      # Prettier, as the CI runs it
npm run format                            # Prettier, fix in place
npx github:GladysAssistant/integration-store .   # store admission checks
```

The CI (`.github/workflows/ci.yml`) runs `format:check`, `lint` and `test` on
Node 22 and 24, and builds the Docker image: run the three commands before
pushing.

## Architecture

```
index.js                     SDK wiring only: handlers registered before connect()
src/manager.js               account -> chargers -> sync clients; publishes devices,
                             states, transports, scene events; routes commands
src/hypervolt/api.js         Keycloak login / refresh, GET /users/me?includes=chargers
src/hypervolt/sync-client.js one JSON-RPC WebSocket per charger (reconnect, watchdog)
src/hypervolt/state.js       PURE: applyMessage(state, method, result), protocol version
src/devices/charger.js       PURE: discovery payload, Gladys states, command mapping
src/triggers.js              PURE: state transitions -> scene events
src/scenes.js                scene action handlers (manifest `scene_actions`)
src/widgets.js               dashboard widget (manifest `widgets`)
src/actions.js               Configuration screen actions (manifest `actions`)
src/config.js                DEFAULT_CONFIG (mirrors the manifest) + normalization
src/i18n.js                  user-facing messages in en, fr, de, es
gladys-assistant-integration.json manifest
docs/{en,fr,de,es}.md        user documentation, re-hosted by Gladys (mandatory)
test/                        node --test, SDK fake Gladys + Hypervolt doubles (test/helpers.js)
.github/scripts/release.mjs  release helpers (manifest bump, changelog), tested in test/
```

## Hypervolt protocol notes

- Auth: `POST https://kc.prod.hypervolt.co.uk/realms/retail-customers/protocol/openid-connect/token`,
  `client_id=home-assistant`, password grant then refresh-token grant.
- Live: `wss://api.hypervolt.co.uk/ws/charger/<id>/sync`, headers `Origin:
https://hypervolt.co.uk`. First message `login { token, version: 3 }`.
  Answers carry only an `id`: the client remembers the method of each request
  id to interpret them.
- Commands: `sync.apply { release }` (stop = `release: true`), `{ is_locked }`,
  `{ max_current }` in **mA**, `{ brightness }` 0–1; charge mode through
  `plugncharge.set { mode }` on the V3 protocol, `sync.apply { solar_mode }` on
  a Home 2.0 with legacy firmware (see `apiVersion()` in state.js).
- The protocol is undocumented: keep the state reducer tolerant (ignore what
  is unknown, never throw on an unexpected shape).

## Rules

- **External ids are forever.** Built with
  `gladys.externalIds('charger', <Hypervolt charger id>)`; feature keys are the
  `FEATURE` values of `src/devices/charger.js`. Never rename one, nor a
  manifest key (`config_schema`, `actions`, `scene_triggers`, `scene_actions`,
  `widgets`, their fields and outputs): Gladys and the users' scenes store
  them.
- **Every feature carries `name`, `min`, `max`, `read_only` and
  `has_feedback`** (`0`/`0` for a text feature). `test/devices.test.js` checks
  them and the SDK fake refuses a payload Gladys would refuse.
- **Secrets.** The password is a manifest `secret` field. Never log the
  password, the access/refresh tokens nor the login request body; tokens stay
  in memory. The container rootfs is read-only: write only under `/data`.
- **Commands confirm through the charger.** Writable features have
  `has_feedback: true`: never publish the requested value, publish what the
  charger reports back.
- **Scene events fire on transitions only** (known value -> opposite value),
  never on the first value after a (re)connection, never as a consequence of a
  scene action.
- **Versions belong to the Release workflow** (Actions → Release). Never edit
  `version` in `package.json` or in the manifest, nor the `docker_image` tag,
  by hand. `test/manifest.test.js` checks they agree.
- **Changelog.** Every user-visible change adds a line under `## [Unreleased]`
  in `CHANGELOG.md` (`### Added`, `Changed`, `Fixed`, `Removed`, `Security`).
  Never write a version heading: the Release workflow moves the section.
- **Four languages.** Every user-facing text — manifest `label`,
  `description`, `placeholder`, the messages of `src/i18n.js`, the widget
  texts and `docs/*.md` — exists in English, French, German and Spanish, kept
  in sync. `test/manifest.test.js` fails on a missing language.
- **Manifest.** The catalog `description` holds 10 to 100 characters per
  language. `transports` stays `["cloud"]` until Hypervolt offers a local API.
  Capability fields require `gladys_version >=5.1.0`.
- **Style.** Prettier formats, ESLint catches mistakes. Comments explain why,
  in English. Tests never touch the network.
