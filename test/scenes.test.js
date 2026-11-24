import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { HypervoltManager } from '../src/manager.js';
import { SCENE_ACTIONS } from '../src/scenes.js';
import { SCENE_TRIGGER_KEYS, detectSceneEvents } from '../src/triggers.js';
import { chargerIds } from '../src/devices/charger.js';
import { createInitialState } from '../src/hypervolt/state.js';
import { normalizeConfig } from '../src/config.js';
import { CHARGER_ID, FakeSyncClient, fakeApi } from './helpers.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const declarationOf = (list, key) => manifest[list].find((entry) => entry.key === key);
const keysOf = (list) => (list ?? []).map((entry) => entry.key);

async function startedManager() {
  const gladys = createFakeGladys();
  const clients = [];
  const manager = new HypervoltManager(gladys, {
    createApi: () => fakeApi(),
    createSyncClient: (options) => {
      const client = new FakeSyncClient(options);
      clients.push(client);
      return client;
    },
  });
  await manager.start(normalizeConfig({ email: 'me@example.com', password: 'pw' }));
  return { gladys, manager, client: clients[0], device: chargerIds(gladys, CHARGER_ID).device };
}

test('scene event data only carries keys the trigger declares', () => {
  const device = 'ext:hypervolt:charger:1';
  const before = { ...createInitialState(), car_plugged: true, charging: true, session_wh: 1000 };
  const after = { ...before, car_plugged: false, charging: false };
  const events = [
    ...detectSceneEvents(device, { ...before, car_plugged: false, charging: false }, before),
    ...detectSceneEvents(device, before, after),
  ];
  assert.deepEqual(events.map((e) => e.key).sort(), [...SCENE_TRIGGER_KEYS].sort());
  for (const { key, data } of events) {
    const trigger = declarationOf('scene_triggers', key);
    const declared = [...keysOf(trigger.fields), ...keysOf(trigger.variables)];
    for (const [dataKey, value] of Object.entries(data)) {
      assert.ok(declared.includes(dataKey), `${key}: data.${dataKey} is not declared`);
      assert.ok(value === null || typeof value !== 'object', `${key}: data.${dataKey} primitive`);
    }
    assert.equal(data.device, device, 'the `device` filter stores the device external_id');
  }
});

test('no event for the first value known after a connection', () => {
  const after = { ...createInitialState(), car_plugged: true, charging: true };
  assert.deepEqual(detectSceneEvents('d', createInitialState(), after), []);
});

test('each scene action sends its command and returns the declared outputs', async () => {
  const { manager, client, device } = await startedManager();
  client.connected = true;
  const runs = {
    start_charging: { charger: device },
    stop_charging: { charger: device },
    set_charge_mode: { charger: device, mode: 'super_eco' },
    set_max_current: { charger: device, current: 12 },
    set_lock: { charger: device, locked: true },
  };
  assert.deepEqual(Object.keys(runs).sort(), Object.keys(SCENE_ACTIONS).sort());
  for (const [key, fields] of Object.entries(runs)) {
    const outputs = await SCENE_ACTIONS[key](manager, { fields });
    assert.deepEqual(outputs, { success: true }, key);
    const declared = keysOf(declarationOf('scene_actions', key).outputs);
    for (const output of Object.keys(outputs)) {
      assert.ok(declared.includes(output), `${key}: output "${output}" is not declared`);
    }
  }
  assert.deepEqual(client.commands, [
    ['setCharging', true],
    ['setCharging', false],
    ['setChargeMode', 'super_eco'],
    ['setMaxCurrent', 12],
    ['setLocked', true],
  ]);
  manager.stop();
});

test('an offline or unknown charger is an output, not a failure', async () => {
  const { manager, device } = await startedManager();
  assert.deepEqual(await SCENE_ACTIONS.start_charging(manager, { fields: { charger: device } }), {
    success: false,
  });
  assert.deepEqual(
    await SCENE_ACTIONS.stop_charging(manager, { fields: { charger: 'ext:x:nope' } }),
    { success: false },
  );
  manager.stop();
});

test('the fake Gladys relays a scene action to the integration', async () => {
  const { gladys, manager, client, device } = await startedManager();
  client.connected = true;
  gladys.onSceneAction('start_charging', (fields) =>
    SCENE_ACTIONS.start_charging(manager, { fields }),
  );
  const ack = await gladys.fake.sceneAction('start_charging', { charger: device });
  assert.equal(ack.success, true);
  assert.deepEqual(ack.data.outputs, { success: true });
  manager.stop();
});
