// -----------------------------------------------------------------------------
// Charger state model.
//
// The sync WebSocket of a charger speaks JSON-RPC 2.0. The charger pushes
// notifications (`{ method, params }`) and answers our requests
// (`{ id, result }`); both carry partial state that is merged here. These are
// pure functions, tested without any socket.
//
// Message shapes seen on the wire:
//   sync.snapshot / sync.apply -> [{ brightness: 0.25 }, { lock_state: "unlocked" },
//                                  { max_current: 32000 }, { solar_mode: "boost" }, ...]
//   get.session                -> { charging, session, watt_hours, true_milli_amps,
//                                   voltage, ev_power, house_power, grid_power, ... }
//   get.pilot_status           -> { pilot_status: "A" | "B" | "C" | ... }
//   plugncharge.get / .set     -> { applied: "boost" } / { mode: "eco", applied: true }
//   schedules.get / schedule.set -> { applied: { enabled, type, sessions } }
//   firmware.version           -> "2483.2"
//   get.name                   -> "My charger"
// -----------------------------------------------------------------------------

export const CHARGE_MODES = ['boost', 'eco', 'super_eco'];
export const LOCK_STATES = ['unlocked', 'pending_lock', 'locked'];

// Max current the user can set, in amperes (Hypervolt app range).
export const MIN_CURRENT_A = 6;
export const MAX_CURRENT_A = 32;

// Firmware strings of V2 chargers updated to the V3 protocol are short ("1.0").
const UPDATED_V2_FIRMWARE_MAX_LEN = 7;

/** A fresh, unknown state. `null` means "not reported yet". */
export function createInitialState() {
  return {
    name: null,
    firmware_version: null,
    charging: null,
    session_id: null,
    session_wh: null,
    carbon_saved_g: null,
    current_ma: null,
    voltage: null,
    ev_power: null,
    house_power: null,
    grid_power: null,
    generation_power: null,
    max_current_ma: null,
    lock_state: null,
    charge_mode: null,
    release_state: null,
    car_plugged: null,
    brightness: null,
    schedule_enabled: null,
    features: null,
  };
}

const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);

function applySyncItems(state, items) {
  // sync.* results are an array of single-key objects, sometimes a plain object.
  const list = Array.isArray(items) ? items : [items];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    if (isNumber(item.brightness)) state.brightness = item.brightness;
    if (typeof item.lock_state === 'string') state.lock_state = item.lock_state.toLowerCase();
    if (typeof item.is_locked === 'boolean')
      state.lock_state = item.is_locked ? 'locked' : 'unlocked';
    if (isNumber(item.max_current)) state.max_current_ma = item.max_current;
    if (typeof item.solar_mode === 'string') state.charge_mode = item.solar_mode.toLowerCase();
    if (Array.isArray(item.features)) state.features = item.features;
    if (typeof item.release_state === 'string') {
      state.release_state = item.release_state.toLowerCase();
    }
  }
}

function applySession(state, result) {
  if (!result || typeof result !== 'object') return;
  if (typeof result.charging === 'boolean') state.charging = result.charging;
  if (result.session !== undefined) state.session_id = result.session;
  if (isNumber(result.watt_hours)) state.session_wh = result.watt_hours;
  if (isNumber(result.carbon_saved_grams)) state.carbon_saved_g = result.carbon_saved_grams;
  if (isNumber(result.true_milli_amps)) state.current_ma = result.true_milli_amps;
  if (isNumber(result.voltage)) state.voltage = result.voltage;
  if (isNumber(result.ev_power)) state.ev_power = result.ev_power;
  if (isNumber(result.house_power)) state.house_power = result.house_power;
  if (isNumber(result.grid_power)) state.grid_power = result.grid_power;
  if (isNumber(result.generation_power)) state.generation_power = result.generation_power;
}

function applyPilotStatus(state, result) {
  // SAE J1772 control pilot: A = no vehicle, B = plugged, C = charging.
  // Other letters (D, E, F: errors / ventilation) leave the value as-is.
  const pilot = result?.pilot_status;
  if (pilot === 'A') state.car_plugged = false;
  if (pilot === 'B' || pilot === 'C') state.car_plugged = true;
}

function applyPlugAndCharge(state, result) {
  if (!result || typeof result !== 'object') return;
  // plugncharge.set answer: only an accepted change counts.
  if (result.applied === false) return;
  // plugncharge.get answers the active mode as `applied`, set answers `mode`.
  const mode = typeof result.applied === 'string' ? result.applied : result.mode;
  if (typeof mode === 'string') state.charge_mode = mode.toLowerCase();
}

function applySchedule(state, result) {
  const applied = result?.applied;
  if (applied && typeof applied.enabled === 'boolean') state.schedule_enabled = applied.enabled;
}

/**
 * Merge one message into a COPY of the state.
 * @param {object} state current state
 * @param {string} method JSON-RPC method (of the notification, or of the request answered)
 * @param {unknown} result `params` of a notification or `result` of an answer
 * @returns {object} the new state
 */
export function applyMessage(state, method, result) {
  const next = { ...state };
  switch (method) {
    case 'sync.snapshot':
    case 'sync.apply':
      applySyncItems(next, result);
      break;
    case 'get.session':
      applySession(next, result);
      break;
    case 'get.pilot_status':
      applyPilotStatus(next, result);
      break;
    case 'plugncharge.get':
    case 'plugncharge.set':
      applyPlugAndCharge(next, result);
      break;
    case 'schedules.get':
    case 'schedule.set':
      applySchedule(next, result);
      break;
    case 'firmware.version':
      if (result !== null && result !== undefined) next.firmware_version = String(result);
      break;
    case 'get.name':
      if (typeof result === 'string' && result.trim()) next.name = result.trim();
      break;
    default:
      return state;
  }
  return next;
}

/** Charging power in watts: reported by V3 chargers, derived otherwise. */
export function chargePowerW(state) {
  if (isNumber(state.ev_power)) return Math.round(state.ev_power);
  if (isNumber(state.voltage) && isNumber(state.current_ma)) {
    return Math.round((state.voltage * state.current_ma) / 1000);
  }
  if (state.charging === false) return 0;
  return null;
}

/** Whether the charger is locked (a pending lock already blocks a new session). */
export function isLocked(state) {
  if (state.lock_state === null) return null;
  return state.lock_state === 'locked' || state.lock_state === 'pending_lock';
}

/**
 * Hardware generation from the charger id: 12 hex digits for a Home 2.0,
 * 16 for a Home 3.0. Unknown lengths are assumed to be the recent one.
 */
export function chargerMajorVersion(chargerId) {
  try {
    const hex = BigInt(chargerId).toString(16);
    const bytes = Math.ceil(hex.length / 2) * 2;
    if (bytes === 12) return 2;
    return 3;
  } catch {
    return 3;
  }
}

/**
 * Which protocol variant to speak: 3 for a Home 3.0, and for a Home 2.0 once
 * it reported a recent (short) firmware string; 2 otherwise.
 */
export function apiVersion(chargerId, firmwareVersion) {
  if (chargerMajorVersion(chargerId) >= 3) return 3;
  if (!firmwareVersion) return 2;
  return String(firmwareVersion).trim().length <= UPDATED_V2_FIRMWARE_MAX_LEN ? 3 : 2;
}
