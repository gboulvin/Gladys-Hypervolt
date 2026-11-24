import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, hasCredentials, normalizeConfig } from '../src/config.js';

test('normalizeConfig returns the defaults when called with no argument', () => {
  assert.deepEqual(normalizeConfig(), DEFAULT_CONFIG);
});

test('normalizeConfig trims the email but keeps the password as typed', () => {
  const config = normalizeConfig({ email: '  me@example.com ', password: ' secret ' });
  assert.equal(config.email, 'me@example.com');
  assert.equal(config.password, ' secret ');
});

test('hasCredentials needs both the email and the password', () => {
  assert.equal(hasCredentials(normalizeConfig()), false);
  assert.equal(hasCredentials(normalizeConfig({ email: 'me@example.com' })), false);
  assert.equal(hasCredentials(normalizeConfig({ email: 'me@example.com', password: 'x' })), true);
});
