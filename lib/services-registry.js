'use strict';
/**
 * A read-only, data-driven catalogue of every service the owner runs --
 * not just the 5 spoke engines hub already calls/deploys via the env-driven
 * wiring in src/server.js (untouched here, still the auth-critical path).
 * This is deliberately additive: the descriptive layer a future "Services"
 * UI panel reads from. Replacing src/server.js's hardcoded engineDefs with
 * a fully data-driven registry (this becoming the single source of truth
 * for routing too, not just display) is real follow-on work, not done here
 * -- see the portfolio index's Decision 004 / current NOW block.
 */

const SERVICES = [
  { name: 'vault', kind: 'engine', provider: 'oracle', repo: 'isconl/vault' },
  { name: 'pulse', kind: 'engine', provider: 'oracle', repo: 'isconl/pulse' },
  { name: 'scope', kind: 'engine', provider: 'oracle', repo: 'isconl/scope' },
  { name: 'circle', kind: 'engine', provider: 'oracle', repo: 'isconl/circle' },
  { name: 'spark', kind: 'engine', provider: 'oracle', repo: 'isconl/spark' },
  { name: 'hub', kind: 'engine', provider: 'oracle', repo: 'isconl/hub' },
  { name: 'isconl-agent', kind: 'app', provider: 'render', renderService: 'isconl-agent',
    note: 'legacy monolith -- being retired as hub + the 5 engines take over' },
  { name: 'keyvanos', kind: 'app', provider: 'render', renderService: 'keyvanos' },
  { name: 'wabba-academy', kind: 'app', provider: 'render', renderService: 'wabba-academy' },
  { name: 'aria-course-engine', kind: 'app', provider: 'render', renderService: 'aria-course-engine' },
  { name: 'wellspring', kind: 'app', provider: 'planned' },
  { name: 'wellpath', kind: 'app', provider: 'planned' },
  { name: 'qspace-pages', kind: 'app', provider: 'planned' },
  { name: 'qspace-press', kind: 'app', provider: 'planned' },
];

function list() {
  return SERVICES.map(s => ({ ...s }));
}

module.exports = { list, SERVICES };
