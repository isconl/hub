# sconl-space/lib/ai.sh
# AI integration scaffold for sconlx.
# In the current build this is entirely dormant — AI_ENABLED=0.
# When ready to activate: set AI_ENABLED=1, configure AI_ENDPOINT and AI_MODEL,
# and implement the stubs below. The rest of the codebase calls _db_hook()
# after every significant write — this file handles those calls.
#
# Design intent: the AI layer is additive. It reads the same flat files the CLI
# writes, so it can understand context without any schema migration. When active
# it can: suggest tasks, surface patterns in reflections and journal entries,
# flag drifting goals, generate development questions for ideas, and summarize
# learning highlights. All reads; no AI writes to data without user confirmation.
#
# ─────────────────────────────────────────────────────────────────────────────
# CHANGELOG
# ─────────────────────────────────────────────────────────────────────────────
#   v0.1.0 — Scaffold only. All stubs. AI_ENABLED=0. No external calls made.
#             Hook registry, context builder, and suggestion stubs in place.
# ─────────────────────────────────────────────────────────────────────────────

[[ -n "${_AI_LOADED:-}" ]] && return 0
_AI_LOADED=1

# ─────────────────────────────────────────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────────────────────────────────────────

# ── AI feature gate — flip to 1 to enable ──
AI_ENABLED=0

# ── Model and endpoint — configure before enabling ──
AI_ENDPOINT=""           # e.g. "https://api.anthropic.com/v1/messages"
AI_MODEL="claude-sonnet-4-20250514"
AI_MAX_TOKENS=1024
AI_TIMEOUT=10            # seconds — CLI must stay fast; never block

# ── Context limits — how much data to include in prompts ──
AI_TASKS_LIMIT=20        # most recent tasks for context
AI_GOALS_LIMIT=10        # active goals
AI_JOURNAL_LIMIT=5       # most recent journal entries (word-count only in context)
AI_IDEAS_LIMIT=15        # active idea pipeline

# ── Cache ──
AI_CACHE_DIR="${_ISCONL_DATA_DIR:-$HOME/.local/share/isconl}/.ai_cache"
AI_CACHE_TTL=3600        # seconds — suggestions expire after 1 hour

# ─────────────────────────────────────────────────────────────────────────────
# HOOK DISPATCHER
# Called by _db_hook() after every significant data mutation.
# hook_name matches the event bus event types (scope.task.completed, etc.)
# ─────────────────────────────────────────────────────────────────────────────

_ai_hook() {
  local hook_name="$1" payload="${2:-{}}"
  [[ "$AI_ENABLED" == "1" ]] || return 0

  case "$hook_name" in
    task.added)           _ai_on_task_added    "$payload" ;;
    task.done)            _ai_on_task_done     "$payload" ;;
    goal.kpi_updated)     _ai_on_goal_updated  "$payload" ;;
    reflect.saved)        _ai_on_reflect_saved "$payload" ;;
    idea.captured)        _ai_on_idea_captured "$payload" ;;
    idea.developed)       _ai_on_idea_developed "$payload" ;;
    learn.completed)      _ai_on_learn_done    "$payload" ;;
    inbox.captured)       _ai_on_capture       "$payload" ;;
    *)                    return 0 ;;
  esac
}

# ─────────────────────────────────────────────────────────────────────────────
# HOOK IMPLEMENTATIONS (stubs — implement when AI_ENABLED=1)
# ─────────────────────────────────────────────────────────────────────────────

_ai_on_task_added() {
  # When a task is added: optionally suggest related goals or break-down steps.
  # Stub — no-op.
  return 0
}

_ai_on_task_done() {
  # When a task is completed: optionally update goal KPI estimate.
  # Stub — no-op.
  return 0
}

_ai_on_goal_updated() {
  # When a goal KPI is logged: optionally forecast completion date.
  # Stub — no-op.
  return 0
}

_ai_on_reflect_saved() {
  # When a reflection is saved: optionally generate a journal expansion seed.
  # This is the most valuable hook — reflection patterns over time become a
  # rich dataset for understanding blockers, mood cycles, and energy patterns.
  # Stub — no-op.
  return 0
}

_ai_on_idea_captured() {
  # When an idea is captured: optionally suggest which Idea Type it is,
  # or check if a similar idea already exists in the pipeline.
  # Stub — no-op.
  return 0
}

