// -----------------------------------------------------------------------------
// Live connection to ONE charger: the Hypervolt "sync" WebSocket.
//
// Protocol (JSON-RPC 2.0 over wss://api.hypervolt.co.uk/ws/charger/<id>/sync):
//   1. send `login { token, version: 3 }`, wait for `{ authenticated: true }`;
//   2. ask for the snapshot, the plug-and-charge mode (V3 protocol), the
//      firmware version and the charger name;
//   3. the charger then pushes `sync.apply`, `get.session` (every few seconds
//      while a session runs) and `get.pilot_status` notifications.
// Commands are `sync.apply { ... }`, `plugncharge.set { mode }`...
//
// The connection reconnects by itself with an exponential back-off, and is
// recycled when it stays silent too long (the cloud sometimes keeps a dead
// socket open). The WebSocket factory is injectable for the tests.
// -----------------------------------------------------------------------------

import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import { createLogger } from '@gladysassistant/integration-sdk';
import { SYNC_WS_URL, USER_AGENT, WS_ORIGIN } from './api.js';
import {
  CHARGE_MODES,
  MAX_CURRENT_A,
  MIN_CURRENT_A,
  apiVersion,
  applyMessage,
  createInitialState,
} from './state.js';

const logger = createLogger({ name: 'hypervolt-sync' });

const MAX_PENDING_REQUESTS = 50;
const INITIAL_BACKOFF_MS = 5_000;
const MAX_BACKOFF_MS = 5 * 60_000;
// No message at all for this long: the socket is considered dead.
export const STALE_AFTER_MS = 10 * 60_000;

/** Default factory: a `ws` client with the headers the Hypervolt cloud expects. */
export function defaultWebSocketFactory(url) {
  return new WebSocket(url, { headers: { Origin: WS_ORIGIN, 'User-Agent': USER_AGENT } });
}

export class ChargerSyncClient extends EventEmitter {
  /**
   * @param {object} options
   * @param {string} options.chargerId Hypervolt charger id
   * @param {() => Promise<string>} options.getAccessToken resolves a valid access token
   * @param {(url: string) => WebSocket} [options.createWebSocket] socket factory
   */
  constructor({ chargerId, getAccessToken, createWebSocket = defaultWebSocketFactory }) {
    super();
    this.chargerId = String(chargerId);
    this.getAccessToken = getAccessToken;
    this.createWebSocket = createWebSocket;
    this.state = createInitialState();
    this.connected = false;
    this.socket = null;
    this.stopped = true;
    this.pending = new Map();
    this.nextId = 1;
    this.backoffMs = INITIAL_BACKOFF_MS;
    this.reconnectTimer = null;
    this.staleTimer = null;
  }

  /** Protocol variant spoken with this charger (2 or 3). */
  get apiVersion() {
    return apiVersion(this.chargerId, this.state.firmware_version);
  }

