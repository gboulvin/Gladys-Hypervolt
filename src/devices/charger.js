// -----------------------------------------------------------------------------
// Device type: HYPERVOLT CHARGER (EV charging station).
//
// One Gladys device per charger of the Hypervolt account. The external ids are
// built from the Hypervolt charger id (the serial the cloud gives us): they
// are forever, so feature keys below are NEVER renamed.
//
// This module is pure: it maps a charger + its live state (see
// src/hypervolt/state.js) to the Gladys discovery payload and states, and a
// Gladys command to a charger command. The live connection lives in
// src/hypervolt/sync-client.js, the orchestration in src/manager.js.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as CAT,
  DEVICE_FEATURE_TYPES as TYPE,
  DEVICE_FEATURE_UNITS as UNIT,
} from '@gladysassistant/integration-sdk';
import {
  CHARGE_MODES,
  MAX_CURRENT_A,
  MIN_CURRENT_A,
  chargePowerW,
  isLocked,
} from '../hypervolt/state.js';

export const DEVICE_TYPE = 'charger';

// Feature keys: part of the external ids, never renamed.
export const FEATURE = {
  CHARGING: 'charging',
  PLUGGED: 'plugged',
  POWER: 'power',
  CURRENT: 'current',
  VOLTAGE: 'voltage',
  SESSION_ENERGY: 'session-energy',
  MAX_CURRENT: 'max-current',
  LOCK: 'lock',
  CHARGE_MODE: 'charge-mode',
  LED_BRIGHTNESS: 'led-brightness',
  HOUSE_POWER: 'house-power',
  GRID_POWER: 'grid-power',
  GENERATION_POWER: 'generation-power',
};

// Labels of the charge modes, as the Hypervolt app names them.
export const CHARGE_MODE_LABELS = {
  boost: 'Boost',
  eco: 'Eco',
  super_eco: 'Super Eco',
};

// Upper bound of the power readings: a three-phase Home 3 Pro charges at 22 kW.
const MAX_POWER_W = 22_000;

export function chargerIds(gladys, chargerId) {
  return gladys.externalIds(DEVICE_TYPE, String(chargerId));
}

/** Display name: the one set in the Hypervolt app, else the model, else the id. */
export function chargerName(charger, state = {}) {
  if (state.name) return state.name;
  if (typeof charger.name === 'string' && charger.name.trim()) return charger.name.trim();
  if (typeof charger.model === 'string' && charger.model.trim()) {
    return `Hypervolt ${charger.model.trim()}`;
  }
  return `Hypervolt ${charger.id}`;
}

const feature = (fields) => ({ has_feedback: false, keep_history: true, ...fields });

/**
 * Discovery payload of one charger.
 * @param {object} gladys SDK instance
 * @param {{ id: string, name?: string, model?: string }} charger from the Hypervolt API
 * @param {object} [state] live state, for the name the user gave the charger
 */
