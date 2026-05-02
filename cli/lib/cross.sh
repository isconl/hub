# isconl-space/lib/cross.sh
# Cross-system layer for sconlx.
# Covers: the main iSconl dashboard, guided "what now" menu, first-run setup,
# event bus, cross-system search, export, backup.
#
# ─────────────────────────────────────────────────────────────────────────────
# CHANGELOG
# ─────────────────────────────────────────────────────────────────────────────
#   v2.1.0 — Calendar section added to main dashboard (today's holidays,
#             birthdays, events). UX: added blank-line breathing room
#             throughout all views and menus.
#   v2.0.0 — Complete redesign. Clean dashboard (no emojis, no tables),
#             _ctx_load for single Python call, intelligent guided menu,
#             first-run detection, time-aware suggestions, AI hook scaffolding.
#   v1.0.0 — Initial. Dashboard, events, search, export, backup.
# ─────────────────────────────────────────────────────────────────────────────

[[ -n "${_CROSS_LOADED:-}" ]] && return 0
_CROSS_LOADED=1

# ─────────────────────────────────────────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────────────────────────────────────────

_CROSS_EXPORT_DIR="$HOME/.local/share/isconl/exports"
_CROSS_FIRST_RUN_MARKER="$_FLAT_DIR/.firstrun_complete"

_CROSS_HOUR=$(( 10#$(date +%H) ))

# ─────────────────────────────────────────────────────────────────────────────
# ROUTER
# ─────────────────────────────────────────────────────────────────────────────

_cross_route() {
  local cmd="${1:-dashboard}"
  shift || true
  case "$cmd" in
    ""|dashboard)  _cross_dashboard ;;
    events)        _cross_events_route "$@" ;;
    status)        _cross_status ;;
    search)        _cross_search "$*" ;;
    export)        _cross_export ;;
    backup)        _cross_backup ;;
    *)
      _ui_err "Unknown command: $cmd"
      printf '\n%s  Usage: isconl x [events|status|search|export|backup]\n\n' \
        "$_UI_INDENT" >&2 ;;
  esac
}

# ─────────────────────────────────────────────────────────────────────────────
# FIRST-RUN CHECK
# ─────────────────────────────────────────────────────────────────────────────

_cross_is_first_run() {
  [[ -f "${_CROSS_FIRST_RUN_MARKER:-/dev/null}" ]] && return 1
  ! _db_identity_exists
}

_cross_first_run_welcome() {
  _ui_blank
  _ui_box_top
  _ui_box_line "$(_ui_bold "Welcome to iSconl")"
  _ui_box_sep
  _ui_box_line "Your personal workspace — scope, space, and spark."
  _ui_box_line "Before the daily loop, set up your identity layer."
  _ui_box_line "It takes about 5 minutes and anchors everything else."
  _ui_box_bot
  _ui_blank

  local choice
  choice="$(_ui_action_menu "How do you want to proceed?" \
    "Set up identity now  (recommended):setup" \
    "Skip — go to dashboard:skip")" || return 0

  case "$choice" in
    setup)
      _scope_identity_edit
      touch "$_CROSS_FIRST_RUN_MARKER" 2>/dev/null || true
      ;;
    skip)
      _ui_blank
      _ui_info "Skipped. Run anytime: isconl scope identity edit"
      touch "${_CROSS_FIRST_RUN_MARKER}" 2>/dev/null || true
      ;;
  esac
  _ui_blank
}

_cross_guided_menu_loop() {
  local today; today="$(_db_today)"
  local has_reflection="no"
  [[ -f "$_FLAT_SCOPE_REFLECTIONS_TSV" ]] && \
    grep -qF "$today" "$_FLAT_SCOPE_REFLECTIONS_TSV" 2>/dev/null && has_reflection="yes"
  local inbox_count today_count i_ref
  inbox_count="$(_tsv_count "$_FLAT_SCOPE_INBOX" '$4=="new"')"
  today_count="$(_tsv_count "$_FLAT_SCOPE_TASKS" '$3=="today"')"
  i_ref="$(_tsv_count "$_FLAT_SPARK_IDEAS" '$2=="refined"')"
  _cross_guided_menu "$today" "$has_reflection" "$inbox_count" "$today_count" "$i_ref"
}

