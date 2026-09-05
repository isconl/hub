#!/usr/bin/env bash
# Boots the whole isconl fleet as plain node processes on localhost --
# the no-Docker equivalent of docker-compose.yml, for machines (like the
# Windows work box) that have no Docker available. Run from anywhere;
# assumes the standard sibling layout this repo already expects
# (../vault, ../pulse, ../scope, ../circle, ../spark next to hub).
#
# Secrets: BWS_ACCESS_TOKEN/BWS_ORGANIZATION_ID/BWS_API_URL/BWS_IDENTITY_URL
# must already be in the environment -- each engine pulls its own tokens
# from Bitwarden Secrets Manager at boot (lib/secrets.js), same as compose.
# BWS_PROJECT_ID too if you want write-back to work (vault's PIN reset,
# OAuth token rotation) -- read-only secret pulls work without it.
#
# Usage: ./scripts/dev-local.sh [start|stop|status]

set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"   # hub/
ROOT="$(cd "$HERE/.." && pwd)"                             # iSconl/
LOG_DIR="$HERE/scripts/.dev-logs"
# Load Bitwarden Secrets Manager bootstrap credentials if available
if [ -f "$HOME/.bashrc.d/bitwarden.sh" ]; then
  # shellcheck source=/dev/null
  source "$HOME/.bashrc.d/bitwarden.sh"
fi
# Fallback: persistent token file written by iSconl tooling (chmod 600).
# This ensures vault boots with credentials even in spawned sub-shells or
# post-restart scenarios where the shell profile has not been sourced.
# Incident 2026-08-17: vault restarted without this → secrets count=0 →
# PIN_HASH unresolved → /auth/methods returned pin:false → login impossible.
if [ -z "${BWS_ACCESS_TOKEN:-}" ] && [ -f "$HOME/.isconl/bws-access-token" ]; then
  BWS_ACCESS_TOKEN="$(cat "$HOME/.isconl/bws-access-token")"
  export BWS_ACCESS_TOKEN
fi
if [ -z "${BWS_ACCESS_TOKEN:-}" ]; then
  echo "ERROR: BWS_ACCESS_TOKEN is not set. Cannot start fleet — vault will boot without secrets, breaking PIN login." >&2
  echo "  Fix: set BWS_ACCESS_TOKEN in the environment, ~/.bashrc.d/bitwarden.sh, or ~/.isconl/bws-access-token" >&2
  exit 1
fi
export BWS_ORGANIZATION_ID="${BWS_ORGANIZATION_ID:-2d82abe1-cb42-45a0-b1cd-b438013b3f4b}"
export BWS_API_URL="${BWS_API_URL:-https://api.bitwarden.eu}"
export BWS_IDENTITY_URL="${BWS_IDENTITY_URL:-https://identity.bitwarden.eu}"
export BWS_PROJECT_ID="${BWS_PROJECT_ID:-ae96a9c3-5f66-48b7-96b2-b494009ff61b}"

PID_DIR="$HERE/scripts/.dev-pids"
mkdir -p "$LOG_DIR" "$PID_DIR"

# name:port:dir
SERVICES=(
  "vault:8081:vault"
  "pulse:8082:pulse"
  "scope:8083:scope"
  "circle:8084:circle"
  "spark:8085:spark"
  "media:8086:media"
  "ops:8087:ops"
  "hub:8888:hub"
  "tts:5001:vault/scripts/tts_service.py"
)

# FI26090403: local dev must always run each repo's `dev` branch, never
# whatever happens to be checked out -- see STANDING-RULES.md's "Branch
# workflow" section. Auto-switches a clean checkout to `dev`; only warns
# (never force-switches) if the repo has uncommitted tracked changes.
ensure_dev_branch() {
  local repo_dir="$1"
  [ -d "$ROOT/$repo_dir/.git" ] || return 0
  local cur
  cur="$(git -C "$ROOT/$repo_dir" branch --show-current 2>/dev/null)"
  [ "$cur" = "dev" ] && return 0
  if [ -n "$(git -C "$ROOT/$repo_dir" status --porcelain --untracked-files=no 2>/dev/null)" ]; then
    echo "WARNING: $repo_dir is on '$cur' with uncommitted tracked changes -- not auto-switching. Local dev should run 'dev' per standing policy (see STANDING-RULES.md)." >&2
    return 0
  fi
  echo "NOTICE: $repo_dir was on '$cur' -- switching to 'dev' (standing policy: local dev always runs 'dev')." >&2
  git -C "$ROOT/$repo_dir" checkout dev --quiet 2>/dev/null || echo "  could not checkout dev in $repo_dir" >&2
}

