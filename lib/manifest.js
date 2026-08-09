'use strict';
/**
 * hub's own capability manifest -- same shape as every spoke engine's, for
 * consistency, even though hub's job is mostly forwarding. GET /manifest
 * here returns the AGGREGATED view (hub's own + every spoke's); this is
 * just hub's own declared surface.
 */
module.exports = {
  engine: 'hub',
  version: require('../package.json').version,
  description: 'Orchestrator: single entry point, aggregated capability registry, deterministic routing, deploy control over vault/pulse/scope/circle/spark.',
  capabilities: [
    { name: 'hub.manifest', method: 'GET', path: '/manifest', description: 'The aggregated capability list across every configured engine.' },
    { name: 'hub.engines', method: 'GET', path: '/engines', description: 'Per-engine up/down health.' },
    { name: 'hub.call', method: 'POST', path: '/call', description: 'Deterministic routing: {capability, params, query, body} -> forwarded to the owning engine.' },
    { name: 'hub.act', method: 'POST', path: '/act', description: 'Proxies to spark\'s /act (chat/NLU action parsing+execution).' },
    { name: 'hub.deploy', method: 'POST', path: '/deploy/:engine', description: 'Trigger a Render redeploy for a named engine -- hub\'s update power, not just call power.' },
  ],
};
