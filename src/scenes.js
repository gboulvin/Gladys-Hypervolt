// -----------------------------------------------------------------------------
// Scene actions (SDK v0.14+, Gladys 5.1+).
//
// Operations a scene author places in a scene: start or stop a charge, switch
// the charge mode, change the max current, lock the charger. Each key is
// declared in the manifest `scene_actions` field; index.js registers every
// entry with `gladys.onSceneAction(key, ...)`.
//
// The rules that matter:
//   - `fields` arrive RESOLVED; `charger` is the chosen device external_id;
//   - a charger that cannot be reached is an OUTPUT (`success: false`), not a
//     failure: a scene action is never a condition, the scene author gates on
//     the output;
//   - never fire a scene event as a consequence of an action here (loops).
//     The charger's own state change does fire the triggers, as it should.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';

const logger = createLogger({ name: 'scenes' });

async function onCharger(manager, fields, actionName, run) {
  const entry = manager.findByDevice(fields.charger);
  if (!entry) {
    logger.warn(`Scene action ${actionName}: unknown charger ${fields.charger}`);
    return { success: false };
  }
  try {
    await run(entry.client);
    return { success: true };
  } catch (err) {
    logger.warn(`Scene action ${actionName} failed on ${entry.charger.id}: ${err.message}`);
    return { success: false };
  }
}

export const SCENE_ACTIONS = {
  async start_charging(manager, { fields }) {
    return onCharger(manager, fields, 'start_charging', (client) => client.setCharging(true));
  },

  async stop_charging(manager, { fields }) {
    return onCharger(manager, fields, 'stop_charging', (client) => client.setCharging(false));
  },

  async set_charge_mode(manager, { fields }) {
    return onCharger(manager, fields, 'set_charge_mode', (client) =>
      client.setChargeMode(fields.mode),
    );
  },

  async set_max_current(manager, { fields }) {
    return onCharger(manager, fields, 'set_max_current', (client) =>
      client.setMaxCurrent(fields.current),
    );
  },

  async set_lock(manager, { fields }) {
    return onCharger(manager, fields, 'set_lock', (client) =>
      client.setLocked(fields.locked === true || fields.locked === 'true'),
    );
  },
};