export function buildChargerDevice(gladys, charger, state = {}) {
  const ids = chargerIds(gladys, charger.id);
  const params = [{ name: 'charger_id', value: String(charger.id) }];
  if (charger.model) params.push({ name: 'model', value: String(charger.model) });
  return {
    name: chargerName(charger, state),
    external_id: ids.device,
    params,
    features: [
      feature({
        name: 'Charging',
        external_id: ids.feature(FEATURE.CHARGING),
        category: CAT.ELECTRICAL_VEHICLE_CHARGE,
        type: TYPE.ELECTRICAL_VEHICLE_CHARGE.CHARGE_ON,
        min: 0,
        max: 1,
        read_only: false,
        has_feedback: true,
      }),
      feature({
        name: 'Vehicle plugged in',
        external_id: ids.feature(FEATURE.PLUGGED),
        category: CAT.ELECTRICAL_VEHICLE_CHARGE,
        type: TYPE.ELECTRICAL_VEHICLE_CHARGE.PLUGGED,
        min: 0,
        max: 1,
        read_only: true,
      }),
      feature({
        name: 'Charging power',
        external_id: ids.feature(FEATURE.POWER),
        category: CAT.ELECTRICAL_VEHICLE_CHARGE,
        type: TYPE.ELECTRICAL_VEHICLE_CHARGE.CHARGE_POWER,
        unit: UNIT.WATT,
        min: 0,
        max: MAX_POWER_W,
        read_only: true,
      }),
      feature({
        name: 'Charging current',
        external_id: ids.feature(FEATURE.CURRENT),
        category: CAT.ELECTRICAL_VEHICLE_CHARGE,
        type: TYPE.ELECTRICAL_VEHICLE_CHARGE.CHARGE_CURRENT,
        unit: UNIT.AMPERE,
        min: 0,
        max: MAX_CURRENT_A,
        read_only: true,
      }),
      feature({
        name: 'Voltage',
        external_id: ids.feature(FEATURE.VOLTAGE),
        category: CAT.ELECTRICAL_VEHICLE_CHARGE,
        type: TYPE.ELECTRICAL_VEHICLE_CHARGE.CHARGE_VOLTAGE,
        unit: UNIT.VOLT,
        min: 0,
        max: 500,
        read_only: true,
      }),
      feature({
        name: 'Session energy',
        external_id: ids.feature(FEATURE.SESSION_ENERGY),
        category: CAT.ELECTRICAL_VEHICLE_CHARGE,
        type: TYPE.ELECTRICAL_VEHICLE_CHARGE.LAST_CHARGE_ENERGY_ADDED,
        unit: UNIT.KILOWATT_HOUR,
        min: 0,
        max: 200,
        read_only: true,
      }),
      feature({
        name: 'Max current',
        external_id: ids.feature(FEATURE.MAX_CURRENT),
        category: CAT.ELECTRICAL_VEHICLE_CHARGE,
        type: TYPE.ELECTRICAL_VEHICLE_CHARGE.TARGET_CURRENT,
        unit: UNIT.AMPERE,
        min: MIN_CURRENT_A,
        max: MAX_CURRENT_A,
        step: 1,
        read_only: false,
        has_feedback: true,
      }),
      feature({
        name: 'Lock',
        external_id: ids.feature(FEATURE.LOCK),
        category: CAT.LOCK,
        type: TYPE.LOCK.BINARY,
        min: 0,
        max: 1,
        read_only: false,
        has_feedback: true,
      }),
      feature({
        name: 'Charge mode',
        external_id: ids.feature(FEATURE.CHARGE_MODE),
        category: CAT.TEXT,
        type: TYPE.TEXT.SELECT,
        min: 0,
        max: 0,
        read_only: false,
        has_feedback: true,
        keep_history: false,
        supported_options: CHARGE_MODES.map((value, index) => ({
          value,
          label: CHARGE_MODE_LABELS[value],
          sort_order: index,
        })),
      }),
      feature({
        name: 'LED brightness',
        external_id: ids.feature(FEATURE.LED_BRIGHTNESS),
        category: CAT.LIGHT,
        type: TYPE.LIGHT.BRIGHTNESS,
        unit: UNIT.PERCENT,
        min: 0,
        max: 100,
        read_only: false,
        has_feedback: true,
        keep_history: false,
      }),
      feature({
        name: 'House power',
        external_id: ids.feature(FEATURE.HOUSE_POWER),
        category: CAT.ENERGY_SENSOR,
        type: TYPE.ENERGY_SENSOR.POWER,
        unit: UNIT.WATT,
        min: 0,
        max: 100_000,
        read_only: true,
      }),
      feature({
        name: 'Grid power',
        external_id: ids.feature(FEATURE.GRID_POWER),
        category: CAT.ENERGY_SENSOR,
        type: TYPE.ENERGY_SENSOR.POWER,
        unit: UNIT.WATT,
        // Negative when the house exports to the grid.
        min: -100_000,
        max: 100_000,
        read_only: true,
      }),
      feature({
        name: 'Solar generation',
        external_id: ids.feature(FEATURE.GENERATION_POWER),
        category: CAT.ENERGY_SENSOR,
        type: TYPE.ENERGY_SENSOR.POWER,
        unit: UNIT.WATT,
        min: 0,
        max: 100_000,
        read_only: true,
      }),
    ],
  };
}

