'use strict';
/**
 * Render API client -- this is hub's "update power" over the other engines
 * (owner's explicit requirement 2026-08-09: hub must be able to not just
 * CALL the engines but UPDATE/redeploy them too, not just consume their
 * APIs). New code, not an extraction -- no prior session built reusable
 * Render tooling, only ad-hoc verification scripts (see the portfolio
 * index's EVENTUAL list).
 *
 * Deliberately narrow: list services, find one by name, trigger a deploy,
 * check a deploy's status. Not a general Render SDK -- just what hub needs
 * to redeploy an engine after pushing its dev branch.
 */

const https = require('https');

function httpsRequest(options, postData) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, data }); }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('timeout')); });
    if (postData) req.write(postData);
    req.end();
  });
}

function createRenderClient({ getApiKey, auditLog = { log: () => {} } }) {
  if (!getApiKey) throw new Error('createRenderClient requires getApiKey');

  async function api(method, path, body) {
    const key = getApiKey();
    if (!key) return { status: 0, data: null, error: 'RENDER_API_KEY not configured' };
    const res = await httpsRequest({
      hostname: 'api.render.com', path: `/v1${path}`, method,
      headers: { Authorization: `Bearer ${key}`, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    }, body ? JSON.stringify(body) : null);
    return res;
  }

  async function listServices() {
    const r = await api('GET', '/services?limit=100');
    if (r.status !== 200 || !Array.isArray(r.data)) return [];
    return r.data.map(entry => entry.service).filter(Boolean);
  }

  async function findServiceByName(name) {
    const services = await listServices();
    return services.find(s => s.name === name) || null;
  }

  /** Trigger a new deploy for a service -- Render pulls the configured branch's latest commit. */
  async function triggerDeploy(serviceId, { clearCache = false } = {}) {
    const r = await api('POST', `/services/${encodeURIComponent(serviceId)}/deploys`, clearCache ? { clearCache: 'clear' } : {});
    const ok = r.status >= 200 && r.status < 300;
    auditLog.log('render_deploy_triggered', { serviceId, ok, status: r.status });
    if (!ok) return { ok: false, error: r.data?.message || `HTTP ${r.status}` };
    return { ok: true, deployId: r.data?.id || null, status: r.data?.status || null };
  }

  async function getDeploy(serviceId, deployId) {
    const r = await api('GET', `/services/${encodeURIComponent(serviceId)}/deploys/${encodeURIComponent(deployId)}`);
    if (r.status !== 200) return null;
    return { id: r.data.id, status: r.data.status, finishedAt: r.data.finishedAt || null };
  }

  return { listServices, findServiceByName, triggerDeploy, getDeploy };
}

module.exports = { createRenderClient };
