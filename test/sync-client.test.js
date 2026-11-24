import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { ChargerSyncClient, STALE_AFTER_MS } from '../src/hypervolt/sync-client.js';
import { CHARGER_ID, V2_CHARGER_ID, flush } from './helpers.js';

class FakeSocket extends EventEmitter {
  constructor(url) {
    super();
    this.url = url;
    this.readyState = 0;
    this.sent = [];
    this.closed = false;
  }
  open() {
    this.readyState = 1;
    this.emit('open');
  }
  send(data) {
    this.sent.push(JSON.parse(data));
  }
  receive(message) {
    this.emit('message', Buffer.from(JSON.stringify(message)));
  }
  /** Answer the last request with this method. */
  answer(method, result) {
    const request = this.sent.findLast((m) => m.method === method);
    this.receive({ jsonrpc: '2.0', id: request.id, result });
  }
  close() {
    this.closed = true;
    this.readyState = 3;
    this.emit('close', 1000);
  }
  terminate() {
    this.close();
  }
}

function setup(chargerId = CHARGER_ID) {
  const sockets = [];
  const client = new ChargerSyncClient({
    chargerId,
    getAccessToken: async () => 'secret-token',
    createWebSocket: (url) => {
      const socket = new FakeSocket(url);
      sockets.push(socket);
      return socket;
    },
  });
  return { client, sockets };
}

async function connect(chargerId) {
  const ctx = setup(chargerId);
  ctx.client.start();
  await flush();
  const socket = ctx.sockets[0];
  socket.open();
  socket.answer('login', { authenticated: true });
  return { ...ctx, socket };
}

test('logs in with the token, then asks for the state', async () => {
  const { client, socket } = await connect();
  try {
    assert.match(socket.url, /\/ws\/charger\/1234567890123456789\/sync$/);
    const [login, ...requests] = socket.sent;
    assert.equal(login.method, 'login');
    assert.deepEqual(login.params, { token: 'secret-token', version: 3 });
    assert.equal(login.jsonrpc, '2.0');
    assert.deepEqual(
      requests.map((m) => m.method),
      ['sync.snapshot', 'schedules.get', 'plugncharge.get', 'firmware.version', 'get.name'],
    );
    assert.equal(client.connected, true);
  } finally {
    client.stop();
  }
});

test('answers and notifications update the state and emit it', async () => {
  const { client, socket } = await connect();
  try {
    const updates = [];
    client.on('state', (next, previous) => updates.push([next, previous]));
    socket.answer('sync.snapshot', [{ max_current: 16000 }, { lock_state: 'locked' }]);
    socket.receive({ jsonrpc: '2.0', method: 'get.session', params: { charging: true } });
    assert.equal(client.state.max_current_ma, 16000);
    assert.equal(client.state.lock_state, 'locked');
    assert.equal(client.state.charging, true);
    assert.equal(updates.length, 2);
    assert.equal(updates[1][1].charging, null, 'the previous state comes along');
  } finally {
    client.stop();
  }
});

test('commands are JSON-RPC requests in the Hypervolt format', async () => {
  const { client, socket } = await connect();
  try {
    socket.sent.length = 0;
    await client.setCharging(false);
    await client.setLocked(true);
    await client.setMaxCurrent(16);
    await client.setBrightness(0.5);
    await client.setChargeMode('eco');
    assert.deepEqual(
      socket.sent.map(({ method, params }) => [method, params]),
      [
        ['sync.apply', { release: true }],
        ['sync.apply', { is_locked: true }],
        ['sync.apply', { max_current: 16000 }],
        ['sync.apply', { brightness: 0.5 }],
        ['plugncharge.set', { mode: 'eco' }],
      ],
    );
    assert.throws(() => client.setMaxCurrent(40), RangeError);
    assert.throws(() => client.setChargeMode('turbo'), RangeError);
  } finally {
    client.stop();
  }
});

test('a Home 2.0 on legacy firmware sets the mode through sync.apply', async () => {
  const { client, socket } = await connect(V2_CHARGER_ID);
  try {
    assert.ok(!socket.sent.some((m) => m.method === 'plugncharge.get'));
    socket.sent.length = 0;
    await client.setChargeMode('super_eco');
    assert.deepEqual(socket.sent[0].params, { solar_mode: 'super_eco' });
  } finally {
    client.stop();
  }
});

test('a Home 2.0 on a recent firmware switches to the V3 protocol', async () => {
  const { client, socket } = await connect(V2_CHARGER_ID);
  try {
    socket.answer('firmware.version', '1.0');
    assert.ok(socket.sent.some((m) => m.method === 'plugncharge.get'));
    assert.equal(client.apiVersion, 3);
  } finally {
    client.stop();
  }
});

test('a command while offline rejects', async () => {
  const { client } = setup();
  await assert.rejects(client.setCharging(true), { code: 'CHARGER_OFFLINE' });
});

test('an error answer is reported, the state does not move', async () => {
  const { client, socket } = await connect();
  try {
    const errors = [];
    client.on('request-error', (e) => errors.push(e));
    await client.setMaxCurrent(10);
    const request = socket.sent.at(-1);
    socket.receive({ jsonrpc: '2.0', id: request.id, error: { code: 409, error: 'Concurrent' } });
    assert.equal(errors.length, 1);
    assert.equal(errors[0].method, 'sync.apply');
    assert.equal(client.state.max_current_ma, null);
  } finally {
    client.stop();
  }
});

test('reconnects after the socket closes, with a back-off', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { client, sockets } = await connect();
  try {
    const connections = [];
    client.on('connection', (c) => connections.push(c));
    sockets[0].close();
    assert.equal(client.connected, false);
    assert.deepEqual(connections, [false]);
    t.mock.timers.tick(5_000);
    await flush();
    assert.equal(sockets.length, 2, 'a new socket was opened');
  } finally {
    client.stop();
  }
});

test('a silent socket is recycled', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { client, sockets } = await connect();
  try {
    t.mock.timers.tick(STALE_AFTER_MS);
    assert.equal(sockets[0].closed, true);
  } finally {
    client.stop();
  }
});

test('a refused login closes the socket and reports an auth error', async () => {
  const { client, sockets } = setup();
  const errors = [];
  client.on('auth-error', (e) => errors.push(e));
  client.start();
  await flush();
  sockets[0].open();
  sockets[0].answer('login', { authenticated: false });
  assert.equal(errors.length, 1);
  assert.equal(sockets[0].closed, true);
  assert.equal(client.connected, false);
  client.stop();
});

test('stop closes the socket and never reconnects', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { client, sockets } = await connect();
  client.stop();
  assert.equal(sockets[0].closed, true);
  t.mock.timers.tick(10 * 60_000);
  await flush();
  assert.equal(sockets.length, 1);
});