# ─────────────────────────────────────────────────────────────────────────────
# CALENDAR MINI-SECTION FOR DASHBOARD
# Fetches today's holidays + birthdays + events from the calendar backend and
# renders a compact inline block. Fails gracefully — if the Python script is
# missing or returns nothing, the section is silently skipped.
# ─────────────────────────────────────────────────────────────────────────────

_cross_calendar_inline() {
  local today="$1"

  # Guard: need the Python script and data file
  [[ -f "${_CAL_PY:-}" ]] || return 0
  [[ -f "${_CAL_DATA_FILE:-}" ]] || return 0

  local cal_json
  cal_json="$(python3 "$_CAL_PY" \
    --calendar-file "$_CAL_DATA_FILE" \
    --journal-dir   "${_FLAT_JOURNAL_DIR:-${_FLAT_DIR}/journal}" \
    --regions       "${_CAL_REGIONS:-KE,INT}" \
    --action today \
    --date "$today" 2>/dev/null)" || return 0

  [[ -z "$cal_json" ]] && return 0

  # Gather items into a single inline block
  local items=()

  # Holidays
  while IFS= read -r h; do
    [[ -n "$h" ]] && items+=("$(_ui_dim "[$h]")")
  done < <(printf '%s' "$cal_json" | python3 -c "
import json,sys
d=json.load(sys.stdin)
for h in d.get('holidays',[]): print(h['name'])
" 2>/dev/null)

  # Birthdays
  while IFS= read -r b; do
    [[ -n "$b" ]] && items+=("$(_ui_green "$b")")
  done < <(printf '%s' "$cal_json" | python3 -c "
import json,sys
d=json.load(sys.stdin)
for b in d.get('birthdays_today',[]):
    t = f' (turning {b[\"turning\"]})' if b.get('turning') else ''
    print('Birthday: ' + b['name'] + t)
" 2>/dev/null)

  # Custom events
  while IFS= read -r e; do
    [[ -n "$e" ]] && items+=("$e")
  done < <(printf '%s' "$cal_json" | python3 -c "
import json,sys
d=json.load(sys.stdin)
for e in d.get('events_today',[]): print(e['title'] + '  [' + e['category'] + ']')
" 2>/dev/null)

  [[ "${#items[@]}" -eq 0 ]] && return 0

  _ui_section_inline "CALENDAR" "today"
  _ui_blank
  for item in "${items[@]}"; do
    printf '%s  %s  %s\n' "$_UI_INDENT" "$(_ui_dim "·")" "$item" >&2
  done
  _ui_blank
}

# ─────────────────────────────────────────────────────────────────────────────
# MAIN DASHBOARD
# ─────────────────────────────────────────────────────────────────────────────

_cross_dashboard() {
  if _cross_is_first_run; then
    _cross_first_run_welcome
  fi

  _ctx_load || true
  _db_identity_load 2>/dev/null || true

  local today; today="$(_db_today)"
  local day_theme; day_theme="$(_db_day_theme)"
  local block_status; block_status="$(_db_block_status)"

  _ui_blank
  _ui_hr
  printf '%s%s  %s\n' "$_UI_INDENT" "$(_ui_bold "iSconl")" "$(_ui_dim "·  $_DATA_MODE mode")" >&2
  _ui_hr
  _ui_blank

  # Date + time systems
  printf '%s%s\n' "$_UI_INDENT" "$(_ui_bold "$CTX_GREGORIAN")" >&2
  _ui_blank
  printf '%s%s  %s\n' "$_UI_INDENT" "$CTX_EQ_SHORT" "$(_ui_dim "·  $CTX_SPRINT_SHORT")" >&2

  # Day theme + focus block status
  local block_note=""
  case "$block_status" in
    IN:*)
      local _bn="${block_status#IN:}"; _bn="${_bn%%:*}"
      local _br="${block_status##*:}"
      block_note="  $(_ui_dim "·")  $(_ui_bold "$_bn block")  $(_ui_dim "($_br)")" ;;
    NEXT:*)
      local _bi="${block_status#NEXT:}"; local _bn="${_bi%%:*}"; local _bu="${_bi##*:}"
      block_note="  $(_ui_dim "·  next: $_bn  ($_bu)")" ;;
  esac
  printf '%s%s%s\n' "$_UI_INDENT" "$(_ui_dim "$day_theme")" "$block_note" >&2
  _ui_blank

  # Year progress
  printf '%sYear %s  %s\n' "$_UI_INDENT" \
    "${CTX_YEAR_PCT}%" \
    "$(_ui_dim "${CTX_YEAR_BAR}  day ${CTX_YEAR_DAY} / ${CTX_YEAR_TOTAL}")" >&2

  # Age (only when birthday set)
  if [[ -n "${CTX_AGE_SHORT:-}" ]]; then
    printf '%sAge %s  %s\n' "$_UI_INDENT" \
      "$(_ui_bold "$CTX_AGE_SHORT")" \
      "$(_ui_dim "·  ${CTX_DAYS_TO_BDAY}d to birthday  (turning $CTX_TURNING)")" >&2
  fi

  # Season / identity
  if [[ -n "${SEASON_THEME:-${SEASON_NAME:-}}" ]]; then
    _ui_blank
    _ui_hr
    printf '%s%s\n' "$_UI_INDENT" "$(_ui_italic "${SEASON_THEME:-$SEASON_NAME}")" >&2
    [[ -n "${CORE_VALUES:-}" ]] && \
      printf '%s%s\n' "$_UI_INDENT" "$(_ui_dim "${CORE_VALUES//|/ · }")" >&2
  fi

  _ui_blank
  _ui_hr

  # ── CALENDAR (inline mini-section) ─────────────────────────────────────────
  _cross_calendar_inline "$today"

  # ── SCOPE ──────────────────────────────────────────────────────────────────
  _ui_section_scope "SCOPE" "daily rhythm"
  _ui_blank

  local inbox_count today_count done_count goal_count deferred_count
  inbox_count="$(_tsv_count "$_FLAT_SCOPE_INBOX"  '$4=="new"')"
  today_count="$(_tsv_count "$_FLAT_SCOPE_TASKS"  '$3=="today"')"
  done_count="$( _tsv_count "$_FLAT_SCOPE_TASKS"  '$3=="done"')"
  deferred_count="$(_tsv_count "$_FLAT_SCOPE_TASKS" '$3=="deferred"')"
  goal_count="$(_tsv_count "$_FLAT_SCOPE_GOALS"   '$7=="active"')"

  # Inbox
  local inbox_line="$inbox_count item(s)"
  [[ "$inbox_count" -eq 0 ]] && inbox_line="$(_ui_dim "empty")"
  _ui_row "Inbox" "$inbox_line"
  _ui_blank

  # Today's tasks
  local today_line=""
  if [[ "$today_count" -gt 0 ]]; then
    today_line="$today_count selected  $(_ui_dim "($done_count done)")"
  else
    today_line="$(_ui_dim "none selected")"
  fi
  [[ "$deferred_count" -gt 0 ]] && \
    today_line="${today_line}  $(_ui_yellow "${deferred_count} deferred")"
  _ui_row "Today" "$today_line"
  _ui_blank

  # Active goals
  if [[ "$goal_count" -gt 0 ]]; then
    local first_goal first_pct
    first_goal="$(awk -F'\t' 'NR>1 && $7=="active" {print $2; exit}' \
      "$_FLAT_SCOPE_GOALS" 2>/dev/null | head -c 35)"
    first_pct="$(awk -F'\t' 'NR>1 && $7=="active" {pct=($4>0)?int($5*100/$4):0; print pct; exit}' \
      "$_FLAT_SCOPE_GOALS" 2>/dev/null)"
    local goal_bar; goal_bar="$(_ui_bar "${first_pct:-0}" 100 12)"
    _ui_row "Goals" \
      "$goal_count active  $(_ui_dim "·  ${first_goal:-}  $goal_bar ${first_pct:-0}%")"
  else
    _ui_row "Goals" "$(_ui_dim "none yet")"
  fi
  _ui_blank

  # Cycle progress
  local cycle_line
  cycle_line="Cycle $CTX_EQ_CYCLE  $(_ui_dim "·  Day $CTX_EQ_DAY / 28  $CTX_CYCLE_BAR  $CTX_CYCLE_PCT%")"
  _ui_row "Cycle" "$cycle_line"
  _ui_blank

  # Reflection
  local has_reflection="no"
  [[ -f "$_FLAT_SCOPE_REFLECTIONS_TSV" ]] && \
    grep -qF "$today" "$_FLAT_SCOPE_REFLECTIONS_TSV" 2>/dev/null && has_reflection="yes"
  local refl_line
  if [[ "$has_reflection" == "yes" ]]; then
    refl_line="$(_ui_green "done")"
  else
    if [[ "$_CROSS_HOUR" -ge 17 ]]; then
      refl_line="$(_ui_yellow "due  (evening reflection)")"
    else
      refl_line="$(_ui_dim "not yet")"
    fi
  fi
  _ui_row "Reflection" "$refl_line"
  _ui_blank

  # ── SPACE ──────────────────────────────────────────────────────────────────
  _ui_hr
  _ui_section_space "SPACE" "domain portfolio"
  _ui_blank

  local space_total space_active space_health
  space_total="$(_tsv_count "$_FLAT_SPACE_SPACES" '$4!="archived"')"

  if [[ "$space_total" -gt 0 ]]; then
    space_active="$(_tsv_count "$_FLAT_SPACE_SPACES" '$4=="active"')"
    space_health="$(_space_avg_health)"
    _ui_row "Portfolio" \
      "$space_active active  $(_ui_dim "·  health $space_health/10  $(_ui_health_dots "$space_health" 10 8)")"
    _ui_blank

    awk -F'\t' 'NR>1 && $4=="active" {
      printf "%-20s  %-10s  %s/10\n", substr($2,1,20), $3, $5
      if (++n>=2) exit
    }' "$_FLAT_SPACE_SPACES" 2>/dev/null | while IFS= read -r line; do
      _ui_hint "$line"
    done

    local overdue_spaces; overdue_spaces="$(_cross_overdue_reviews)"
    if [[ -n "$overdue_spaces" ]]; then
      _ui_blank
      _ui_warn "Review overdue: $overdue_spaces"
    fi
  else
    _ui_row "Portfolio" "$(_ui_dim "no spaces yet  — isconl space add")"
  fi
  _ui_blank

  # ── SPARK ──────────────────────────────────────────────────────────────────
  _ui_hr
  _ui_section_spark "SPARK" "inner world"
  _ui_blank

  # Journal
  local journal_file; journal_file="$(_journal_today_file 2>/dev/null || true)"
  if [[ -n "$journal_file" ]]; then
    local wc; wc="$(wc -w < "$journal_file" 2>/dev/null | tr -d ' ')"
    local streak; streak="$(_spark_journal_streak)"
    _ui_row "Journal" "$(_ui_green "written")  $(_ui_dim "·  $wc words  ·  streak: ${streak}d")"
  else
    _ui_row "Journal" "$(_ui_dim "no entry today")"
  fi
  _ui_blank

  # Ideas
  local i_cap i_dev i_ref
  i_cap="$(_tsv_count "$_FLAT_SPARK_IDEAS" '$2=="captured"')"
  i_dev="$(_tsv_count "$_FLAT_SPARK_IDEAS" '$2=="developing"')"
  i_ref="$(_tsv_count "$_FLAT_SPARK_IDEAS" '$2=="refined"')"
  local idea_line="${i_cap} captured"
  [[ "$i_dev" -gt 0 ]] && idea_line="${idea_line}  ·  ${i_dev} developing"
  [[ "$i_ref" -gt 0 ]] && idea_line="${idea_line}  ·  $(_ui_yellow "${i_ref} refined — decide")"
  _ui_row "Ideas" "$idea_line"
  _ui_blank

  # Learning
  local learn_active; learn_active="$(_tsv_count "$_FLAT_SPARK_LEARNING" '$4=="active"')"
  if [[ "$learn_active" -gt 0 ]]; then
    local learn_title learn_pct learn_bar
    learn_title="$(awk -F'\t' 'NR>1 && $4=="active" {print $2; exit}' \
      "$_FLAT_SPARK_LEARNING" 2>/dev/null | head -c 30)"
    learn_pct="$(awk -F'\t' 'NR>1 && $4=="active" {print $5+0; exit}' \
      "$_FLAT_SPARK_LEARNING" 2>/dev/null)"
    learn_bar="$(_ui_bar "${learn_pct:-0}" 100 10)"
    _ui_row "Learning" \
      "$(_ui_truncate "${learn_title:-active}" 25)  $learn_bar ${learn_pct:-0}%"
  else
    _ui_row "Learning" "$(_ui_dim "nothing active")"
  fi
  _ui_blank

  # DIA overdue
  local dia_overdue; dia_overdue="$(_spark_dia_overdue_count)"
  if [[ "$dia_overdue" -gt 0 ]]; then
    _ui_warn "DIA: $dia_overdue profile(s) need interaction"
    _ui_blank
  fi

  _ui_hr

  # ── GUIDED ACTION MENU ─────────────────────────────────────────────────────
  _cross_guided_menu "$today" "$has_reflection" "$inbox_count" \
    "$today_count" "$i_ref"
}

# ─────────────────────────────────────────────────────────────────────────────
# GUIDED ACTION MENU
# ─────────────────────────────────────────────────────────────────────────────

_cross_guided_menu() {
  local today="$1" has_reflection="$2" inbox_count="$3"
  local today_count="$4" ideas_refined="$5"

  local -a actions=()
  local -a keys=()

  if [[ "$_CROSS_HOUR" -lt 12 ]]; then
    [[ "$today_count" -eq 0 ]] && {
      actions+=("Select tasks for today"); keys+=("scope_today"); }
    [[ "$inbox_count" -gt 0 ]] && {
      actions+=("Process inbox  ($inbox_count items)"); keys+=("scope_inbox"); }
    ! _journal_has_today 2>/dev/null && {
      actions+=("Write morning journal entry"); keys+=("journal"); }
  elif [[ "$_CROSS_HOUR" -ge 17 ]]; then
    [[ "$has_reflection" == "no" ]] && {
      actions+=("Evening reflection"); keys+=("scope_reflect"); }
    ! _journal_has_today 2>/dev/null && {
      actions+=("Write journal entry"); keys+=("journal"); }
    [[ "$today_count" -gt 0 ]] && {
      actions+=("Review today's tasks"); keys+=("scope_task_list"); }
  else
    ! _journal_has_today 2>/dev/null && {
      actions+=("Write journal entry"); keys+=("journal"); }
    [[ "$inbox_count" -gt 0 ]] && {
      actions+=("Process inbox  ($inbox_count items)"); keys+=("scope_inbox"); }
    [[ "$today_count" -eq 0 ]] && {
      actions+=("Select tasks for today"); keys+=("scope_today"); }
  fi

  [[ "$ideas_refined" -gt 0 ]] && {
    actions+=("Decide on refined ideas  ($ideas_refined)"); keys+=("spark_ideas"); }
  actions+=("Capture something  (inbox / idea / note)"); keys+=("capture")
  actions+=("View all Scope");  keys+=("scope")
  actions+=("View all Space");  keys+=("space")
  actions+=("View all Spark");  keys+=("spark")

  _ui_blank
  printf '%s%s\n' "$_UI_INDENT" "$(_ui_bold "What would you like to do?")" >&2
  _ui_blank

  local i max_show=6
  local n="${#actions[@]}"
  [[ $n -lt $max_show ]] && max_show=$n

  for (( i=0; i<max_show; i++ )); do
    printf '%s  [%d]  %s\n' "$_UI_INDENT" "$(( i+1 ))" "${actions[$i]}" >&2
  done
  [[ $n -gt $max_show ]] && \
    printf '%s  [m]  More options\n' "$_UI_INDENT" >&2
  printf '%s  [q]  Quit\n' "$_UI_INDENT" >&2
  _ui_blank
  printf '%s  > ' "$_UI_INDENT" >&2

  local choice
  IFS= read -r choice

  _ui_is_quit "$choice" && return 0

  if [[ "${choice,,}" == "m" ]]; then
    _cross_more_actions
    return 0
  fi

  if ! [[ "$choice" =~ ^[0-9]+$ ]] || \
     [[ "$choice" -lt 1 ]] || \
     [[ "$choice" -gt $max_show ]]; then
    return 0
  fi

  local key="${keys[$(( choice - 1 ))]}"
  _cross_dispatch_action "$key"
}

_cross_dispatch_action() {
  local key="$1"
  case "$key" in
    scope_inbox)     _scope_inbox_route ;;
    scope_today)     _scope_today_route ;;
    scope_reflect)   _scope_reflect_guided ;;
    scope_task_list) _scope_task_list ;;
    scope)           _scope_dashboard ;;
    space)           _space_dashboard ;;
    spark)           _spark_dashboard ;;
    journal)         _spark_journal_open ;;
    spark_ideas)     _spark_idea_list ;;
    capture)         _cross_capture_menu ;;
    *)               _ui_info "Unknown action." ;;
  esac
}

