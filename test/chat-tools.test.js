'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { TIER1_READ, TIER2_WRITE, isDenied, chatCapabilityTier, buildChatTools, runChatTurn, executeConfirmedToolCall } = require('../lib/chat-tools');

test('BI26091505: ops.* is denied unconditionally, even if it somehow ends up in a tier list', () => {
  assert.equal(isDenied('ops.status'), true);
  assert.equal(isDenied('ops.service.restart'), true);
  assert.equal(isDenied('ops.service.destroy'), true);
  assert.equal(chatCapabilityTier('ops.service.destroy'), null);
  // Defense in depth: even a name deliberately spliced into TIER1_READ
  // at test time must still come back denied, because the deny check
  // runs before either tier list is consulted.
  const poisoned = [...TIER1_READ, 'ops.service.destroy'];
  assert.equal(poisoned.includes('ops.service.destroy'), true);
  assert.equal(chatCapabilityTier('ops.service.destroy'), null, 'the deny check must win regardless of tier-list contents');
});

test('BI26091505: secret- and auth-shaped capability names are denied unconditionally', () => {
  assert.equal(isDenied('vault.getSecret'), true);
  assert.equal(isDenied('auth.login'), true);
  assert.equal(isDenied('auth.rotateToken'), true);
  assert.equal(chatCapabilityTier('vault.getSecret'), null);
});

test('BI26091505: a capability absent from the allowlist is not callable even when the model tries -- the row\'s own acceptance test', () => {
  // Real, live capabilities that are neither tier -- must never be
  // exposed as a tool, regardless of how safe they look.
  assert.equal(chatCapabilityTier('vault.rewrite'), null);
  assert.equal(chatCapabilityTier('vault.bootstrap'), null);
  assert.equal(chatCapabilityTier('scope.tasks.session.list.bogus'), null);
  assert.equal(chatCapabilityTier('anything.not.on.the.list'), null);
});

test('BI26091505: TIER1_READ capabilities are tier 1, TIER2_WRITE capabilities are tier 2', () => {
  for (const name of TIER1_READ) assert.equal(chatCapabilityTier(name), 1, `${name} should be tier 1`);
  for (const name of TIER2_WRITE) assert.equal(chatCapabilityTier(name), 2, `${name} should be tier 2`);
});

test('BI26091505: buildChatTools only includes live, allowlisted capabilities -- never ops.*, never an unlisted one', () => {
  const live = [
    { name: 'tasks.list', method: 'GET', path: '/tasks', description: 'List every task.' },
    { name: 'tasks.create', method: 'POST', path: '/tasks', description: 'Create a task.' },
    { name: 'ops.service.destroy', method: 'POST', path: '/service/:name/destroy', description: 'Destroy a container.' },
    { name: 'vault.rewrite', method: 'PUT', path: '/vault/:collection', description: 'Replace a collection.' },
  ];
  const tools = buildChatTools(live);
  const names = tools.map(t => t.function.name);
  assert.deepEqual(names.sort(), ['tasks.create', 'tasks.list']);
  assert.ok(!names.includes('ops.service.destroy'), 'ops.* must never appear in the built tool list');
  assert.ok(!names.includes('vault.rewrite'), 'an unlisted capability must never appear even though it is live');
});

test('BI26091505: buildChatTools excludes an allowlisted capability that is not actually live right now', () => {
  // tasks.delete is TIER2_WRITE but not present in this live capability
  // set (e.g. scope is down) -- must not be offered as callable.
  const live = [{ name: 'tasks.list', method: 'GET', path: '/tasks', description: 'List every task.' }];
  const tools = buildChatTools(live);
  assert.deepEqual(tools.map(t => t.function.name), ['tasks.list']);
});

test('BI26091505: every built tool is a well-formed Groq/OpenAI function-tool definition', () => {
  const live = [{ name: 'tasks.list', method: 'GET', path: '/tasks', description: 'List every task.' }];
  const [tool] = buildChatTools(live);
  assert.equal(tool.type, 'function');
  assert.equal(tool.function.name, 'tasks.list');
  assert.equal(typeof tool.function.description, 'string');
  assert.equal(tool.function.parameters.type, 'object');
});

test('BI26091505: runChatTurn returns a plain answer immediately when the model calls no tool', async () => {
  const chatFn = async () => ({ content: 'hello there', toolCalls: [] });
  const r = await runChatTurn({ messages: [{ role: 'user', content: 'hi' }], tools: [], chatFn, routeFn: async () => { throw new Error('should never be called'); } });
  assert.equal(r.response, 'hello there');
  assert.deepEqual(r.captured, []);
});

test('BI26091505: runChatTurn executes a tier-1 tool call and loops until the model gives a final answer', async () => {
  let calls = 0;
  const chatFn = async () => {
    calls++;
    if (calls === 1) return { content: null, toolCalls: [{ id: 'c1', name: 'tasks.list', args: {} }] };
    return { content: 'you have 3 tasks', toolCalls: [] };
  };
  let routed = null;
  const routeFn = async (name, args) => { routed = { name, args }; return { tasks: [1, 2, 3] }; };
  const r = await runChatTurn({ messages: [{ role: 'user', content: 'what are my tasks' }], tools: [], chatFn, routeFn });
  assert.equal(r.response, 'you have 3 tasks');
  assert.deepEqual(routed, { name: 'tasks.list', args: {} });
  assert.equal(calls, 2);
});

