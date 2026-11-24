import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import {
  FEATURE,
  applyChargerCommand,
  buildChargerDevice,
  buildChargerStates,
  chargerIds,
  chargerName,
  featureKeyOf,
} from '../src/devices/charger.js';
import { createInitialState } from '../src/hypervolt/state.js';
import { CHARGER_ID, FakeSyncClient } from './helpers.js';

const gladys = createFakeGladys();
const charger = { id: CHARGER_ID, model: 'Home 3 Pro' };

test('Gladys accepts the discovery payload', async () => {
  // The SDK fake checks the payload like the host API does: external_id
  // prefix, known category/type/unit... A refusal is a 400 for the WHOLE list.
  const fresh = createFakeGladys();
  await fresh.publishDiscoveredDevices([buildChargerDevice(fresh, charger)]);
  assert.equal(fresh.fake.discoveredDevices.length, 1);
});

test('every feature carries the columns Gladys needs to create it', () => {
  const device = buildChargerDevice(gladys, charger);
  for (const feature of device.features) {
    const where = `${device.name} / ${feature.name}`;
    assert.ok(feature.name, `${where}: name`);
    assert.equal(typeof feature.read_only, 'boolean', `${where}: read_only`);
    assert.equal(typeof feature.has_feedback, 'boolean', `${where}: has_feedback`);
    assert.ok(Number.isFinite(feature.min), `${where}: min`);
    assert.ok(Number.isFinite(feature.max), `${where}: max`);
    assert.ok(feature.min <= feature.max, `${where}: min <= max`);
  }
});

test('external ids are built from the Hypervolt charger id, one per feature key', () => {
  const device = buildChargerDevice(gladys, charger);
  const ids = chargerIds(gladys, CHARGER_ID);
  assert.equal(device.external_id, ids.device);
  assert.ok(device.external_id.includes(CHARGER_ID));
  assert.deepEqual(
    device.features.map((f) => f.external_id).sort(),
    Object.values(FEATURE)
      .map((key) => ids.feature(key))
      .sort(),
  );
});

test('the device name follows the Hypervolt app, then the model, then the id', () => {
  assert.equal(chargerName(charger, { name: 'Garage' }), 'Garage');
  assert.equal(chargerName(charger), 'Hypervolt Home 3 Pro');
  assert.equal(chargerName({ id: '42' }), 'Hypervolt 42');
});

test('states are converted to Gladys units, unknown values left out', () => {
  const state = {
    ...createInitialState(),
    charging: true,
    car_plugged: true,
    current_ma: 15800,
    voltage: 236.4,
    ev_power: 3729,
    session_wh: 5321,
    max_current_ma: 16000,
    lock_state: 'unlocked',
    brightness: 0.25,
    charge_mode: 'super_eco_battery_safe',
  };
  const states = buildChargerStates(gladys, CHARGER_ID, state);
  const ids = chargerIds(gladys, CHARGER_ID);
  const byKey = Object.fromEntries(
    Object.values(FEATURE).map((key) => [
      key,
      states.find((s) => s.device_feature_external_id === ids.feature(key)),
    ]),
  );
  assert.equal(byKey[FEATURE.CHARGING].state, 1);
  assert.equal(byKey[FEATURE.PLUGGED].state, 1);
  assert.equal(byKey[FEATURE.CURRENT].state, 15.8);
  assert.equal(byKey[FEATURE.VOLTAGE].state, 236);
  assert.equal(byKey[FEATURE.POWER].state, 3729);
  assert.equal(byKey[FEATURE.SESSION_ENERGY].state, 5.32);
  assert.equal(byKey[FEATURE.MAX_CURRENT].state, 16);
  assert.equal(byKey[FEATURE.LOCK].state, 0);
  assert.equal(byKey[FEATURE.LED_BRIGHTNESS].state, 25);
  assert.equal(byKey[FEATURE.CHARGE_MODE].text, 'super_eco');
  assert.equal(byKey[FEATURE.HOUSE_POWER], undefined, 'no CT clamp, no house power');
});

test('Gladys accepts the published states', async () => {
  const fresh = createFakeGladys();
  const state = { ...createInitialState(), charging: false, charge_mode: 'eco', grid_power: -1200 };
  await fresh.publishStates(buildChargerStates(fresh, CHARGER_ID, state));
  const ids = chargerIds(fresh, CHARGER_ID);
  assert.equal(fresh.fake.lastState(ids.feature(FEATURE.CHARGE_MODE)), 'eco');
  assert.equal(fresh.fake.lastState(ids.feature(FEATURE.GRID_POWER)), -1200);
});

test('featureKeyOf finds the key of a feature external id', () => {
  const ids = chargerIds(gladys, CHARGER_ID);
  assert.equal(featureKeyOf(gladys, CHARGER_ID, ids.feature(FEATURE.LOCK)), FEATURE.LOCK);
  assert.equal(featureKeyOf(gladys, CHARGER_ID, 'ext:other:feature'), null);
});

test('Gladys commands become charger commands', async () => {
  const client = new FakeSyncClient({ chargerId: CHARGER_ID });
  client.connected = true;
  await applyChargerCommand(client, FEATURE.CHARGING, 1);
  await applyChargerCommand(client, FEATURE.CHARGING, 0);
  await applyChargerCommand(client, FEATURE.LOCK, 1);
  await applyChargerCommand(client, FEATURE.MAX_CURRENT, 20);
  await applyChargerCommand(client, FEATURE.LED_BRIGHTNESS, 40);
  await applyChargerCommand(client, FEATURE.CHARGE_MODE, 'boost');
  assert.deepEqual(client.commands, [
    ['setCharging', true],
    ['setCharging', false],
    ['setLocked', true],
    ['setMaxCurrent', 20],
    ['setBrightness', 0.4],
    ['setChargeMode', 'boost'],
  ]);
  await assert.rejects(applyChargerCommand(client, FEATURE.POWER, 1), /read-only/);
});
