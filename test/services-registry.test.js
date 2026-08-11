'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { list, SERVICES } = require('../lib/services-registry');

const ENGINE_NAMES = ['vault', 'pulse', 'scope', 'circle', 'spark', 'hub'];

test('every service has a name, kind, and provider', () => {
  for (const s of SERVICES) {
    assert.ok(s.name, `missing name: ${JSON.stringify(s)}`);
    assert.ok(['engine', 'app'].includes(s.kind), `bad kind for ${s.name}`);
    assert.ok(['oracle', 'render', 'planned'].includes(s.provider), `bad provider for ${s.name}`);
  }
});

test('no duplicate service names', () => {
  const names = SERVICES.map(s => s.name);
  assert.equal(new Set(names).size, names.length);
});

test('every render-provider service declares its Render service name', () => {
  for (const s of SERVICES.filter(s => s.provider === 'render')) {
    assert.ok(s.renderService, `${s.name} is provider:render but has no renderService`);
  }
});

test('all 6 isconl engines are present as kind:engine', () => {
  const engineNames = SERVICES.filter(s => s.kind === 'engine').map(s => s.name);
  for (const n of ENGINE_NAMES) assert.ok(engineNames.includes(n), `missing engine ${n}`);
  assert.equal(engineNames.length, ENGINE_NAMES.length);
});

test('list() returns copies, not the live array', () => {
  const a = list();
  a[0].name = 'mutated';
  assert.notEqual(SERVICES[0].name, 'mutated');
});