_cross_more_actions() {
  local action
  _UI_SHOW_BACK=1 _UI_BACK_LABEL="Back to main menu"
  action="$(_ui_action_menu "All options" \
    "Add a task:scope_task_add" \
    "Add a goal:scope_goal_add" \
    "Add an idea:spark_idea_add" \
    "Quick note:spark_note_capture" \
    "Add a space:space_add" \
    "Log a KPI:space_kpi_log" \
    "Log a DIA interaction:spark_dia_log" \
    "Cross-system search:cross_search" \
    "Export all data:cross_export" \
    "DB / file status:cross_status")" || return 0

  case "$action" in
    scope_task_add)     _scope_task_add ;;
    scope_goal_add)     _scope_goal_add ;;
    spark_idea_add)     _spark_idea_add ;;
    spark_note_capture) _spark_note_capture ;;
    space_add)          _space_add ;;
    space_kpi_log)      _space_kpi_log ;;
    spark_dia_log)      _spark_dia_log ;;
    cross_search)
      local q; q="$(_ui_prompt "Search query")" || return 0
      _cross_search "$q" ;;
    cross_export) _cross_export ;;
    cross_status) _cross_status ;;
  esac
  _UI_SHOW_BACK=0
}

_cross_capture_menu() {
  local action
  _UI_SHOW_BACK=1 _UI_BACK_LABEL="Back to menu"
  action="$(_ui_action_menu "Capture what?" \
    "Inbox item  (process later):inbox" \
    "Idea  (goes to Spark pipeline):idea" \
    "Quick note  (opens editor):note" \
    "Task  (goes to Scope backlog):task")"
  local _rc=$?
  _UI_SHOW_BACK=0
  [[ $_rc -eq 2 ]] && _cross_guided_menu_loop && return 0
  [[ $_rc -ne 0 ]] && return 0

  case "$action" in
    inbox) _scope_inbox_add ;;
    idea)  _spark_idea_add ;;
    note)  _spark_note_capture ;;
    task)  _scope_task_add ;;
  esac
}

