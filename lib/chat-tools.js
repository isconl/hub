'use strict';
/**
 * Chat tool-calling capability boundary (BI26091505).
 *
 * "Which capabilities chat may invoke, and what it must never touch" --
 * the one thing the row's own predecessor left unspecified. The policy is
 * ALLOWLIST, deny-by-default: a capability is callable by chat only by
 * appearing in TIER1_READ or TIER2_WRITE below. A deny-list was
 * explicitly rejected (per the row) because every capability added to any
 * engine in future would be automatically callable by chat until someone
 * remembered to exclude it -- a standing invitation to the exact accident
 * this boundary exists to prevent.
 *
 * Three tiers:
 *   - Tier 1 (TIER1_READ): read-only, callable with no confirmation.
 *   - Tier 2 (TIER2_WRITE): mutating, callable but gated -- the caller
 *     (hub's /api/chat) must run the same needsConfirmation round trip
 *     /api/act already implements, never execute silently.
 *   - Tier 3 (everything else, PLUS an unconditional ops-prefix/secret/auth
 *     deny-list checked FIRST): not reachable at all. This is not "confirm
 *     harder" -- a confirmation gate protects against a model doing the
 *     wrong thing by accident; it does not protect against a model being
 *     talked into the right-looking wrong thing, and ops's destroy
 *     endpoint has no safe failure mode. It must never be in chat's tool
 *     list, so no prompt can reach it.
 *
 * The deny check runs even against TIER1_READ/TIER2_WRITE themselves --
 * defense in depth, so a future edit that accidentally adds an ops.* name
 * to either tier list still can't reach it. This mirrors ops's own
 * design: the argv shape stays fixed-narrow regardless of what widens
 * around it (BI26091501's own reasoning, same principle applied one
 * layer up).
 */

// Capability-name patterns that are NEVER callable by chat, checked
// before either tier list, unconditionally. `ops.*` is a hard exclusion
// per the row ("the entire ops.* surface -- restart, stop, deploy, and
// above all destroy"), not case-by-case gating.
const DENY_PATTERNS = [
  /^ops\./i,
  /secret/i,
  /^auth\./i,
  /\bpassword\b/i,
  /\btoken\b/i,
];

function isDenied(name) {
  return DENY_PATTERNS.some(re => re.test(String(name || '')));
}

// Tier 1 -- readable, allowed, no confirmation. Verified against the live
// registry at the time this row was built (15 Sep 2026) -- every name
// below is a real capability some engine actually declares, not a guess.
// Flagged, not buried, per the row's own instruction: this list is this
// session's specification, not Sconl's explicit sign-off -- narrowing or
// widening it is his call, and doing so is cheap (one array edit, nothing
// downstream assumes a fixed set).
const TIER1_READ = [
  'tasks.list', 'tasks.get', 'tasks.session.list',
  'decisions.list',
  'jira.issue', 'jira.issues', 'jira.comments', 'jira.projects', 'jira.assignable',
  'corporate.overview', 'corporate.detail',
  'calendar.events.list',
  'github.snapshot', 'github.contributions',
  'surfacedTasks.list',
];

// Tier 2 -- mutating, allowed but gated. Every one of these already has a
// real, working write path; chat reaching it must go through the same
// confirm round trip /api/act uses, never a blanket "yes to everything in
// this turn."
const TIER2_WRITE = [
  'tasks.create', 'tasks.update', 'tasks.complete', 'tasks.delete',
  'tasks.session.start', 'tasks.session.stop',
  'decisions.update',
  'calendar.events.add', 'calendar.events.delete',
  'surfacedTasks.add', 'surfacedTasks.update',
];

/** Returns 1, 2, or null (not callable at all). Deny check always wins. */
function chatCapabilityTier(name) {
  if (isDenied(name)) return null;
  if (TIER1_READ.includes(name)) return 1;
  if (TIER2_WRITE.includes(name)) return 2;
  return null;
}

/**
 * Builds Groq/OpenAI-shaped tool definitions from the registry's live
 * capability list, filtered to the allowlist above. `liveCapabilities` is
 * `registry.list()`'s `.capabilities` array (real capability objects, so a
 * capability that's allowlisted here but not actually live right now is
 * correctly excluded rather than offered as callable). Parameters are
 * deliberately generic (`query`/`body`/`params` passthrough objects) --
 * no engine's manifest declares a typed JSON-schema shape per capability
 * today, and inventing one per capability is a separate, larger piece of
 * work this row doesn't ask for.
 */
