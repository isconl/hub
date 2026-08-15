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
PID_DIR="$HERE/scripts/.dev-pids"
mkdir -p "$LOG_DIR" "$PID_DIR"

# name:port:dir
SERVICES=(
  "vault:8081:vault"
  "pulse:8082:pulse"
  "scope:8083:scope"
  "circle:8084:circle"
  "spark:8085:spark"
  "hub:8888:hub"
)

start_one() {
  local name="$1" port="$2" dir="$3"
  local pidfile="$PID_DIR/$name.pid"
  if [ -f "$pidfile" ] && kill -0 "$(cat "$pidfile")" 2>/dev/null; then
    echo "$name already running (pid $(cat "$pidfile"))"
    return
  fi
  (
    cd "$ROOT/$dir"
    export "$(echo "${name^^}")_BIND"=127.0.0.1
    export "$(echo "${name^^}")_PORT"="$port"
    export VAULT_URL="http://127.0.0.1:8081"
    export PULSE_URL="http://127.0.0.1:8082"
    export SCOPE_URL="http://127.0.0.1:8083"
    export CIRCLE_URL="http://127.0.0.1:8084"
    export SPARK_URL="http://127.0.0.1:8085"
    # The legacy monolith (Sconl/isconl-agent) is retired -- deleted locally
    # 2026-08-15, no longer deployed anywhere. hub is self-contained: no
    # LEGACY_API_URL, no fallback to its memory/ tree. career/** and
    # circle/dia/ content that used to come from there is empty until
    # circle/memory/ is seeded natively -- a real gap, not silently papered
    # over with a pointer to a directory that no longer exists.
    # OneDrive sync loop (vault only) -- off by default in server.js itself
    # (the test suite calls main() with no real Graph credentials), so the
    # real running instance needs this set explicitly. 15 min: frequent
    # enough that an OneDrive edit shows up same-session, gentle enough not
    # to hammer Graph's throttling across ~35 collections every pass.
    if [ "$name" = "vault" ]; then
      export VAULT_SYNC_INTERVAL_MS="${VAULT_SYNC_INTERVAL_MS:-900000}"
    fi
    nohup node src/server.js >"$LOG_DIR/$name.log" 2>&1 &
    echo $! > "$pidfile"
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