# ─────────────────────────────────────────────────────────────────────────────
# EVENTS
# ─────────────────────────────────────────────────────────────────────────────

_cross_events_route() {
  case "${1:-list}" in
    list|"") _cross_events_list ;;
    process) _ev_process_all ;;
    *)       _cross_events_list ;;
  esac
}

_cross_events_list() {
  local pending; pending="$(_ev_pending)"
  local count; count="$(printf '%s\n' "$pending" | wc -l | tr -d ' ')"
  [[ -z "$pending" ]] && count=0

  _ui_section "EVENT BUS" "$count pending"
  _ui_blank

  if [[ "${count:-0}" -eq 0 ]]; then
    _ui_ok "No pending events."
    _ui_blank
    return 0
  fi

  while IFS=$'\t' read -r ev_id ev_type ev_payload; do
    [[ -z "$ev_id" ]] && continue
    printf '%s  %-10s  %s\n' "$_UI_INDENT" "${ev_id:0:8}" "$ev_type" >&2
    [[ -n "$ev_payload" && "$ev_payload" != "{}" ]] && \
      _ui_hint "$(_ui_truncate "$ev_payload" 52)"
    _ui_blank
  done <<< "$pending"

  _ui_hint "isconl x events process  — handle all"
  _ui_blank
}

