// -----------------------------------------------------------------------------
// Hypervolt manager: the account, its chargers and their live connections.
//
//   start(config) -> log in, list the chargers, publish one Gladys device per
//                    charger, open one sync WebSocket per charger;
//   live updates  -> publish the changed states, the transport badge, the
//                    scene events, and nudge the dashboard widget;
//   commands      -> routed to the right charger (onSetValue, scene actions,
//                    widget buttons).
//
// The API client and the sync client factories are injectable for the tests.
// -----------------------------------------------------------------------------

import { createLogger, DEVICE_TRANSPORTS } from '@gladysassistant/integration-sdk';
import { HypervoltApi, InvalidAuthError } from './hypervolt/api.js';
import { ChargerSyncClient } from './hypervolt/sync-client.js';
import { hasCredentials } from './config.js';
import { MESSAGES } from './i18n.js';
import {
  applyChargerCommand,
  buildChargerDevice,
  buildChargerStates,
  chargerIds,
  featureKeyOf,
} from './devices/charger.js';
import { detectSceneEvents } from './triggers.js';

const logger = createLogger({ name: 'manager' });

// An unchanged reading is re-sent this often, so it stays recently dated.
const STATES_HEARTBEAT_MS = 30 * 60 * 1000;
// Retry delay when the cloud cannot be reached at startup.
export const RETRY_DELAY_MS = 60 * 1000;

export class HypervoltManager {
  /**
   * @param {object} gladys SDK instance
   * @param {object} [factories]
   * @param {(config: object) => HypervoltApi} [factories.createApi]
   * @param {(options: object) => ChargerSyncClient} [factories.createSyncClient]
   * @param {() => void} [factories.onWidgetChange] called when a widget content changed
   */
  constructor(gladys, factories = {}) {
    this.gladys = gladys;
    this.createApi =
      factories.createApi ??
      ((config) => new HypervoltApi({ email: config.email, password: config.password }));
    this.createSyncClient =
      factories.createSyncClient ?? ((options) => new ChargerSyncClient(options));
    this.onWidgetChange = factories.onWidgetChange ?? (() => {});
    this.api = null;
    // chargerId -> { charger, client }
    this.chargers = new Map();
    this.retryTimer = null;
    this.generation = 0;
  }

  /**
   * (Re)start with a configuration. Resolves the outcome, also reported
   * through setConnectionStatus: `{ ok: true, count }` or `{ ok: false, message }`.
   */
  async start(config) {
    this.stop();
    const generation = ++this.generation;

    if (!hasCredentials(config)) {
      await this.gladys.setConnectionStatus(false, MESSAGES.missingCredentials);
      return { ok: false, message: MESSAGES.missingCredentials };
    }

    this.api = this.createApi(config);
    let chargers;
    try {
      chargers = await this.api.getChargers();
    } catch (err) {
      if (generation !== this.generation) return { ok: false, message: MESSAGES.cannotConnect };
      if (err instanceof InvalidAuthError) {
        logger.error(`Hypervolt login failed: ${err.message}`);
        await this.gladys.setConnectionStatus(false, MESSAGES.invalidCredentials);
        return { ok: false, message: MESSAGES.invalidCredentials };
      }
      logger.warn(`Hypervolt cloud unreachable (${err.message}), retrying in a minute`);
      await this.gladys.setConnectionStatus(false, MESSAGES.cannotConnect);
      this.retryTimer = setTimeout(() => {
        this.start(config).catch((e) => logger.error('Retry failed', e));
      }, RETRY_DELAY_MS);
      return { ok: false, message: MESSAGES.cannotConnect };
    }
    if (generation !== this.generation) return { ok: false, message: MESSAGES.cannotConnect };

    logger.info(`${chargers.length} charger(s) on the Hypervolt account`);
    for (const charger of chargers) {
      const client = this.createSyncClient({
        chargerId: charger.id,
        getAccessToken: () => this.api.getAccessToken(),
      });
      this.chargers.set(charger.id, { charger, client });
      this.#watch(charger, client);
    }

    await this.publishDevices();
    await this.publishTransports();
    for (const { client } of this.chargers.values()) client.start();

    if (chargers.length === 0) {
      await this.gladys.setConnectionStatus(false, MESSAGES.noCharger);
      return { ok: false, message: MESSAGES.noCharger };
    }
    await this.gladys.setConnectionStatus(true);
    return { ok: true, count: chargers.length };
  }