  start() {
    if (!this.stopped) return;
    this.stopped = false;
    this.#connect();
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.reconnectTimer);
    clearTimeout(this.staleTimer);
    this.reconnectTimer = null;
    this.staleTimer = null;
    const socket = this.socket;
    this.socket = null;
    if (socket) {
      socket.removeAllListeners();
      // A socket still connecting cannot be closed cleanly: swallow its error.
      socket.on('error', () => {});
      try {
        socket.close();
      } catch {
        // Already closed.
      }
    }
    this.#setConnected(false);
  }

  // --- Commands -------------------------------------------------------------

  /** Start (true) or stop (false) the charge: Hypervolt calls stopping "release". */
  setCharging(charging) {
    return this.request('sync.apply', { release: !charging });
  }

  /** Lock (true) or unlock (false) the charger. */
  setLocked(locked) {
    return this.request('sync.apply', { is_locked: Boolean(locked) });
  }

  /** Max charging current, in amperes. */
  setMaxCurrent(amps) {
    const value = Math.round(Number(amps));
    if (!Number.isFinite(value) || value < MIN_CURRENT_A || value > MAX_CURRENT_A) {
      throw new RangeError(`Max current must be between ${MIN_CURRENT_A} and ${MAX_CURRENT_A} A`);
    }
    return this.request('sync.apply', { max_current: value * 1000 });
  }

  /** LED ring brightness, from 0 to 1. */
  setBrightness(ratio) {
    const value = Math.min(1, Math.max(0, Number(ratio)));
    if (!Number.isFinite(value)) throw new RangeError('Brightness must be a number');
    return this.request('sync.apply', { brightness: value });
  }

  /** Charge mode: boost, eco or super_eco. */
  setChargeMode(mode) {
    if (!CHARGE_MODES.includes(mode)) {
      throw new RangeError(`Unknown charge mode "${mode}"`);
    }
    if (this.apiVersion >= 3) {
      return this.request('plugncharge.set', { mode });
    }
    return this.request('sync.apply', { solar_mode: mode });
  }

  /**
   * Send a JSON-RPC request. Answers arrive asynchronously as state updates:
   * the promise only says the request left, the state says what the charger did.
   */
  request(method, params) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      const err = new Error('The charger is not connected to the Hypervolt cloud');
      err.code = 'CHARGER_OFFLINE';
      return Promise.reject(err);
    }
    const id = String(this.nextId++);
    this.pending.set(id, method);
    while (this.pending.size > MAX_PENDING_REQUESTS) {
      this.pending.delete(this.pending.keys().next().value);
    }
    const message = { jsonrpc: '2.0', id, method };
    if (params !== undefined) message.params = params;
    logger.debug(`-> ${this.chargerId} ${method}`);
    this.socket.send(JSON.stringify(message));
    return Promise.resolve(id);
  }

  // --- Internals ------------------------------------------------------------

  async #connect() {
    if (this.stopped) return;
    let token;
    try {
      token = await this.getAccessToken();
    } catch (err) {
      logger.warn(`Charger ${this.chargerId}: cannot get an access token (${err.message})`);
      this.emit('auth-error', err);
      this.#scheduleReconnect();
      return;
    }
    if (this.stopped) return;

    const socket = this.createWebSocket(SYNC_WS_URL(this.chargerId));
    this.socket = socket;
    this.pending.clear();

    socket.on('open', () => {
      if (socket !== this.socket) return;
      logger.info(`Charger ${this.chargerId}: sync socket open, logging in`);
      this.#armStaleTimer();
      // The token must never reach the logs: request() only logs the method.
      this.request('login', { token, version: 3 }).catch(() => {});
    });
    socket.on('message', (data) => {
      if (socket !== this.socket) return;
      this.#armStaleTimer();
      this.#onMessage(String(data));
    });
    socket.on('error', (err) => {
      logger.warn(`Charger ${this.chargerId}: socket error (${err.message})`);
    });
    socket.on('close', (code) => {
      if (socket !== this.socket) return;
      logger.info(`Charger ${this.chargerId}: sync socket closed (${code})`);
      this.socket = null;
      clearTimeout(this.staleTimer);
      this.#setConnected(false);
      this.#scheduleReconnect();
    });
  }

  #scheduleReconnect() {
    if (this.stopped) return;
    clearTimeout(this.reconnectTimer);
    const delay = this.backoffMs;
    this.backoffMs = Math.min(MAX_BACKOFF_MS, Math.round(this.backoffMs * 1.7));
    logger.debug(`Charger ${this.chargerId}: reconnecting in ${Math.round(delay / 1000)} s`);
    this.reconnectTimer = setTimeout(() => this.#connect(), delay);
  }

  #armStaleTimer() {
    clearTimeout(this.staleTimer);
    this.staleTimer = setTimeout(() => {
      logger.warn(`Charger ${this.chargerId}: no message for a while, recycling the socket`);
      const socket = this.socket;
      if (socket) {
        try {
          socket.terminate ? socket.terminate() : socket.close();
        } catch {
          // The close handler reconnects anyway.
        }
      }
    }, STALE_AFTER_MS);
  }

  #setConnected(connected) {
    if (this.connected === connected) return;
    this.connected = connected;
    this.emit('connection', connected);
  }

  #onMessage(raw) {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      logger.debug(`Charger ${this.chargerId}: ignoring a non-JSON frame`);
      return;
    }
    if (!msg || typeof msg !== 'object') return;

    if (msg.error) {
      // e.g. 409 "Concurrent modifications invalidated this request".
      const method = this.pending.get(String(msg.id)) ?? 'unknown';
      this.pending.delete(String(msg.id));
      logger.warn(
        `Charger ${this.chargerId}: ${method} refused (${msg.error.code ?? '?'} ${msg.error.error ?? msg.error.message ?? ''})`,
      );
      this.emit('request-error', { method, error: msg.error });
      return;
    }

    let method;
    let payload;
    if ('params' in msg && msg.method) {
      method = msg.method;
      payload = msg.params;
    } else if ('result' in msg) {
      method = this.pending.get(String(msg.id));
      this.pending.delete(String(msg.id));
      payload = msg.result;
    }
    if (!method) return;

    if (method === 'login') {
      this.#onLogin(payload);
      return;
    }

    const previous = this.state;
    const next = applyMessage(previous, method, payload);
    if (next === previous) {
      logger.debug(`Charger ${this.chargerId}: ignored ${method}`);
      return;
    }
    const wasV2 = apiVersion(this.chargerId, previous.firmware_version) < 3;
    this.state = next;
    this.emit('state', next, previous);

    // A Home 2.0 on a recent firmware speaks the V3 protocol: once we know,
    // ask for what only V3 answers.
    if (method === 'firmware.version' && wasV2 && this.apiVersion >= 3) {
      this.#requestV3Extras();
    }
  }

  #onLogin(result) {
    if (!result?.authenticated) {
      logger.warn(`Charger ${this.chargerId}: sync login refused`);
      this.emit('auth-error', new Error('Sync login refused'));
      // Force a new token on the next attempt.
      try {
        this.socket?.close();
      } catch {
        // The close handler reconnects anyway.
      }
      return;
    }
    logger.info(`Charger ${this.chargerId}: connected`);
    this.backoffMs = INITIAL_BACKOFF_MS;
    this.#setConnected(true);
    const ignore = () => {};
    this.request('sync.snapshot').catch(ignore);
    if (this.apiVersion >= 3) this.#requestV3Extras();
    this.request('firmware.version').catch(ignore);
    this.request('get.name').catch(ignore);
  }

  #requestV3Extras() {
    const ignore = () => {};
    this.request('schedules.get').catch(ignore);
    this.request('plugncharge.get').catch(ignore);
  }
}
