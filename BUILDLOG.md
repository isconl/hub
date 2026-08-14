# BUILDLOG - hub

Per `_handoff/MIGRATION-BRIEF.md` section 3.3. Append after every work block:
what changed, why, what's next, open questions. Status words: DONE / PARTIAL /
BLOCKED only.

---

## 2026-08-14 - api-compat.js: fixed a stale "dead end" inventory

**WHAT:** `ROUTES` originally marked five paths `gap: true` (`/api/teams`,
`/api/ingest/sms`, `/api/finance/messages/commit`, `/api/learning/manifest`,
`/api/learning/narrate`), claiming they exist on neither legacy nor any new
engine. All five are now `legacy: true`.

**WHY:** the original inventory (2026-08-09) diffed the app branch against
legacy's `main` server.js only. Verified 2026-08-14 by grepping legacy's `dev`
branch directly: all five routes are implemented there (`/api/teams` shipped
8 Aug, commit `a81a245`; the other four were already present). `main` was
never the right branch to diff against once `dev` pulled ahead.

**HOW IT DIFFERS:** no route ownership changed hands, no engine gained a
capability - this only stops hub 501ing five requests that legacy can already
serve correctly. Real migration (moving these to `capability:` entries owned
by an engine, per MIGRATION-BRIEF.md section 7) is separate, future work.

**STATE:** DONE - the five routes now proxy to legacy instead of 501ing.
Not yet restarted in this session's running hub process as of this entry;
restart picks it up, no data migration involved.

**NEXT:** see `_handoff/migration-log.md` for the full session record and the
Phase 1-6 queue this sits inside.

Added this session, not logged separately: `scripts/dev-local.sh` - a
plain-node fleet launcher for machines with no Docker (this Windows box).
Mirrors `docker-compose.yml`'s env wiring; boots all six engines as local
node processes with correct inter-engine URLs and Bitwarden secrets.