_ai_on_idea_developed() {
  # When development questions are answered: optionally suggest next questions
  # or flag the idea for export to Scope/Space.
  # Stub — no-op.
  return 0
}

_ai_on_learn_done() {
  # When a learning resource is completed: suggest synthesis questions
  # tailored to the resource type and any highlights saved.
  # Stub — no-op.
  return 0
}

_ai_on_capture() {
  # When something hits the inbox: optionally auto-categorize it.
  # Stub — no-op.
  return 0
}

# ─────────────────────────────────────────────────────────────────────────────
# CONTEXT BUILDER
# Serializes current iSconl state to a JSON string for inclusion in AI prompts.
# Designed to stay under AI_MAX_TOKENS context budget.
# ─────────────────────────────────────────────────────────────────────────────

_ai_context_build() {
  # Returns a JSON object with the current state of all three systems.
  # Called before any AI prompt to give the model grounding context.
  # Stub — returns minimal placeholder.
  [[ "$AI_ENABLED" == "1" ]] || return 0

  python3 - << PYEOF
import json, os

# These paths are set by db.sh before ai.sh is sourced
flat_dir = os.environ.get("_FLAT_DIR", "")

def read_tsv(path, limit=20):
    rows = []
    try:
        with open(path) as f:
            lines = f.readlines()
        headers = lines[0].strip().split('\t') if lines else []
        for line in lines[1:limit+1]:
            if line.strip():
                vals = line.strip().split('\t')
                rows.append(dict(zip(headers, vals)))
    except:
        pass
    return rows

ctx = {
    "generated_at": "",
    "scope": {
        "tasks_today": read_tsv(f"{flat_dir}/scope/tasks.tsv", 20),
        "goals_active": [],
        "reflections_recent": [],
        "inbox_count": 0,
    },
    "space": {
        "spaces": read_tsv(f"{flat_dir}/space/spaces.tsv", 10),
    },
    "spark": {
        "ideas_pipeline": read_tsv(f"{flat_dir}/spark/ideas.tsv", 15),
        "learning_active": [],
    }
}

print(json.dumps(ctx, indent=2))
PYEOF
}

# ─────────────────────────────────────────────────────────────────────────────
# SUGGESTION STUBS
# These will return AI-generated suggestions when enabled.
# In stub mode they return empty string — callers treat empty as "no suggestion".
# ─────────────────────────────────────────────────────────────────────────────

# Suggest tasks for today based on goals and recent activity.
_ai_suggest_tasks() {
  [[ "$AI_ENABLED" == "1" ]] || { printf ''; return 0; }
  # Stub — implement: build context, call AI_ENDPOINT, parse response
  printf ''
}

# Analyze reflection patterns and return a summary insight.
_ai_reflect_insight() {
  [[ "$AI_ENABLED" == "1" ]] || { printf ''; return 0; }
  # Stub
  printf ''
}

# Given an idea title, return development questions.
_ai_idea_questions() {
  local idea_title="$1"
  [[ "$AI_ENABLED" == "1" ]] || { printf ''; return 0; }
  # Stub
  printf ''
}

# Summarize learning highlights into a synthesis seed.
_ai_learning_synthesis() {
  local item_id="$1"
  [[ "$AI_ENABLED" == "1" ]] || { printf ''; return 0; }
  # Stub
  printf ''
}

# ─────────────────────────────────────────────────────────────────────────────
# CACHE HELPERS (for when AI is enabled — avoids re-calling for same context)
# ─────────────────────────────────────────────────────────────────────────────

_ai_cache_get() {
  local key="$1"
  [[ "$AI_ENABLED" == "1" ]] || return 1
  local cache_file="$AI_CACHE_DIR/${key}.json"
  [[ -f "$cache_file" ]] || return 1
  # Check TTL
  local age
  age=$(( $(date +%s) - $(date -r "$cache_file" +%s 2>/dev/null || echo 0) ))
  [[ $age -lt $AI_CACHE_TTL ]] || return 1
  cat "$cache_file"
}

_ai_cache_set() {
  local key="$1" value="$2"
  [[ "$AI_ENABLED" == "1" ]] || return 0
  mkdir -p "$AI_CACHE_DIR"
  printf '%s' "$value" > "$AI_CACHE_DIR/${key}.json"
}

_ai_cache_clear() {
  [[ -d "$AI_CACHE_DIR" ]] && rm -rf "$AI_CACHE_DIR"/* 2>/dev/null || true
}