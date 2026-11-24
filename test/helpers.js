// Test doubles shared by the test files: no network, no socket.
import { EventEmitter } from 'node:events';
import { createInitialState } from '../src/hypervolt/state.js';

export const CHARGER_ID = '1234567890123456789'; // 16 hex digits -> Home 3.0
export const V2_CHARGER_ID = '20015998341138'; // 12 hex digits -> Home 2.0

/** A ChargerSyncClient double: records the commands, state set by the test. */
export class FakeSyncClient extends EventEmitter {
  constructor({ chargerId }) {
    super();
    this.chargerId = chargerId;
    this.state = createInitialState();
    this.connected = false;
    this.started = false;
    this.commands = [];
  }
  start() {
    this.started = true;
  }
  stop() {
    this.started = false;
  }
  /** Simulate a state change pushed by the charger. */
  push(patch) {
    const previous = this.state;
    this.state = { ...previous, ...patch };
    this.emit('state', this.state, previous);
  }
  setConnected(connected) {
    this.connected = connected;
    this.emit('connection', connected);
  }
  #record(name, value) {
    if (!this.connected) {
      const err = new Error('offline');
      err.code = 'CHARGER_OFFLINE';
      return Promise.reject(err);
    }
    this.commands.push([name, value]);
    return Promise.resolve('1');
  }
  setCharging(value) {
    return this.#record('setCharging', value);
  }
  setLocked(value) {
    return this.#record('setLocked', value);
  }
  setMaxCurrent(value) {
    return this.#record('setMaxCurrent', value);
  }
  setBrightness(value) {
    return this.#record('setBrightness', value);
  }
  setChargeMode(value) {
    return this.#record('setChargeMode', value);
  }
}

/** A HypervoltApi double. */
export function fakeApi({ chargers = [{ id: CHARGER_ID, name: 'Garage' }], error } = {}) {
  return {
    accessToken: 'token',
    expiresAt: Infinity,
    async getChargers() {
      if (error) throw error;
      return chargers;
    },
    async getAccessToken() {
      return 'token';
    },
  };
}

/** Wait for the pending promise callbacks. */
export const flush = () => new Promise((resolve) => setImmediate(resolve));
