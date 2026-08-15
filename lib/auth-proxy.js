'use strict';
/**
 * hub does not reimplement login -- vault already built the real thing
 * (TOTP/PIN/lockout/session, see vault/lib/auth.js). hub PROXIES the login
 * routes verbatim and verifies every other request's bearer token by
 * asking vault whether it's still valid. One source of truth for "is this
 * session real", not a second copy of the auth logic.
 */

function createAuthProxy({ vault }) {
  if (!vault) throw new Error('createAuthProxy requires vault (a createEngineClient() instance)');

  /** Forward a login route's body to vault verbatim, forward vault's response verbatim. */
  async function proxyLogin(path, body) {
    const r = await vault.call('POST', path, { body });
    return { status: r.status, data: r.data };
  }

  async function totp(body) { return proxyLogin('/auth/totp', body); }
  async function pin(body) { return proxyLogin('/auth/pin', body); }

  /** Which login methods vault actually has configured -- the client asks this
   *  before it has any credential, so it has to work with no bearer token. */
  async function methods() {
    const r = await vault.call('GET', '/auth/methods', {});
    return { status: r.status, data: r.data };
  }

  /** Is this bearer token a real, currently-valid vault session? */
  async function verify(token) {
    if (!token) return { valid: false };
    try {
      // vault's /auth/verify reads the bearer token off the request it
      // receives, so THIS token has to be forwarded, not vault's own
      // configured one -- the `token` override exists on raw()/call()
      // precisely for this.
      const r = await vault.raw('POST', '/auth/verify', {}, { token });
      return r.data || { valid: false };
    } catch { return { valid: false }; }
  }

  /** Set/reset the PIN. Same caller-token forwarding as verify() -- vault's
   *  own auth gate is what actually authorizes this, not anything hub adds. */
  async function setPin(token, newPin) {
    const r = await vault.raw('POST', '/auth/set-pin', { pin: newPin }, { token });
    return { status: r.status, data: r.data };
  }

  return { totp, pin, verify, methods, setPin };
}

module.exports = { createAuthProxy };