start_one() {
  local name="$1" port="$2" dir="$3"
  local pidfile="$PID_DIR/$name.pid"
  if [ -f "$pidfile" ] && kill -0 "$(cat "$pidfile")" 2>/dev/null; then
    echo "$name already running (pid $(cat "$pidfile"))"
    return
  fi
  if [ "$name" = "tts" ]; then
    ensure_dev_branch "vault"
  else
    ensure_dev_branch "$dir"
  fi
  (
    if [ "$name" = "tts" ]; then
      cd "$ROOT/vault"
      export TTS_BIND=127.0.0.1
      export TTS_PORT="$port"
      # `python3` on PATH is not always a real interpreter -- on Windows it's
      # often the Microsoft Store app-execution-alias stub, which exists on
      # PATH and passes `command -v` but exits non-zero (with an install nag)
      # on every invocation, including --version. Probe functionally and
      # fall back to `python` (found 28 Aug 2026, FI26082801).
      pybin=python3
      if ! python3 --version >/dev/null 2>&1; then
        if python --version >/dev/null 2>&1; then
          pybin=python
        fi
      fi
      if command -v setsid >/dev/null 2>&1; then
        setsid "$pybin" "$ROOT/$dir" </dev/null >"$LOG_DIR/$name.log" 2>&1 &
      else
        nohup "$pybin" "$ROOT/$dir" </dev/null >"$LOG_DIR/$name.log" 2>&1 &
      fi
    else
      cd "$ROOT/$dir"
      export "$(echo "${name^^}")_BIND"=127.0.0.1
      export "$(echo "${name^^}")_PORT"="$port"
      export VAULT_URL="http://127.0.0.1:8081"
      export PULSE_URL="http://127.0.0.1:8082"
      export SCOPE_URL="http://127.0.0.1:8083"
      export CIRCLE_URL="http://127.0.0.1:8084"
      export SPARK_URL="http://127.0.0.1:8085"
      export MEDIA_URL="http://127.0.0.1:8086"
      # FI26090402: vault (Gmail) and pulse (Calendar) both fan out one
      # client per label in this comma-separated list; unset it defaults
      # to a single 'default' label, leaving 5 of 6 connected accounts
      # unused even once their tokens are valid. Decided 4 Sep 2026, per
      # Sconl: list all 6.
      export GOOGLE_ACCOUNTS="${GOOGLE_ACCOUNTS:-ACE_BRAND,ACE_CLIENTS,ACE_DESIGN,FORMAL,PERSONAL,VIVA}"
      export OPS_URL="http://127.0.0.1:8087"
      if [ "$name" = "ops" ]; then
        # Bare-node dev-local.sh has no docker-compose deployment for ops
        # to control -- point it at the local dev docker-compose.yml
        # anyway (so `docker compose ...` calls resolve to something real
        # if the reader also happens to have that stack up in Docker), but
        # this mode is really ops's secondary target; see docker-compose.yml/
        # docker-compose.vm.yml for the real deployed shape.
        export OPS_COMPOSE_FILE="${OPS_COMPOSE_FILE:-$HERE/docker-compose.yml}"
        export OPS_REPOS_DIR="${OPS_REPOS_DIR:-$ROOT}"
      fi
      if [ "$name" = "vault" ]; then
        export VAULT_SYNC_INTERVAL_MS="${VAULT_SYNC_INTERVAL_MS:-900000}"
        # BI26083003: cut over the local dev fleet to the encrypted sqlite
        # engine (migration already run, verified 373/373 collections
        # matched). Defaults to 'sqlite' HERE (this fleet's own launcher)
        # -- server.js's own top-level default stays 'tsv' for any other
        # deployment that hasn't opted in yet. Override with
        # VAULT_STORE_ENGINE=tsv to roll back.
        export VAULT_STORE_ENGINE="${VAULT_STORE_ENGINE:-sqlite}"
      fi
      if command -v setsid >/dev/null 2>&1; then
        setsid node src/server.js </dev/null >"$LOG_DIR/$name.log" 2>&1 &
      else
        nohup node src/server.js </dev/null >"$LOG_DIR/$name.log" 2>&1 &
      fi
    fi
    local p=$!
    disown "$p" 2>/dev/null || true
    echo "$p" > "$pidfile"
  )
  sleep 1
  echo "$name starting on :$port (pid $(cat "$pidfile" 2>/dev/null)), log: $LOG_DIR/$name.log"
}

stop_one() {
  local name="$1"
  local pidfile="$PID_DIR/$name.pid"
  if [ -f "$pidfile" ]; then
    kill "$(cat "$pidfile")" 2>/dev/null && echo "$name stopped"
    rm -f "$pidfile"
  fi
}

status_one() {
  local name="$1" port="$2"
  local pidfile="$PID_DIR/$name.pid"
  if [ -f "$pidfile" ] && kill -0 "$(cat "$pidfile")" 2>/dev/null; then
    echo "$name: running (pid $(cat "$pidfile"), port $port)"
  else
    echo "$name: stopped"
  fi
}

# Only dispatch a command when run directly (`./dev-local.sh start`) --
# watchdog.sh (BI26081808) sources this file to reuse SERVICES/start_one/
# stop_one/status_one without also triggering a `start` as a side effect
# of the import.
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
  cmd="${1:-start}"
  case "$cmd" in
    start)
      for s in "${SERVICES[@]}"; do IFS=: read -r name port dir <<<"$s"; start_one "$name" "$port" "$dir"; done
      ;;
    stop)
      for s in "${SERVICES[@]}"; do IFS=: read -r name port dir <<<"$s"; stop_one "$name"; done
      ;;
    status)
      for s in "${SERVICES[@]}"; do IFS=: read -r name port dir <<<"$s"; status_one "$name" "$port"; done
      ;;
    *)
      echo "usage: $0 [start|stop|status]" >&2
      exit 1
      ;;
  esac
fi