function buildChatTools(liveCapabilities) {
  return (liveCapabilities || [])
    .filter(cap => chatCapabilityTier(cap.name) !== null)
    .map(cap => ({
      type: 'function',
      function: {
        name: cap.name,
        description: cap.description || '',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'object', description: 'Query-string parameters, if this capability reads any.' },
            body: { type: 'object', description: 'Request-body fields, if this capability writes any.' },
            params: { type: 'object', description: 'Path parameters, if this capability\'s route has any (e.g. :id).' },
          },
        },
      },
    }));
}

const MAX_TOOL_ROUNDS = 4;

/**
 * The agentic loop, injectable so it's testable without a real HTTP call
 * or a real model: `chatFn(messages)` -> `{content, toolCalls}` (spark's
 * /ai/chat with tools, already wired); `routeFn(name, args)` -> whatever
 * hub's router.route(name, {params, query, body}) already returns.
 *
 * Tier 1 calls execute immediately and the loop continues (feeding the
 * tool's result back to the model) so a multi-step read ("list my tasks,
 * then tell me which are overdue") can resolve in one turn. Tier 2 calls
 * STOP the loop immediately and return needsConfirmation -- same shape
 * spark's /act already uses (`{needsConfirmation, plan, describe}`) --
 * without executing, exactly mirroring that pattern rather than
 * inventing a second confirmation shape for chat specifically. A denied
 * (tier null) call is refused and fed back to the model as a tool error,
 * never executed, never silently dropped -- the model gets a chance to
 * recover (apologize, try something else) rather than the turn just
 * dying.
 */
// `onEvent(name, data)` is optional (BI26091901) -- a caller that wants to
// stream progress (hub's SSE /api/chat/stream) passes one; the plain
// non-streaming /api/chat passes none and behaves exactly as before, since
// every call site below is guarded. This keeps the loop the single source
// of truth for tool-call semantics instead of duplicating it per transport.
async function runChatTurn({ messages, tools, chatFn, routeFn, onEvent }) {
  const emit = (name, data) => { if (onEvent) onEvent(name, data); };
  const history = messages.slice();
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const { content, toolCalls } = await chatFn(history, tools);
    if (!toolCalls || !toolCalls.length) return { response: content, captured: [] };

    for (const call of toolCalls) {
      const tier = chatCapabilityTier(call.name);
      if (tier === null) {
        history.push({ role: 'assistant', content: null, tool_calls: [{ id: call.id, type: 'function', function: { name: call.name, arguments: JSON.stringify(call.args || {}) } }] });
        history.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify({ error: `"${call.name}" is not a capability chat is allowed to call` }) });
        continue;
      }
      if (tier === 2) {
        const toolCall = { name: call.name, args: call.args || {} };
        const describe = `${call.name}(${JSON.stringify(call.args || {})})`;
        emit('confirmation-needed', { toolCall, describe });
        return { needsConfirmation: true, toolCall, describe };
      }
      // Tier 1: execute now, feed the result back, keep going.
      emit('tool-call', { name: call.name, args: call.args || {} });
      let result;
      try { result = await routeFn(call.name, call.args || {}); }
      catch (e) { result = { ok: false, error: String(e.message || e) }; }
      emit('tool-result', { name: call.name, result });
      history.push({ role: 'assistant', content: null, tool_calls: [{ id: call.id, type: 'function', function: { name: call.name, arguments: JSON.stringify(call.args || {}) } }] });
      history.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }
  return { response: null, captured: [], error: 'too many tool-call rounds without a final answer' };
}

/**
 * Executes a previously-confirmed Tier 2 tool call directly -- the
 * client's "Do it" round trip, mirroring spark's /act `confirm: true`
 * re-call exactly (the client sends back the same {name, args} this
 * module returned as `toolCall` in `needsConfirmation`, not free-form
 * input). Still re-checks the tier server-side before executing --
 * never trusts a client-supplied tier, same defense-in-depth reasoning
 * as everywhere else in this file.
 */
async function executeConfirmedToolCall({ name, args }, routeFn) {
  const tier = chatCapabilityTier(name);
  if (tier !== 2) return { ok: false, error: `"${name}" is not a confirmable chat capability` };
  return routeFn(name, args || {});
}

module.exports = {
  TIER1_READ, TIER2_WRITE, isDenied, chatCapabilityTier, buildChatTools,
  runChatTurn, executeConfirmedToolCall,
};
