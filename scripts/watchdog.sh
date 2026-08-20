#!/usr/bin/env bash
# BI26081808 v1: standalone crash-recovery watchdog for the local fleet.
# Polls every service's /health endpoint on an interval; a service that
# fails to respond gets restarted via dev-local.sh's own start_one() (same
# pidfile/log convention, nothing duplicated). Every check and every
# restart is logged to watchdog.log, timestamped, with why -- "surfaced
# somewhere visible... rather than silent" per the row's own scope.
#
# Usage: ./scripts/watchdog.sh [--once]
#   --once    run a single check-and-heal pass, then exit (for cron/manual
#             use) instead of looping forever.
#
# WATCHDOG_INTERVAL_SECONDS (default 30) controls the loop interval.
#
# Deliberately NOT part of dev-local.sh's own start/stop/status -- this is
# its own long-running process, started separately, so a fleet session can
# choose whether to run it at all.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"   # hub/
LOG_DIR="$HERE/scripts/.dev-logs"
WATCHDOG_LOG="$LOG_DIR/watchdog.log"
INTERVAL="${WATCHDOG_INTERVAL_SECONDS:-30}"

# shellcheck source=./dev-local.sh
source "$HERE/scripts/dev-local.sh"   # reuses SERVICES/start_one/PID_DIR -- see the sourcing guard added there

mkdir -p "$LOG_DIR"

log() { echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $*" >> "$WATCHDOG_LOG"; }

check_and_heal_one() {
  local name="$1" port="$2" dir="$3"
  local url="http://127.0.0.1:$port/health"
  local code
  # curl's own -w already prints "000" on a connection failure, before
  # exiting non-zero -- an `|| echo "000"` fallback after that doubles up
  # into "000000" in the log. Check for emptiness instead (belt-and-braces
  # for the rare case curl itself isn't found at all).
  code="$(curl -s -o /dev/null -w '%{http_code}' -m 5 "$url" 2>/dev/null)"
  [ -z "$code" ] && code="000"
  if [ "$code" = "200" ]; then
    return 0
  fi
  # A dead/missing process vs. a running-but-unresponsive one are different
  # failure modes worth telling apart in the log, not just "unhealthy".
  local pidfile="$PID_DIR/$name.pid"
  local pid_state="no pidfile"
  if [ -f "$pidfile" ]; then
    if kill -0 "$(cat "$pidfile")" 2>/dev/null; then pid_state="process running, port $port not answering /health (http $code)"
    else pid_state="pidfile stale, process not running"; fi
  fi
  log "UNHEALTHY $name (http $code, $pid_state) -- restarting"
  start_one "$name" "$port" "$dir" >> "$WATCHDOG_LOG" 2>&1
  # Re-check once, immediately, so the log shows whether the restart actually worked.
  sleep 2
  local recheck
  recheck="$(curl -s -o /dev/null -w '%{http_code}' -m 5 "$url" 2>/dev/null)"
  [ -z "$recheck" ] && recheck="000"
  if [ "$recheck" = "200" ]; then
    log "RECOVERED $name"
  else
    log "STILL UNHEALTHY $name after restart attempt (http $recheck) -- needs manual attention"
  fi
}

sweep() {
  for s in "${SERVICES[@]}"; do
    IFS=: read -r name port dir <<<"$s"
    check_and_heal_one "$name" "$port" "$dir"
  done
}

if [ "${1:-}" = "--once" ]; then
  sweep
  exit 0
fi

log "watchdog started, interval=${INTERVAL}s"
while true; do
  sweep
  sleep "$INTERVAL"
done
