import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CannotConnectError,
  HypervoltApi,
  InvalidAuthError,
  TOKEN_URL,
} from '../src/hypervolt/api.js';

const json = (status, body) => ({
  status,
  ok: status >= 200 && status < 300,
  json: async () => body,
});

function recordingFetch(handler) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, init });
    return handler(url, init, calls);
  };
  return { calls, fetchImpl };
}

const tokenBody = { access_token: 'a1', refresh_token: 'r1', expires_in: 3600 };

test('logs in with the password grant, then lists the chargers', async () => {
  const { calls, fetchImpl } = recordingFetch((url) =>
    url === TOKEN_URL
      ? json(200, tokenBody)
      : json(200, { chargers: [{ id: 42, model: 'Home 3 Pro' }] }),
  );
  const api = new HypervoltApi({ email: 'me@example.com', password: 'pw', fetch: fetchImpl });
  const chargers = await api.getChargers();
  assert.deepEqual(chargers, [{ id: '42', model: 'Home 3 Pro' }]);

  const body = new URLSearchParams(calls[0].init.body);
  assert.equal(body.get('grant_type'), 'password');
  assert.equal(body.get('username'), 'me@example.com');
  assert.equal(calls[1].url, 'https://api.hypervolt.co.uk/users/me?includes=chargers');
  assert.equal(calls[1].init.headers.authorization, 'Bearer a1');
});

test('a refused login is an InvalidAuthError', async () => {
  const { fetchImpl } = recordingFetch(() => json(401, { error: 'invalid_grant' }));
  const api = new HypervoltApi({ email: 'me@example.com', password: 'bad', fetch: fetchImpl });
  await assert.rejects(api.getChargers(), InvalidAuthError);
});

test('a network failure is a CannotConnectError', async () => {
  const api = new HypervoltApi({
    email: 'me@example.com',
    password: 'pw',
    fetch: async () => {
      throw new Error('ECONNREFUSED');
    },
  });
  await assert.rejects(api.login(), CannotConnectError);
});

test('a server error is a CannotConnectError', async () => {
  const { fetchImpl } = recordingFetch(() => json(503, {}));
  const api = new HypervoltApi({ email: 'me@example.com', password: 'pw', fetch: fetchImpl });
  await assert.rejects(api.login(), CannotConnectError);
});

test('reuses a fresh token, refreshes an expiring one', async () => {
  let now = 0;
  const { calls, fetchImpl } = recordingFetch((url, init) => {
    const grant = new URLSearchParams(init.body).get('grant_type');
    return json(200, grant === 'refresh_token' ? { ...tokenBody, access_token: 'a2' } : tokenBody);
  });
  const api = new HypervoltApi({ email: 'e', password: 'p', fetch: fetchImpl, now: () => now });
  assert.equal(await api.getAccessToken(), 'a1');
  assert.equal(await api.getAccessToken(), 'a1');
  assert.equal(calls.length, 1, 'the fresh token is reused');

  now = 3600 * 1000 - 60 * 1000; // a minute before expiry
  assert.equal(await api.getAccessToken(), 'a2');
  assert.equal(new URLSearchParams(calls[1].init.body).get('grant_type'), 'refresh_token');
});

test('falls back to a full login when the refresh token is refused', async () => {
  let now = 0;
  const { calls, fetchImpl } = recordingFetch((url, init) => {
    const grant = new URLSearchParams(init.body).get('grant_type');
    return grant === 'refresh_token' ? json(400, {}) : json(200, tokenBody);
  });
  const api = new HypervoltApi({ email: 'e', password: 'p', fetch: fetchImpl, now: () => now });
  await api.getAccessToken();
  now = 10 * 3600 * 1000;
  assert.equal(await api.getAccessToken(), 'a1');
  const grants = calls.map((c) => new URLSearchParams(c.init.body).get('grant_type'));
  assert.deepEqual(grants, ['password', 'refresh_token', 'password']);
});

test('logs in again once when the API answers 401', async () => {
  let apiCalls = 0;
  const { calls, fetchImpl } = recordingFetch((url) => {
    if (url === TOKEN_URL) return json(200, tokenBody);
    apiCalls += 1;
    return apiCalls === 1 ? json(401, {}) : json(200, { chargers: [] });
  });
  const api = new HypervoltApi({ email: 'e', password: 'p', fetch: fetchImpl });
  assert.deepEqual(await api.getChargers(), []);
  assert.equal(calls.filter((c) => c.url === TOKEN_URL).length, 2);
});
