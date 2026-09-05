'use strict';
/**
 * Chat thread persistence (BI26090505, split from FI26090501). Storage
 * lives in vault as one raw JSON collection (chat/threads.json), read
 * through the same GET/PUT /vault-raw/:collection wrapper the frontend's
 * File Manager and profile settings already use -- no new vault schema
 * declaration needed for a single JSON blob. spark's ai.chat.complete
 * capability explicitly leaves "caller owns conversation history/
 * threading" (its own manifest description), so that ownership sits here
 * in hub, not spark.
 *
 * Session-to-thread tracking: a single in-memory "current thread" value,
 * not a real per-session-token map -- this fleet is single-user with one
 * active webconsole tab in practice, so a module-level variable is the
 * honest v1 rather than inventing session-token infrastructure that
 * nothing else in hub has yet. Revisit if multi-tab use ever needs it.
 */

const COLLECTION = 'chat/threads.json';

function createChatThreadStore(vaultEngine) {
  let currentThreadId = null;

  async function readThreads() {
    const r = await vaultEngine.raw('GET', `/vault-raw/${encodeURIComponent(COLLECTION)}`);
    if (r.status !== 200) return {};
    try { return JSON.parse(r.data?.text || '{}') || {}; } catch { return {}; }
  }

  async function writeThreads(threads) {
    await vaultEngine.raw('PUT', `/vault-raw/${encodeURIComponent(COLLECTION)}`, { text: JSON.stringify(threads), force: true });
  }

  function newId() {
    return `t${Date.now()}${Math.floor(Math.random() * 1000)}`;
  }

  async function listThreads() {
    const threads = await readThreads();
    const list = Object.values(threads)
      .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
      .map(t => ({ ID: t.id, TITLE: t.title || 'New conversation', UPDATED_AT: t.updatedAt, COUNT: String((t.messages || []).length) }));
    return { threads: list, current: currentThreadId };
  }

  async function newThread() {
    const threads = await readThreads();
    const id = newId();
    threads[id] = { id, title: 'New conversation', updatedAt: new Date().toISOString(), messages: [] };
    await writeThreads(threads);
    currentThreadId = id;
    return { success: true, id };
  }

  async function openThread(id) {
    const threads = await readThreads();
    const t = threads[id];
    if (!t) return { success: false, error: 'Conversation not found' };
    currentThreadId = id;
    return { success: true, messages: t.messages || [] };
  }

  async function deleteThread(id) {
    const threads = await readThreads();
    if (!threads[id]) return { success: false, error: 'Conversation not found' };
    delete threads[id];
    await writeThreads(threads);
    if (currentThreadId === id) currentThreadId = null;
    return { success: true };
  }

  // Appends one user/assistant turn to whichever thread is current,
  // auto-creating one (titled from the user's first message) if none is
  // open yet -- so plain single-turn chat keeps working with no explicit
  // "new thread" call required first.
  async function appendTurn(userText, assistantText) {
    const threads = await readThreads();
    if (!currentThreadId || !threads[currentThreadId]) {
      const id = newId();
      threads[id] = { id, title: userText.slice(0, 60) || 'New conversation', updatedAt: new Date().toISOString(), messages: [] };
      currentThreadId = id;
    }
    const t = threads[currentThreadId];
    if (!t.messages) t.messages = [];
    if (t.messages.length === 0 && userText) t.title = userText.slice(0, 60);
    t.messages.push({ role: 'user', content: userText });
    if (assistantText) t.messages.push({ role: 'assistant', content: assistantText });
    t.updatedAt = new Date().toISOString();
    await writeThreads(threads);
    return t.id;
  }

  return { listThreads, newThread, openThread, deleteThread, appendTurn };
}

module.exports = { createChatThreadStore };
