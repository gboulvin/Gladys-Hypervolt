import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { HypervoltManager, RETRY_DELAY_MS } from '../src/manager.js';
import { CannotConnectError, InvalidAuthError } from '../src/hypervolt/api.js';
import { FEATURE, chargerIds } from '../src/devices/charger.js';
import { TRIGGERS } from '../src/triggers.js';
import { MESSAGES } from '../src/i18n.js';
import { normalizeConfig } from '../src/config.js';
import { CHARGER_ID, FakeSyncClient, fakeApi, flush } from './helpers.js';

const config = normalizeConfig({ email: 'me@example.com', password: 'pw' });

function setup(apiOptions) {
  const gladys = createFakeGladys();
  const clients = [];
  let widgetChanges = 0;
  const manager = new HypervoltManager(gladys, {
    createApi: () => fakeApi(apiOptions),
    createSyncClient: (options) => {
      const client = new FakeSyncClient(options);
      clients.push(client);
      return client;
    },
    onWidgetChange: () => {
      widgetChanges += 1;
    },
  });
  return { gladys, manager, clients, widgetChanges: () => widgetChanges };
}

test('start publishes one device per charger and connects it', async () => {
  const { gladys, manager, clients } = setup();
  const outcome = await manager.start(config);
  assert.deepEqual(outcome, { ok: true, count: 1 });
  assert.equal(gladys.fake.discoveredDevices.length, 1);
  assert.equal(gladys.fake.discoveredDevices[0].name, 'Garage');
  assert.equal(clients[0].started, true);
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.equal(gladys.fake.transports.at(-1).transport, 'unreachable');
  manager.stop();
  assert.equal(clients[0].started, false);
});

test('missing credentials are reported without calling Hypervolt', async () => {
  const { gladys, manager } = setup();
  const outcome = await manager.start(normalizeConfig());
  assert.equal(outcome.ok, false);
  assert.deepEqual(gladys.fake.connectionStatus.message, MESSAGES.missingCredentials);
});

test('refused credentials are reported, without retry', async () => {
  const { gladys, manager } = setup({ error: new InvalidAuthError() });
  const outcome = await manager.start(config);
  assert.deepEqual(outcome.message, MESSAGES.invalidCredentials);
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.equal(manager.retryTimer, null);
});

test('an unreachable cloud is retried', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { gladys, manager } = setup({ error: new CannotConnectError() });
  await manager.start(config);
  assert.deepEqual(gladys.fake.connectionStatus.message, MESSAGES.cannotConnect);
  const before = gladys.fake.connectionStatuses.length;
  t.mock.timers.tick(RETRY_DELAY_MS);
  await flush();
  assert.ok(gladys.fake.connectionStatuses.length > before, 'a new attempt was made');
  manager.stop();
});

test('an account without charger says so', async () => {
  const { gladys, manager } = setup({ chargers: [] });
  await manager.start(config);
  assert.deepEqual(gladys.fake.connectionStatus.message, MESSAGES.noCharger);
});

test('live states are published, scene events fired on transitions', async () => {
  const { gladys, manager, clients, widgetChanges } = setup();
  await manager.start(config);
  const client = clients[0];
  const ids = chargerIds(gladys, CHARGER_ID);

  client.setConnected(true);
  await flush();
  assert.equal(gladys.fake.transports.at(-1).transport, 'cloud');

  // First values after a connection: no event.
  client.push({ car_plugged: false, charging: false, session_wh: 0 });
  await flush();
  assert.equal(gladys.fake.sceneEvents.length, 0);
  assert.equal(gladys.fake.lastState(ids.feature(FEATURE.CHARGING)), 0);

  client.push({ car_plugged: true });
  client.push({ charging: true, charge_mode: 'eco' });
  client.push({ session_wh: 7450 });
  client.push({ charging: false });
  client.push({ car_plugged: false });
  await flush();

  assert.deepEqual(
    gladys.fake.sceneEvents.map((e) => e.key),
    [
      TRIGGERS.VEHICLE_PLUGGED_IN,
      TRIGGERS.CHARGING_STARTED,
      TRIGGERS.CHARGING_STOPPED,
      TRIGGERS.VEHICLE_UNPLUGGED,
    ],
  );
  const stopped = gladys.fake.sceneEvents[2];
  assert.equal(stopped.data.device, ids.device);
  assert.equal(stopped.data.session_energy_kwh, 7.45);
  assert.equal(gladys.fake.sceneEvents[1].data.charge_mode, 'eco');
  assert.equal(gladys.fake.lastState(ids.feature(FEATURE.SESSION_ENERGY)), 7.45);
  assert.ok(widgetChanges() > 0, 'the widget is nudged');
  manager.stop();
});

test('the name set in the Hypervolt app renames the discovered device', async () => {
  const { gladys, manager, clients } = setup();
  await manager.start(config);
  clients[0].push({ name: 'Driveway' });
  await flush();
  assert.equal(gladys.fake.discoveredDevices[0].name, 'Driveway');
  manager.stop();
});

test('onSetValue reaches the charger that owns the feature', async () => {
  const { gladys, manager, clients } = setup();
  await manager.start(config);
  clients[0].connected = true;
  const ids = chargerIds(gladys, CHARGER_ID);
  await manager.setValue(
    { external_id: ids.device },
    { external_id: ids.feature(FEATURE.MAX_CURRENT) },
    10,
  );
  assert.deepEqual(clients[0].commands, [['setMaxCurrent', 10]]);
  await assert.rejects(
    manager.setValue({ external_id: 'ext:x:unknown' }, { external_id: 'f' }, 1),
    /Unknown charger/,
  );
  manager.stop();
});

test('the whole integration answers a command through the fake Gladys', async () => {
  const { gladys, manager, clients } = setup();
  gladys.onSetValue((device, feature, value) => manager.setValue(device, feature, value));
  await manager.start(config);
  clients[0].connected = true;
  const ids = chargerIds(gladys, CHARGER_ID);
  const ack = await gladys.fake.setValue(
    { external_id: ids.device },
    { external_id: ids.feature(FEATURE.CHARGE_MODE), category: 'text', type: 'select' },
    'boost',
  );
  assert.equal(ack.success, true);
  assert.deepEqual(clients[0].commands, [['setChargeMode', 'boost']]);
  manager.stop();
});
