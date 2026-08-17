# iSconl Incident Register
<!-- LIVE DOCUMENT — every resolved system incident is recorded here permanently -->
<!-- Last updated: 2026-08-17T03:41 EAT (Antigravity) -->

The purpose of this file is to ensure no incident repeats. Each entry names the root cause(s),
the exact fix(es) applied, and the standing guard put in place afterward.

---

## INC-001 · PIN Login Disabled After Vault Restart
**Date:** 2026-08-17  
**Severity:** High — user locked out of hub entirely  
**Duration:** ~40 min (03:00–03:40 EAT)  
**Status:** ✅ Resolved

### What happened
User reported being logged out and unable to log back in with PIN. The hub login screen
showed no PIN option. `/auth/methods` returned `{"totp":false,"pin":false}`.

### Root cause (two contributing failures)

#### Failure A — `blocks.js` regex crash (primary)
`vault/lib/blocks.js:classify()` constructed a `RegExp` from raw `NAME` values in `people.tsv`
without escaping. When the people roster was expanded to 859 contacts (Google Contacts import,
2026-08-17), some rows had phone numbers as their first token — e.g. `+254702839366`. The `+`
character is a regex quantifier (one-or-more). Node threw:

```
SyntaxError: Invalid regular expression: /\b+254702839366\b/: Nothing to repeat
```

This crashed the vault process mid-request. The crash happened inside the request handler, not
at boot, so the vault came back up (nohup respawn) but the *next* process spawned without the
BWS token (see Failure B).

#### Failure B — BWS_ACCESS_TOKEN not persistent across restarts (secondary)
`dev-local.sh` loaded `~/.bashrc.d/bitwarden.sh` to pick up `BWS_ACCESS_TOKEN`, but when a
sub-process or restarted vault was spawned, that shell profile was not re-sourced. The `.env`
file had `BWS_ACCESS_TOKEN=` (blank), so `secrets.js` returned `source: none, count: 0`.
With the secret cache empty, `PIN_HASH` resolved to `''`, which `auth.js` interprets as
PIN not configured → `pin: false` in `/auth/methods`.

### Fix applied

**1. `vault/lib/blocks.js` — escape regex metacharacters before `new RegExp()`**

```diff
-  const named = people.filter(p => {
-    const n = clean(val(p.NAME)).split(/\s+/)[0];
-    return n && n.length > 2 && new RegExp(`\\b${n.toLowerCase()}\\b`).test(title);
-  }).map(p => clean(val(p.NAME)).split(/\s+/)[0]);
+  const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
+  const named = people.filter(p => {
+    const n = clean(val(p.NAME)).split(/\s+/)[0];
+    if (!n || n.length <= 2) return false;
+    try { return new RegExp(`\\b${escapeRegex(n.toLowerCase())}\\b`).test(title); }
+    catch { return false; }
+  }).map(p => clean(val(p.NAME)).split(/\s+/)[0]);
```

**2. `hub/scripts/dev-local.sh` — fallback token file + hard-fail guard**

A persistent token file `~/.isconl/bws-access-token` (chmod 600) is now checked if
`BWS_ACCESS_TOKEN` is unset after loading the shell profile. If it is still empty after that,
the script aborts with an explicit error instead of starting silently without auth.

```diff
+if [ -z "${BWS_ACCESS_TOKEN:-}" ] && [ -f "$HOME/.isconl/bws-access-token" ]; then
+  BWS_ACCESS_TOKEN="$(cat "$HOME/.isconl/bws-access-token")"
+  export BWS_ACCESS_TOKEN
+fi
+if [ -z "${BWS_ACCESS_TOKEN:-}" ]; then
+  echo "ERROR: BWS_ACCESS_TOKEN is not set…" >&2; exit 1
+fi
```

The token file was written: `echo -n "$TOKEN" > ~/.isconl/bws-access-token && chmod 600 ~/.isconl/bws-access-token`

**3. Vault restarted** with `setsid` + full credential environment. `auth/methods` confirmed `{"totp":true,"pin":true}`.

### Standing guards (do not remove)

| Guard | Location | What it prevents |
|-------|----------|------------------|
| `escapeRegex()` in classify() | `vault/lib/blocks.js:231` | Any NAME value with regex metacharacters (phone numbers, symbols) crashing vault |
| `try/catch` around `new RegExp()` | `vault/lib/blocks.js:233` | Belt-and-suspenders — even if escape misses a case, classify() never throws |
| `~/.isconl/bws-access-token` fallback | `hub/scripts/dev-local.sh:24` | Vault always boots with credentials regardless of shell-profile sourcing |
| Hard-fail if `BWS_ACCESS_TOKEN` empty | `hub/scripts/dev-local.sh:29` | Prevents silent no-auth starts — you see an error instead of a mysteriously broken login |

### Lesson
> Importing external data (Google Contacts) into fields used as regex patterns without escaping
> is a latent crash. **Any user-controlled string used in `new RegExp()` must be escaped first.**
> The `secrets.js` resolution chain is correct, but it depends on the token being present at
> process start — that dependency must be made explicit and boot-time-verified, not silently-optional.

---

*Add future incidents below in the same format.*
