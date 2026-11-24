import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { HypervoltManager } from '../src/manager.js';
import { CHARGER_WIDGET, WIDGETS, WIDGET_ACTIONS, refreshWidgets } from '../src/widgets.js';
import { normalizeConfig } from '../src/config.js';
import { MESSAGES } from '../src/i18n.js';
import { CHARGER_ID, FakeSyncClient, fakeApi } from './helpers.js';

const widget = WIDGETS[CHARGER_WIDGET];
const request = { settings: {}, language: 'en', units: 'metric' };

async function startedManager(apiOptions) {
  const gladys = createFakeGladys();
  const clients = [];
  const manager = new HypervoltManager(gladys, {
    createApi: () => fakeApi(apiOptions),
    createSyncClient: (options) => {
      const client = new FakeSyncClient(options);
      clients.push(client);
      return client;
    },
  });
  await manager.start(normalizeConfig({ email: 'me@example.com', password: 'pw' }));
  return { gladys, manager, client: clients[0] };
}

test('the content is rendered exactly as sent, whatever the state', async () => {
  const { manager, client } = await startedManager();
  assert.deepEqual(validateWidgetContent(await widget.get(manager, request)), []);
  client.connected = true;
  client.push({
    car_plugged: true,
    charging: true,
    charge_mode: 'super_eco',
    lock_state: 'locked',
    name: 'A very very long charger name that goes on and on',
  });
  assert.deepEqual(validateWidgetContent(await widget.get(manager, request)), []);
  manager.stop();
});

test('the empty state is valid too', async () => {
  const { manager } = await startedManager({ chargers: [] });
  const content = await widget.get(manager, request);
  assert.deepEqual(validateWidgetContent(content), []);
  assert.equal(content.components[0].type, 'text');
});

test('the live tiles reference features the integration publishes', async () => {
  const { manager } = await startedManager();
  const featureIds = new Set(
    manager.buildDevices().flatMap((device) => device.features.map((f) => f.external_id)),
  );
  const tiles = (await widget.get(manager, request)).components.filter((c) => c.device_feature);
  assert.ok(tiles.length > 0);
  for (const tile of tiles) assert.ok(featureIds.has(tile.device_feature), tile.device_feature);
  manager.stop();
});

test('the start button turns into a stop button while charging', async () => {
  const { manager, client } = await startedManager();
  const actionsOf = async () =>
    (await widget.get(manager, request)).components
      .filter((c) => c.type === 'button')
      .map((c) => c.action.key);
  assert.ok((await actionsOf()).includes(WIDGET_ACTIONS.START));
  client.push({ charging: true });
  assert.ok((await actionsOf()).includes(WIDGET_ACTIONS.STOP));
  manager.stop();
});

test('every button action is handled and answers a short toast', async () => {
  const { manager, client } = await startedManager();
  client.connected = true;
  for (const key of Object.values(WIDGET_ACTIONS)) {
    const message = await widget.action(manager, {
      actionKey: key,
      params: { charger: manager.buildDevices()[0].external_id },
    });
    for (const lang of ['en', 'fr', 'de', 'es']) {
      assert.ok(message[lang] && message[lang].length <= 200, `${key}: ${lang} toast`);
    }
  }
  assert.equal(client.commands.length, Object.values(WIDGET_ACTIONS).length);
  manager.stop();
});

test('an offline charger answers a toast instead of sending', async () => {
  const { manager, client } = await startedManager();
  const message = await widget.action(manager, {
    actionKey: WIDGET_ACTIONS.START,
    params: { charger: manager.buildDevices()[0].external_id },
  });
  assert.deepEqual(message, MESSAGES.chargerOffline);
  assert.equal(client.commands.length, 0);
  manager.stop();
});

test('an unknown widget action or charger fails', async () => {
  const { manager, client } = await startedManager();
  client.connected = true;
  const charger = manager.buildDevices()[0].external_id;
  await assert.rejects(
    widget.action(manager, { actionKey: 'unknown', params: { charger } }),
    /Unknown widget action/,
  );
  await assert.rejects(
    widget.action(manager, { actionKey: WIDGET_ACTIONS.START, params: { charger: 'x' } }),
  );
  manager.stop();
});

test('the charger setting picks the charger', async () => {
  const { manager } = await startedManager({
    chargers: [
      { id: CHARGER_ID, name: 'Garage' },
      { id: '9876543210987654321', name: 'Driveway' },
    ],
  });
  const second = manager.buildDevices()[1].external_id;
  const content = await widget.get(manager, { ...request, settings: { charger: second } });
  assert.equal(content.components[0].text, 'Driveway');
  manager.stop();
});

test('refreshWidgets nudges every widget', () => {
  const fresh = createFakeGladys();
  refreshWidgets(fresh);
  assert.deepEqual(fresh.fake.widgetRefreshes, Object.keys(WIDGETS));
});