  stop() {
    this.generation += 1;
    clearTimeout(this.retryTimer);
    this.retryTimer = null;
    for (const { client } of this.chargers.values()) {
      client.removeAllListeners();
      client.stop();
    }
    this.chargers.clear();
  }

  /** Discovery payload of every charger. */
  buildDevices() {
    return [...this.chargers.values()].map(({ charger, client }) =>
      buildChargerDevice(this.gladys, charger, client.state),
    );
  }

  async publishDevices() {
    await this.gladys.publishDiscoveredDevices(this.buildDevices());
  }

  /** Transport badge: every charger is reached through the cloud. */
  async publishTransports() {
    const entries = [...this.chargers.values()].map(({ charger, client }) => ({
      external_id: chargerIds(this.gladys, charger.id).device,
      transport: client.connected ? DEVICE_TRANSPORTS.CLOUD : DEVICE_TRANSPORTS.UNREACHABLE,
    }));
    if (entries.length > 0) await this.gladys.publishTransports(entries);
  }

  /** The entry `{ charger, client }` of a charger device external_id, or undefined. */
  findByDevice(deviceExternalId) {
    for (const entry of this.chargers.values()) {
      if (chargerIds(this.gladys, entry.charger.id).device === deviceExternalId) return entry;
    }
    return undefined;
  }

  /** The first charger, for the widget without a chosen charger. */
  firstCharger() {
    return this.chargers.values().next().value;
  }

  /** onSetValue: run a Gladys command on the charger that owns the feature. */
  async setValue(device, feature, value) {
    const entry = this.findByDevice(device.external_id);
    if (!entry) throw new Error(`Unknown charger ${device.external_id}`);
    const key = featureKeyOf(this.gladys, entry.charger.id, feature.external_id);
    if (!key) throw new Error(`Unknown feature ${feature.external_id}`);
    logger.info(`Command ${key} = ${value} -> charger ${entry.charger.id}`);
    // The confirmed state comes back from the charger (has_feedback).
    await applyChargerCommand(entry.client, key, value);
  }

  #watch(charger, client) {
    const deviceId = chargerIds(this.gladys, charger.id).device;

    client.on('state', (next, previous) => {
      this.#onState(charger, deviceId, next, previous).catch((err) =>
        logger.error(`State publication failed for ${charger.id}`, err),
      );
    });
    client.on('connection', () => {
      this.publishTransports().catch((err) => logger.error('Transport publication failed', err));
      this.onWidgetChange();
    });
    client.on('auth-error', () => {
      // The next connection attempt fetches a brand new token.
      if (this.api) {
        this.api.accessToken = null;
        this.api.expiresAt = 0;
      }
    });
  }

  async #onState(charger, deviceId, next, previous) {
    await this.gladys.publishChangedStates(buildChargerStates(this.gladys, charger.id, next), {
      heartbeat: STATES_HEARTBEAT_MS,
    });

    for (const event of detectSceneEvents(deviceId, previous, next)) {
      logger.info(`Scene event ${event.key} <- charger ${charger.id}`);
      await this.gladys.publishSceneEvent(event.key, event.data);
    }

    // The name set in the Hypervolt app becomes the discovered device name.
    if (next.name !== previous.name) await this.publishDevices();

    // The widget's computed rows (vehicle, charging, mode, lock) moved.
    const watched = ['car_plugged', 'charging', 'charge_mode', 'lock_state'];
    if (watched.some((key) => next[key] !== previous[key])) this.onWidgetChange();
  }
}
