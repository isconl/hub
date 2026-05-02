# hub/integrations/calendarx.sh
# Dynamic integration — loaded by cross.sh if calendarx is installed.
# ─────────────────────────────────────────────────────────────────────────────
# CHANGELOG (newest first)
# ─────────────────────────────────────────────────────────────────────────────
#   2026-04-30  Scaffolded — implement when calendarx stable
[[ -n "${_INT_CALENDARX_LOADED:-}" ]] && return 0
_INT_CALENDARX_LOADED=1

_integration_calendarx_dashboard_section() { return 0; }
_integration_calendarx_scope_context()     { return 0; }
_integration_calendarx_event_hook()        { return 0; }