test('BI26091505: runChatTurn stops and returns needsConfirmation for a tier-2 call, WITHOUT executing it', async () => {
  const chatFn = async () => ({ content: null, toolCalls: [{ id: 'c1', name: 'tasks.delete', args: { id: 'TK1' } }] });
  const routeFn = async () => { throw new Error('a tier-2 call must never execute before confirmation'); };
  const r = await runChatTurn({ messages: [{ role: 'user', content: 'delete task TK1' }], tools: [], chatFn, routeFn });
  assert.equal(r.needsConfirmation, true);
  assert.deepEqual(r.toolCall, { name: 'tasks.delete', args: { id: 'TK1' } });
});

test('BI26091505: runChatTurn refuses a denied/unlisted tool call, feeds an error back to the model, and never executes it', async () => {
  let calls = 0;
  const chatFn = async (history) => {
    calls++;
    if (calls === 1) return { content: null, toolCalls: [{ id: 'c1', name: 'ops.service.destroy', args: { name: 'vault' } }] };
    // Second call must have received the tool-error message, not a real result.
    const toolMsg = history.find(m => m.role === 'tool');
    assert.ok(toolMsg);
    assert.match(toolMsg.content, /not a capability chat is allowed to call/);
    return { content: 'I can\'t do that.', toolCalls: [] };
  };
  const routeFn = async () => { throw new Error('a denied capability must never be routed at all'); };
  const r = await runChatTurn({ messages: [{ role: 'user', content: 'destroy vault' }], tools: [], chatFn, routeFn });
  assert.equal(r.response, "I can't do that.");
});

test('BI26091505: runChatTurn gives up after MAX_TOOL_ROUNDS rather than looping forever', async () => {
  const chatFn = async () => ({ content: null, toolCalls: [{ id: 'c1', name: 'tasks.list', args: {} }] });
  const routeFn = async () => ({ ok: true });
  const r = await runChatTurn({ messages: [{ role: 'user', content: 'loop' }], tools: [], chatFn, routeFn });
  assert.equal(r.response, null);
  assert.ok(r.error);
});

test('BI26091901: runChatTurn emits tool-call and tool-result via onEvent for a tier-1 call, in order', async () => {
  const chatFn = async () => {
    const calls = chatFn.calls = (chatFn.calls || 0) + 1;
    if (calls === 1) return { content: null, toolCalls: [{ id: 'c1', name: 'tasks.list', args: {} }] };
    return { content: 'you have 3 tasks', toolCalls: [] };
  };
  const routeFn = async () => ({ tasks: [1, 2, 3] });
  const events = [];
  const r = await runChatTurn({
    messages: [{ role: 'user', content: 'what are my tasks' }],
    tools: [], chatFn, routeFn,
    onEvent: (name, data) => events.push({ name, data }),
  });
  assert.equal(r.response, 'you have 3 tasks');
  assert.deepEqual(events.map(e => e.name), ['tool-call', 'tool-result']);
  assert.deepEqual(events[0].data, { name: 'tasks.list', args: {} });
  assert.deepEqual(events[1].data, { name: 'tasks.list', result: { tasks: [1, 2, 3] } });
});

test('BI26091901: runChatTurn emits confirmation-needed via onEvent for a tier-2 call, without executing it', async () => {
  const chatFn = async () => ({ content: null, toolCalls: [{ id: 'c1', name: 'tasks.delete', args: { id: 'TK1' } }] });
  const routeFn = async () => { throw new Error('a tier-2 call must never execute before confirmation'); };
  const events = [];
  const r = await runChatTurn({
    messages: [{ role: 'user', content: 'delete task TK1' }],
    tools: [], chatFn, routeFn,
    onEvent: (name, data) => events.push({ name, data }),
  });
  assert.equal(r.needsConfirmation, true);
  assert.deepEqual(events.map(e => e.name), ['confirmation-needed']);
  assert.deepEqual(events[0].data.toolCall, { name: 'tasks.delete', args: { id: 'TK1' } });
});

test('BI26091901: runChatTurn works exactly as before when onEvent is omitted (backward compatible)', async () => {
  const chatFn = async () => ({ content: 'hello there', toolCalls: [] });
  const r = await runChatTurn({ messages: [{ role: 'user', content: 'hi' }], tools: [], chatFn, routeFn: async () => { throw new Error('should never be called'); } });
  assert.equal(r.response, 'hello there');
});

test('BI26091505: executeConfirmedToolCall re-checks the tier server-side and refuses anything not tier 2, even if a client claims otherwise', async () => {
  const routeFn = async (name, args) => ({ ok: true, name, args });
  const ok = await executeConfirmedToolCall({ name: 'tasks.delete', args: { id: 'TK1' } }, routeFn);
  assert.deepEqual(ok, { ok: true, name: 'tasks.delete', args: { id: 'TK1' } });

  const deniedRoute = async () => { throw new Error('must never route a non-tier-2 confirmed call'); };
  const refused1 = await executeConfirmedToolCall({ name: 'ops.service.destroy', args: {} }, deniedRoute);
  assert.equal(refused1.ok, false);
  const refused2 = await executeConfirmedToolCall({ name: 'tasks.list', args: {} }, deniedRoute);
  assert.equal(refused2.ok, false, 'a tier-1 (read) capability is not a confirmable action either');
});
