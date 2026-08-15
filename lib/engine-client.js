'use strict';
/**
 * A thin HTTP client for talking to any of the 5 capability engines
 * (vault/pulse/scope/circle/spark). Every engine speaks the same shape --
 * GET /health, GET /manifest (public), everything else behind a bearer
 * token -- because they were all built off the same vault/src/server.js
 * pattern. One client, five engines, no per-engine special-casing.
 */

const { Readable } = require('stream');

// Render's free-tier spokes sleep after inactivity and take ~60s to wake on
// the first request that hits them -- 15s was shorter than that, causing
// real, reproduced intermittent 502s on a sleeping spoke's first request
// (see the hub refactor canvas). 80s clears that with margin; a genuinely
// down engine still fails, just not falsely on a cold one.
function createEngineClient({ name, baseUrl, getToken = () => '', fetchFn = fetch, timeoutMs = 80000 }) {
  if (!name) throw new Error('createEngineClient requires name');
  if (!baseUrl) throw new Error('createEngineClient requires baseUrl');

  async function raw(method, path, body, { token } = {}) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    // `token` overrides getToken() for this one call -- needed anywhere
    // hub forwards a REQUEST-SPECIFIC credential (e.g. verifying a caller's
    // own session token against vault) rather than its own configured one.
    const effectiveToken = token !== undefined ? token : getToken();
    try {
      const res = await fetchFn(`${baseUrl}${path}`, {
        method,
        signal: ctrl.signal,
        headers: {
          ...(effectiveToken ? { Authorization: `Bearer ${effectiveToken}` } : {}),
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
      const data = await res.json().catch(() => null);
      return { status: res.status, data };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Like raw(), but for bodies that must not be JSON-encoded/decoded --
   * a file upload going in, a file/audio/video coming back out. Returns
   * the fetch Response UNREAD (caller streams res.body itself), unlike
   * raw() which always resolves the whole thing to parsed JSON.
   * `reqStream` is a Node Readable (typically the original IncomingMessage,
   * piped straight through) -- Node's fetch needs it as a web stream plus
   * `duplex: 'half'` to send a stream body at all.
   */
  async function rawStream(method, path, { token, reqStream, headers = {} } = {}) {
    const effectiveToken = token !== undefined ? token : getToken();
    const body = reqStream ? Readable.toWeb(reqStream) : undefined;
    return fetchFn(`${baseUrl}${path}`, {
      method,
      headers: {
        ...(effectiveToken ? { Authorization: `Bearer ${effectiveToken}` } : {}),
        ...headers,
      },
      ...(body ? { body, duplex: 'half' } : {}),
    });
  }

  async function health() {
    try {
      const r = await raw('GET', '/health');
      return r.status === 200 && r.data?.status === 'ok';
    } catch { return false; }
  }

  async function manifest() {
    const r = await raw('GET', '/manifest');
    if (r.status !== 200) throw new Error(`${name}: manifest fetch failed (HTTP ${r.status})`);
    return r.data;
  }

  /** Fill :param tokens in a path template from `params`, e.g. '/vault/:collection' + {collection:'scope/tasks.tsv'}. */
  function fillPath(pathTemplate, params = {}) {
    return pathTemplate.replace(/:([A-Za-z_]+)/g, (m, key) => {
      if (!(key in params)) throw new Error(`${name}: missing path param "${key}" for ${pathTemplate}`);
      return encodeURIComponent(params[key]);
    });
  }

  async function call(method, pathTemplate, { params, query, body, token } = {}) {
    let path = fillPath(pathTemplate, params);
    if (query && Object.keys(query).length) {
      const qs = new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== null));
      path += `?${qs.toString()}`;
    }
    return raw(method, path, body, { token });
  }

  return { name, baseUrl, raw, rawStream, health, manifest, call };
}

module.exports = { createEngineClient };
