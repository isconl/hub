'use strict';
/**
 * Update/deploy power over the other engines, built on lib/render.js.
 * Maps an engine name (vault/pulse/scope/circle/spark) to its Render
 * service, so a caller says "redeploy scope" rather than knowing Render
 * service ids. Per-engine Render service names are configuration (env),
 * not hardcoded -- genericization discipline applies here too.
 */

function createDeployClient({ render, serviceNameFor, auditLog = { log: () => {} } }) {
  if (!render) throw new Error('createDeployClient requires render (a createRenderClient() instance)');
  if (!serviceNameFor) throw new Error('createDeployClient requires serviceNameFor (engine name -> Render service name)');

  async function redeploy(engineName, opts = {}) {
    const serviceName = serviceNameFor(engineName);
    if (!serviceName) return { ok: false, error: `No Render service configured for engine "${engineName}"` };
    const service = await render.findServiceByName(serviceName);
    if (!service) return { ok: false, error: `Render has no service named "${serviceName}"` };
    const r = await render.triggerDeploy(service.id, opts);
    auditLog.log('engine_redeploy_requested', { engine: engineName, service: serviceName, ok: r.ok });
    return { ...r, engine: engineName, service: serviceName, serviceId: service.id };
  }

  async function status(engineName, deployId) {
    const serviceName = serviceNameFor(engineName);
    if (!serviceName) return null;
    const service = await render.findServiceByName(serviceName);
    if (!service) return null;
    return render.getDeploy(service.id, deployId);
  }

  return { redeploy, status };
}

module.exports = { createDeployClient };