# ─────────────────────────────────────────────────────────────────────────────
# STATUS
# ─────────────────────────────────────────────────────────────────────────────

_cross_status() {
  _ui_section "STATUS"
  _ui_blank

  _ui_row "Data mode" "$(_ui_bold "$_DATA_MODE")"
  _ui_blank
  _ui_row "Data dir"  "$_FLAT_DIR"
  _ui_blank

  if [[ "$_DATA_MODE" == "sqlite" ]]; then
    _ui_subsection "SQLite databases"
    _ui_blank
    local _dbs=("$_SCOPE_DB:scope.db" "$_SPACE_DB:space.db" \
                "$_SPARK_DB:spark.db" "$_EVENTS_DB:isconl_events.db")
    for _e in "${_dbs[@]}"; do
      local _p="${_e%%:*}" _n="${_e##*:}"
      if [[ -f "$_p" ]]; then
        local sz; sz="$(du -sh "$_p" 2>/dev/null | cut -f1)"
        _ui_ok "$_n  ($sz)"
      else
        _ui_warn "$_n  not found"
      fi
      _ui_blank
    done
  else
    _ui_subsection "Flat-file data"
    _ui_blank
    for _e in \
      "$_FLAT_SCOPE_INBOX:inbox.tsv" \
      "$_FLAT_SCOPE_TASKS:tasks.tsv" \
      "$_FLAT_SCOPE_GOALS:goals.tsv" \
      "$_FLAT_SPACE_SPACES:spaces.tsv" \
      "$_FLAT_SPARK_IDEAS:ideas.tsv" \
      "$_FLAT_SPARK_LEARNING:learning.tsv"
    do
      local _p="${_e%%:*}" _n="${_e##*:}"
      if [[ -f "$_p" ]]; then
        local rows; rows="$(_tsv_count "$_p")"
        _ui_ok "$_n  ($rows rows)"
      else
        _ui_info "$_n  (no data yet)"
      fi
      _ui_blank
    done

    # calendar.json status
    if [[ -f "$_CAL_DATA_FILE" ]]; then
      _ui_ok "calendar.json"
    else
      _ui_info "calendar.json  (not created yet — run: isconl cal)"
    fi
    _ui_blank

    # calendar_data.py status
    if [[ -f "${_CAL_PY:-}" ]]; then
      _ui_ok "calendar_data.py  ($(basename "$(dirname "$_CAL_PY")"))"
    else
      _ui_warn "calendar_data.py  NOT FOUND"
      printf '%s  Expected: %s\n' "$_UI_INDENT" \
        "${_ISCONLSPACE_LIB_DIR}/calendar_data.py" >&2
      printf '%s  Fix: move calendar_data.py from sconl-space/lib/ → isconl-space/lib/\n' \
        "$_UI_INDENT" >&2
    fi
    _ui_blank
  fi

  local ev_n; ev_n="$(_ev_status)"
  _ui_row "Event bus" "$ev_n pending event(s)"
  _ui_blank
}

