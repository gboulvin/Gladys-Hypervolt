import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  apiVersion,
  applyMessage,
  chargePowerW,
  chargerMajorVersion,
  createInitialState,
  isLocked,
} from '../src/hypervolt/state.js';
import { CHARGER_ID, V2_CHARGER_ID } from './helpers.js';

test('a sync snapshot fills the settings', () => {
  const state = applyMessage(createInitialState(), 'sync.snapshot', [
    { brightness: 0.25 },
    { lock_state: 'unlocked' },
    { release_state: 'default' },
    { max_current: 32000 },
    { solar_mode: 'boost' },
    { features: ['super_eco'] },
  ]);
  assert.equal(state.brightness, 0.25);
  assert.equal(state.lock_state, 'unlocked');
  assert.equal(state.release_state, 'default');
  assert.equal(state.max_current_ma, 32000);
  assert.equal(state.charge_mode, 'boost');
  assert.deepEqual(state.features, ['super_eco']);
});

test('a session update fills the measures and keeps the rest', () => {
  const before = { ...createInitialState(), max_current_ma: 16000 };
  const state = applyMessage(before, 'get.session', {
    charging: true,
    session: 12,
    watt_hours: 5321,
    true_milli_amps: 15800,
    voltage: 236,
    ev_power: 3729,
  });
  assert.equal(state.charging, true);
  assert.equal(state.session_wh, 5321);
  assert.equal(state.current_ma, 15800);
  assert.equal(state.voltage, 236);
  assert.equal(state.max_current_ma, 16000);
  assert.notEqual(state, before, 'the state is copied, never mutated');
  assert.equal(before.charging, null);
});

test('the pilot status tells whether a vehicle is plugged in', () => {
  const plugged = applyMessage(createInitialState(), 'get.pilot_status', { pilot_status: 'C' });
  assert.equal(plugged.car_plugged, true);
  const unplugged = applyMessage(plugged, 'get.pilot_status', { pilot_status: 'A' });
  assert.equal(unplugged.car_plugged, false);
  const error = applyMessage(plugged, 'get.pilot_status', { pilot_status: 'F' });
  assert.equal(error.car_plugged, true, 'an error state leaves the value as-is');
});

test('plug and charge answers set the charge mode only when applied', () => {
  let state = applyMessage(createInitialState(), 'plugncharge.get', { applied: 'eco' });
  assert.equal(state.charge_mode, 'eco');
  state = applyMessage(state, 'plugncharge.set', { mode: 'boost', applied: false });
  assert.equal(state.charge_mode, 'eco');
  state = applyMessage(state, 'plugncharge.set', { mode: 'boost', applied: true });
  assert.equal(state.charge_mode, 'boost');
});

test('firmware, name and unknown methods', () => {
  const initial = createInitialState();
  assert.equal(applyMessage(initial, 'firmware.version', 2483.2).firmware_version, '2483.2');
  assert.equal(applyMessage(initial, 'get.name', ' Garage ').name, 'Garage');
  assert.equal(applyMessage(initial, 'something.else', {}), initial);
});

test('the charging power is reported, or derived from voltage and current', () => {
  assert.equal(chargePowerW({ ev_power: 7012.4 }), 7012);
  assert.equal(chargePowerW({ ev_power: null, voltage: 230, current_ma: 10000 }), 2300);
  assert.equal(chargePowerW({ ev_power: null, voltage: null, charging: false }), 0);
  assert.equal(chargePowerW(createInitialState()), null);
});

test('a pending lock already counts as locked', () => {
  assert.equal(isLocked({ lock_state: 'pending_lock' }), true);
  assert.equal(isLocked({ lock_state: 'locked' }), true);
  assert.equal(isLocked({ lock_state: 'unlocked' }), false);
  assert.equal(isLocked({ lock_state: null }), null);
});

test('the protocol version follows the hardware and the firmware', () => {
  assert.equal(chargerMajorVersion(CHARGER_ID), 3);
  assert.equal(chargerMajorVersion(V2_CHARGER_ID), 2);
  assert.equal(chargerMajorVersion('not-a-number'), 3);
  assert.equal(apiVersion(CHARGER_ID, null), 3);
  assert.equal(apiVersion(V2_CHARGER_ID, null), 2);
  assert.equal(apiVersion(V2_CHARGER_ID, '202111231810.abcdef'), 2);
  assert.equal(apiVersion(V2_CHARGER_ID, '1.0'), 3);
});
