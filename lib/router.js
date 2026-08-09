'use strict';
/**
 * Deterministic-first routing (Decision 003): a known capability name
 * routes straight to its owning engine's declared method+path, no model
 * involved. This is hub's "call power" over the other engines -- the
 * counterpart to lib/deploy.js's "update power".
 *
 * A shared trace ID threads every call so a multi-engine operation
 * (started by one client request) leaves one linkable trail across
 * whichever engines it touched, extending vault's hash-chained audit log
 * from one process to the fleet (Decision 003's stated goal).
 */

const crypto = require('crypto');

function newTraceId() {
  return `trc_${Date.now().toString(36)}_${crypto.randomBytes(6).toString('hex')}`;
}

function createRouter({ registry, engines, auditLog = { log: () => {} } }) {
  if (!registry) throw new Error('createRouter requires registry');
  if (!engines) throw new Error('createRouter requires engines');

  /**
   * Call a capability by name. `params`/`query`/`body` map straight onto
   * the owning engine's client.call() -- the router doesn't reshape the
   * payload, it just resolves WHERE it goes.
   */
  async function route(capabilityName, { params, query, body, traceId } = {}) {
    const trace = traceId || newTraceId();
    const cap = await registry.find(capabilityName);
    if (!cap) {
      auditLog.log('route_unknown_capability', { capability: capabilityName, traceId: trace });
      return { ok: false, status: 404, error: `No engine declares capability "${capabilityName}"`, traceId: trace };
    }
    const client = engines[cap.engine];
    if (!client) {
      auditLog.log('route_engine_unconfigured', { capability: capabilityName, engine: cap.engine, traceId: trace });
      return { ok: false, status: 502, error: `Capability "${capabilityName}" belongs to "${cap.engine}", which hub has no client for`, traceId: trace };
    }
    try {
      const r = await client.call(cap.method, cap.path, { params, query, body });
      auditLog.log('route_called', { capability: capabilityName, engine: cap.engine, status: r.status, traceId: trace });
      return { ok: r.status >= 200 && r.status < 300, status: r.status, data: r.data, engine: cap.engine, traceId: trace };
    } catch (e) {
      auditLog.log('route_failed', { capability: capabilityName, engine: cap.engine, error: String(e.message || e).slice(0, 160), traceId: trace });
      return { ok: false, status: 502, error: `${cap.engine} did not respond: ${String(e.message || e)}`, traceId: trace };
    }
  }

  return { route, newTraceId };
}

module.exports = { createRouter, newTraceId };