# ─────────────────────────────────────────────────────────────────────────────
# SEARCH
# ─────────────────────────────────────────────────────────────────────────────

_cross_search() {
  local query="$1"
  if [[ -z "$query" ]]; then
    query="$(_ui_prompt "Search query")" || return 0
  fi

  _ui_section "SEARCH" "\"$query\""
  _ui_blank

  local found=0

  _cross_search_tsv "$_FLAT_SCOPE_TASKS"    "2" "$query" "3" "SCOPE  Tasks"    "_ui_scope"  && (( ++found )) || true
  _cross_search_tsv "$_FLAT_SCOPE_GOALS"    "2" "$query" "7" "SCOPE  Goals"    "_ui_scope"  && (( ++found )) || true
  _cross_search_tsv "$_FLAT_SPACE_SPACES"   "2" "$query" "4" "SPACE  Spaces"   "_ui_space"  && (( ++found )) || true
  _cross_search_tsv "$_FLAT_SPARK_IDEAS"    "5" "$query" "2" "SPARK  Ideas"    "_ui_spark"  && (( ++found )) || true
  _cross_search_tsv "$_FLAT_SPARK_LEARNING" "2" "$query" "4" "SPARK  Learning" "_ui_spark"  && (( ++found )) || true

  if [[ -d "$_FLAT_JOURNAL_DIR" ]]; then
    local hits=()
    while IFS= read -r jf; do
      grep -qi "$query" "$jf" 2>/dev/null && hits+=("$(basename "$jf" .md)")
    done < <(find "$_FLAT_JOURNAL_DIR" -name "*.md" 2>/dev/null | sort -r | head -30)
    if [[ "${#hits[@]}" -gt 0 ]]; then
      _ui_blank
      _ui_subsection "$(_ui_spark "SPARK  Journal")"
      _ui_blank
      _ui_hint "(dates with matching entries — open to read)"
      for d in "${hits[@]}"; do
        printf '%s  %s\n' "$_UI_INDENT" "$d" >&2
      done
      (( ++found ))
    fi
  fi

  _ui_blank
  [[ "$found" -eq 0 ]] && _ui_info "No results for: $query"
  _ui_blank
}

