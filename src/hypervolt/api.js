// -----------------------------------------------------------------------------
// Hypervolt cloud REST client.
//
// Hypervolt chargers have no documented local API: everything goes through the
// Hypervolt cloud, the same one the mobile app uses.
//   - authentication: OpenID Connect password grant on the Hypervolt Keycloak
//     realm, then refresh-token grants before the access token expires;
//   - charger list: `GET /users/me?includes=chargers`;
//   - live state and commands: one WebSocket per charger (see sync-client.js).
//
// `fetch` is injectable so the tests never touch the network.
// -----------------------------------------------------------------------------

export const TOKEN_URL =
  'https://kc.prod.hypervolt.co.uk/realms/retail-customers/protocol/openid-connect/token';
export const API_BASE_URL = 'https://api.hypervolt.co.uk';
export const SYNC_WS_URL = (chargerId) =>
  `wss://api.hypervolt.co.uk/ws/charger/${encodeURIComponent(chargerId)}/sync`;
export const WS_ORIGIN = 'https://hypervolt.co.uk';

// Public OpenID client Hypervolt provisions for third-party home automation.
export const CLIENT_ID = 'home-assistant';
export const USER_AGENT = 'gladys-hypervolt';

// Refresh the access token this long before it expires.
const REFRESH_MARGIN_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 20 * 1000;

/** The account credentials were refused (HTTP 4xx on the token endpoint). */
export class InvalidAuthError extends Error {
  constructor(message = 'Invalid Hypervolt credentials') {
    super(message);
    this.name = 'InvalidAuthError';
  }
}

/** The cloud could not be reached, or answered an unexpected error. */
export class CannotConnectError extends Error {
  constructor(message = 'Cannot reach the Hypervolt cloud') {
    super(message);
    this.name = 'CannotConnectError';
  }
}

export class HypervoltApi {
  /**
   * @param {{ email: string, password: string, fetch?: typeof fetch, now?: () => number }} options
   */
  constructor({ email, password, fetch: fetchImpl = globalThis.fetch, now = Date.now }) {
    this.email = email;
    this.password = password;
    this.fetch = fetchImpl;
    this.now = now;
    this.accessToken = null;
    this.refreshToken = null;
    this.expiresAt = 0;
  }

  /** Whether the current access token is still valid for a while. */
  hasFreshToken() {
    return Boolean(this.accessToken) && this.now() < this.expiresAt - REFRESH_MARGIN_MS;
  }

  /**
   * Resolve a valid access token: the current one, a refreshed one, or a new
   * login with the credentials when the refresh token is refused.
   */
  async getAccessToken() {
    if (this.hasFreshToken()) {
      return this.accessToken;
    }
    if (this.refreshToken) {
      try {
        return await this.#requestToken({
          grant_type: 'refresh_token',
          refresh_token: this.refreshToken,
        });
      } catch {
        // Expired or revoked refresh token, or a network blip: fall back to a
        // full login below, which reports the real error.
        this.refreshToken = null;
      }
    }
    return this.login();
  }

  /** Log in with the account credentials. */
  async login() {
    return this.#requestToken({
      grant_type: 'password',
      scope: 'openid profile email offline_access',
      username: this.email,
      password: this.password,
    });
  }

  /**
   * List the chargers of the account.
   * @returns {Promise<Array<{ id: string, name?: string, model?: string }>>}
   */
  async getChargers() {
    const body = await this.#getJson('/users/me?includes=chargers');
    const chargers = Array.isArray(body?.chargers) ? body.chargers : [];
    return chargers
      .filter((charger) => charger && charger.id !== undefined && charger.id !== null)
      .map((charger) => ({ ...charger, id: String(charger.id) }));
  }

  async #getJson(path) {
    const token = await this.getAccessToken();
    let response = await this.#send(`${API_BASE_URL}${path}`, {
      headers: { authorization: `Bearer ${token}`, 'user-agent': USER_AGENT },
    });
    if (response.status === 401) {
      // Token revoked server-side: one fresh login, then give up.
      this.accessToken = null;
      this.expiresAt = 0;
      const retryToken = await this.getAccessToken();
      response = await this.#send(`${API_BASE_URL}${path}`, {
        headers: { authorization: `Bearer ${retryToken}`, 'user-agent': USER_AGENT },
      });
    }
    if (response.status === 401 || response.status === 403) {
      throw new InvalidAuthError(`Hypervolt API refused the token (HTTP ${response.status})`);
    }
    if (!response.ok) {
      throw new CannotConnectError(`Hypervolt API error (HTTP ${response.status})`);
    }
    return response.json();
  }

  async #requestToken(params) {
    const response = await this.#send(TOKEN_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'user-agent': USER_AGENT,
      },
      body: new URLSearchParams({ client_id: CLIENT_ID, ...params }).toString(),
    });
    if (response.status >= 400 && response.status < 500) {
      // Never log the body: it may echo the username.
      throw new InvalidAuthError(`Hypervolt refused the authentication (HTTP ${response.status})`);
    }
    if (!response.ok) {
      throw new CannotConnectError(`Hypervolt authentication error (HTTP ${response.status})`);
    }
    const body = await response.json();
    if (!body?.access_token) {
      throw new CannotConnectError('Hypervolt authentication answered without a token');
    }
    this.accessToken = body.access_token;
    this.refreshToken = body.refresh_token ?? null;
    this.expiresAt = this.now() + Number(body.expires_in ?? 300) * 1000;
    return this.accessToken;
  }

  async #send(url, init) {
    try {
      return await this.fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    } catch (err) {
      throw new CannotConnectError(`Cannot reach ${new URL(url).host}: ${err.message}`);
    }
  }
}