const round = (value, digits = 0) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};
const bool = (value) => (value === null || value === undefined ? null : value ? 1 : 0);
const num = (value, transform = (v) => v) =>
  typeof value === 'number' && Number.isFinite(value) ? transform(value) : null;

/**
 * Gladys states of a charger, from its live state. Unknown values (not
 * reported yet, or not supported by this charger) are left out.
 * @returns {Array<{ device_feature_external_id: string, state?: number, text?: string }>}
 */
export function buildChargerStates(gladys, chargerId, state) {
  const ids = chargerIds(gladys, chargerId);
  const values = {
    [FEATURE.CHARGING]: bool(state.charging),
    [FEATURE.PLUGGED]: bool(state.car_plugged),
    [FEATURE.POWER]: chargePowerW(state),
    [FEATURE.CURRENT]: num(state.current_ma, (v) => round(v / 1000, 1)),
    [FEATURE.VOLTAGE]: num(state.voltage, (v) => round(v)),
    [FEATURE.SESSION_ENERGY]: num(state.session_wh, (v) => round(v / 1000, 2)),
    [FEATURE.MAX_CURRENT]: num(state.max_current_ma, (v) => round(v / 1000)),
    [FEATURE.LOCK]: bool(isLocked(state)),
    [FEATURE.LED_BRIGHTNESS]: num(state.brightness, (v) => round(v * 100)),
    [FEATURE.HOUSE_POWER]: num(state.house_power, (v) => round(v)),
    [FEATURE.GRID_POWER]: num(state.grid_power, (v) => round(v)),
    [FEATURE.GENERATION_POWER]: num(state.generation_power, (v) => round(v)),
  };
  const states = Object.entries(values)
    .filter(([, value]) => value !== null)
    .map(([key, value]) => ({ device_feature_external_id: ids.feature(key), state: value }));
  // Battery-safe Super Eco is a Super Eco variant: show it as Super Eco.
  const mode = state.charge_mode?.startsWith('super_eco') ? 'super_eco' : state.charge_mode;
  if (CHARGE_MODES.includes(mode)) {
    states.push({ device_feature_external_id: ids.feature(FEATURE.CHARGE_MODE), text: mode });
  }
  return states;
}

/** Feature key of a feature external id (`ext:<sel>:charger:<id>:<key>`). */
export function featureKeyOf(gladys, chargerId, featureExternalId) {
  const ids = chargerIds(gladys, chargerId);
  return Object.values(FEATURE).find((key) => ids.feature(key) === featureExternalId) ?? null;
}

/**
 * Run a Gladys command on a charger.
 * @param {import('../hypervolt/sync-client.js').ChargerSyncClient} client
 * @param {string} featureKey one of FEATURE
 * @param {number|string} value the value Gladys sent
 */
export async function applyChargerCommand(client, featureKey, value) {
  switch (featureKey) {
    case FEATURE.CHARGING:
      return client.setCharging(Number(value) === 1);
    case FEATURE.LOCK:
      return client.setLocked(Number(value) === 1);
    case FEATURE.MAX_CURRENT:
      return client.setMaxCurrent(Number(value));
    case FEATURE.LED_BRIGHTNESS:
      return client.setBrightness(Number(value) / 100);
    case FEATURE.CHARGE_MODE:
      return client.setChargeMode(String(value));
    default:
      throw new Error(`Feature "${featureKey}" is read-only`);
  }
}
