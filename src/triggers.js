// -----------------------------------------------------------------------------
// Scene triggers (SDK v0.14+, Gladys 5.1+).
//
// The charger state is published as device features (charging 0/1, plugged
// 0/1...): they already drive the standard "device state" trigger of Gladys.
// The triggers below add the EVENTS a scene author thinks in — "the car was
// plugged in", "the charge finished" — with their details (energy of the
// session), fired once per transition.
//
// Keys are forever (scenes store them): never rename one.
// -----------------------------------------------------------------------------

export const TRIGGERS = {
  CHARGING_STARTED: 'charging_started',
  CHARGING_STOPPED: 'charging_stopped',
  VEHICLE_PLUGGED_IN: 'vehicle_plugged_in',
  VEHICLE_UNPLUGGED: 'vehicle_unplugged',
};

export const SCENE_TRIGGER_KEYS = Object.values(TRIGGERS);

const sessionEnergyKwh = (state) =>
  typeof state.session_wh === 'number' ? Math.round(state.session_wh / 10) / 100 : null;

// A transition is a known value turning into the opposite one: the first
// value reported after a (re)connection (null -> x) is not an event.
const turnedOn = (before, after) => before === false && after === true;
const turnedOff = (before, after) => before === true && after === false;

/**
 * Scene events caused by a state change of one charger.
 * @param {string} deviceExternalId the charger device external_id (`device` filter)
 * @param {object} previous state before the message
 * @param {object} next state after the message
 * @returns {Array<{ key: string, data: Record<string, string|number|boolean|null> }>}
 */
export function detectSceneEvents(deviceExternalId, previous, next) {
  const events = [];
  if (turnedOn(previous.car_plugged, next.car_plugged)) {
    events.push({ key: TRIGGERS.VEHICLE_PLUGGED_IN, data: { device: deviceExternalId } });
  }
  if (turnedOn(previous.charging, next.charging)) {
    events.push({
      key: TRIGGERS.CHARGING_STARTED,
      data: { device: deviceExternalId, charge_mode: next.charge_mode ?? null },
    });
  }
  if (turnedOff(previous.charging, next.charging)) {
    events.push({
      key: TRIGGERS.CHARGING_STOPPED,
      data: { device: deviceExternalId, session_energy_kwh: sessionEnergyKwh(next) },
    });
  }
  if (turnedOff(previous.car_plugged, next.car_plugged)) {
    events.push({
      key: TRIGGERS.VEHICLE_UNPLUGGED,
      data: { device: deviceExternalId, session_energy_kwh: sessionEnergyKwh(next) },
    });
  }
  return events;
}
