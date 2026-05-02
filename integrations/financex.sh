# hub/integrations/financex.sh
# Dynamic integration — loaded by cross.sh if financex is installed.
# ─────────────────────────────────────────────────────────────────────────────
# CHANGELOG (newest first)
# ─────────────────────────────────────────────────────────────────────────────
#   2026-04-30  Scaffolded — implement when financex stable
[[ -n "${_INT_FINANCEX_LOADED:-}" ]] && return 0
_INT_FINANCEX_LOADED=1

_integration_financex_dashboard_section() { return 0; }
_integration_financex_scope_context()     { return 0; }
_integration_financex_event_hook()        { return 0; }