_cross_search_tsv() {
  local file="$1" title_field="$2" query="$3" \
        status_field="$4" label="$5" cfn="${6:-}"
  [[ -f "$file" ]] || return 1
  local matches
  matches="$(awk -F'\t' -v q="${query,,}" -v tf="$title_field" -v sf="$status_field" '
    NR>1 && tolower($tf)~q {
      printf "  %-8s  %-12s  %s\n", $1, $sf, $tf
    }' "$file" 2>/dev/null || true)"
  [[ -z "$matches" ]] && return 1
  _ui_blank
  _ui_subsection "$("${cfn:-printf}" "${cfn:+$label}" 2>/dev/null || printf '%s' "$label")"
  _ui_blank
  printf '%s\n' "$matches" >&2
  return 0
}

# ─────────────────────────────────────────────────────────────────────────────
# EXPORT
# ─────────────────────────────────────────────────────────────────────────────

_cross_export() {
  mkdir -p "$_CROSS_EXPORT_DIR"
  local ts; ts="$(date +%Y%m%d_%H%M%S)"
  local out="$_CROSS_EXPORT_DIR/isconl_export_${ts}.md"

  printf '# iSconl Export\n*%s*\n\n---\n\n' "$(date)" > "$out"

  {
    printf '## SCOPE\n\n### Tasks\n\n'
    [[ -f "$_FLAT_SCOPE_TASKS" ]] && \
      awk -F'\t' 'NR>1 && $3!="archived" {printf "- [%s] %s (%s)\n",$3,$2,$4}' \
        "$_FLAT_SCOPE_TASKS"

    printf '\n### Goals\n\n'
    [[ -f "$_FLAT_SCOPE_GOALS" ]] && \
      awk -F'\t' 'NR>1 && $7=="active" {
        pct=($4>0)?int($5*100/$4):0
        printf "- %s  [%d%%]\n",$2,pct
      }' "$_FLAT_SCOPE_GOALS"

    printf '\n---\n\n## SPACE\n\n### Spaces\n\n'
    [[ -f "$_FLAT_SPACE_SPACES" ]] && \
      awk -F'\t' 'NR>1 && $4!="archived" {
        printf "- **%s** (%s) — %s — health %s/10\n",$2,$3,$4,$5
      }' "$_FLAT_SPACE_SPACES"

    printf '\n---\n\n## SPARK\n\n### Ideas\n\n'
    [[ -f "$_FLAT_SPARK_IDEAS" ]] && \
      awk -F'\t' 'NR>1 && $2!="archived" && $2!="exported" {
        printf "- [%s] %s\n",$2,$5
      }' "$_FLAT_SPARK_IDEAS"

    printf '\n### Learning\n\n'
    [[ -f "$_FLAT_SPARK_LEARNING" ]] && \
      awk -F'\t' 'NR>1 {printf "- [%s] %s (%s%%) — %s\n",$4,$2,$5,$3}' \
        "$_FLAT_SPARK_LEARNING"
  } >> "$out"

  _ui_blank
  _ui_cap "Exported: $out"
  _ui_blank
}

# ─────────────────────────────────────────────────────────────────────────────
# BACKUP
# ─────────────────────────────────────────────────────────────────────────────

_cross_backup() {
  _ui_blank
  if command -v backupx &>/dev/null; then
    _ui_info "Triggering backupx for iSconl data..."
    backupx
  else
    _ui_warn "backupx not found."
    _ui_blank
    _ui_hint "Run: isconl x export  for a local markdown export."
  fi
  _ui_blank
}

# ─────────────────────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────────────────────

_cross_overdue_reviews() {
  [[ -f "$_FLAT_SPACE_SPACES" ]] || return 0
  local today; today="$(_db_today)"
  awk -F'\t' -v today="$today" '
    NR>1 && $4!="archived" {
      if ($9=="" || $9=="-") { print $2; next }
      cmd="python3 -c \"from datetime import date; print((date.fromisoformat('"'"'"today"'"'"')-date.fromisoformat('"'"'"$9"'"'"')).days)\" 2>/dev/null"
      cmd | getline d; close(cmd)
      if (d+0 > 14) print $2
    }' "$_FLAT_SPACE_SPACES" 2>/dev/null | head -3 | tr '\n' ',' | sed 's/,$//'
}