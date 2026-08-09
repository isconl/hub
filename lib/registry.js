'use strict';
/**
 * The capability registry: hub's map of "which engine can do X". Ported
 * from Decision 003's design (canvas), not from server.js -- hub is new
 * code, not an extraction.
 *
 * Each engine already declares its own capabilities via lib/manifest.js
 * (vault/pulse/scope/circle/spark all ship one, following the exact same
 * shape). The registry's only job is to ask each configured engine what it
 * can do, merge the answers into one lookup table, and keep it fresh --
 * this IS the lightweight MCP-tool-list-registry Decision 003 described,
 * not a placeholder for it.
 *
 * An engine that's down is not fatal: its capabilities just drop out of
 * the merged table (reported in `down`) until the next refresh finds it
 * again. A hub that hard-fails because one spoke is offline defeats the
 * point of having five independent engines instead of one monolith.
 */

function createRegistry({ engines, ttlMs = 30000, auditLog = { log: () => {} } }) {
  if (!engines || !Object.keys(engines).length) throw new Error('createRegistry requires at least one engine client');

  let cache = { at: 0, capabilities: new Map(), down: [] };

  async function refresh({ force = false } = {}) {
    if (!force && cache.at && Date.now() - cache.at < ttlMs) return cache;

    const capabilities = new Map();
    const down = [];
    await Promise.all(Object.entries(engines).map(async ([name, client]) => {
      try {
        const m = await client.manifest();
        for (const cap of m.capabilities || []) {
          if (capabilities.has(cap.name)) {
            auditLog.log('registry_capability_collision', { name: cap.name, owners: [capabilities.get(cap.name).engine, name] });
          }
          capabilities.set(cap.name, { ...cap, engine: name });
        }
      } catch (e) {
        down.push({ engine: name, error: String(e.message || e).slice(0, 160) });
      }
    }));

    cache = { at: Date.now(), capabilities, down };
    auditLog.log('registry_refreshed', { capabilities: capabilities.size, down: down.map(d => d.engine) });
    return cache;
  }

  async function find(capabilityName) {
    const { capabilities } = await refresh();
    return capabilities.get(capabilityName) || null;
  }

  async function list() {
    const { capabilities, down } = await refresh();
    return { capabilities: [...capabilities.values()], down, engines: Object.keys(engines) };
  }

  async function healthAll() {
    const results = await Promise.all(Object.entries(engines).map(async ([name, client]) => ({ engine: name, up: await client.health() })));
    return results;
  }

  return { refresh, find, list, healthAll, engines };
}

module.exports = { createRegistry };
