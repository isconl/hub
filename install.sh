#!/usr/bin/env bash
# isconl/hub/install.sh
# ─────────────────────────────────────────────────────────────────────────────
# Usage:
#   ./install.sh           — install hub only (PATH + symlinks)
#   ./install.sh --full    — clone + install entire isconl suite + xcorekit deps
#   ./install.sh --update  — pull all repos + re-link (alias for isconl-update)
#
# Individual tool installs remain fully supported:
#   git clone git@github.com:isconl/scope.git && cd scope && ./install.sh
#
# ─────────────────────────────────────────────────────────────────────────────
# CHANGELOG (newest first)
# ─────────────────────────────────────────────────────────────────────────────
#   2026-05-05  v1.0.0 — initial master installer. hub-only default, --full
#                        clones all repos. --update delegates to isconl-update.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
_BIN="$_ROOT/cli/bin"
_USER_BIN="${HOME}/bin"
_RC="${HOME}/.bashrc"
_MODE="${1:-}"

# ── Org roots (relative to hub, which is iSconl/hub) ─────────────────────────
_ISCONL_ROOT="$(cd "$_ROOT/.." && pwd)"              # iSconl/
_XCORE_ROOT="$(cd "$_ISCONL_ROOT/../XCore" 2>/dev/null && pwd \
    || echo "${HOME}/_/engineer-systems/Systems/XCore")"

_ISCONL_ORG="git@github.com:isconl"
_XCOREKIT_ORG="git@github.com:xcorekit"

# ── UI helpers ────────────────────────────────────────────────────────────────
_ok()  { printf '  \033[32m✓\033[0m  %s\n' "$*"; }
_add() { printf '  \033[33m+\033[0m  %s\n' "$*"; }
_run() { printf '  \033[2m~\033[0m  %s\n' "$*"; }
_err() { printf '  \033[31m✗\033[0m  %s\n' "$*" >&2; }
_sec() { printf '\n  \033[1m%s\033[0m\n  %s\n' "$1" "$(printf '─%.0s' $(seq 1 ${#1}))"; }

# ── Helper: add PATH guard to .bashrc ────────────────────────────────────────
_wire_path() {
    local bin_dir="$1" label="$2"
    if ! grep -qF "$bin_dir" "$_RC" 2>/dev/null; then
        printf '\n# %s\nexport PATH="%s:$PATH"\n' "$label" "$bin_dir" >> "$_RC"
        _add "Added to PATH: $label"
    else
        _ok "Already in PATH: $label"
    fi
}

# ── Helper: symlink all files in a bin dir ───────────────────────────────────
_link_bin() {
    local bin_dir="$1"
    [[ -d "$bin_dir" ]] || return 0
    chmod +x "$bin_dir"/* 2>/dev/null || true
    for f in "$bin_dir"/*; do
        [[ -f "$f" ]] || continue
        ln -sf "$f" "$_USER_BIN/$(basename "$f")"
        _run "Linked: $(basename "$f")"
    done
}

# ── Helper: clone or pull a repo ─────────────────────────────────────────────
_sync_repo() {
    local org="$1" repo="$2" dir="$3"
    if [[ -d "$dir/.git" ]]; then
        printf '  Updating %s...\n' "$repo"
        git -C "$dir" pull --rebase origin main 2>/dev/null \
            && _ok "Updated: $repo" \
            || _ok "Already up to date: $repo"
    else
        printf '  Cloning %s...\n' "$repo"
        mkdir -p "$(dirname "$dir")"
        git clone --quiet "$org/$repo.git" "$dir" \
            && _ok "Cloned: $repo" \
            || { _err "Failed to clone $repo"; return 1; }
    fi
}

# ── Helper: install one repo (sync + run its install.sh) ─────────────────────
_install_repo() {
    local org="$1" repo="$2" dir="$3"
    _sync_repo "$org" "$repo" "$dir"
    if [[ -f "$dir/install.sh" ]]; then
        bash "$dir/install.sh"
    fi
}

# ─────────────────────────────────────────────────────────────────────────────
# MODE: --update
# ─────────────────────────────────────────────────────────────────────────────
if [[ "$_MODE" == "--update" ]]; then
    if command -v isconl-update &>/dev/null; then
        exec isconl-update
    else
        exec "$_BIN/isconl-update"
    fi
fi

# ─────────────────────────────────────────────────────────────────────────────
# ALWAYS: install hub
# ─────────────────────────────────────────────────────────────────────────────
_sec "isconl hub install"
mkdir -p "$_USER_BIN"

_wire_path "$_BIN" "isconl/hub"
_link_bin "$_BIN"

# ─────────────────────────────────────────────────────────────────────────────
# MODE: --full — install entire suite
# ─────────────────────────────────────────────────────────────────────────────
if [[ "$_MODE" != "--full" ]]; then
    printf '\n  Hub installed.\n'
    printf '  For the full suite: ./install.sh --full\n'
    printf '  Run: source ~/.bashrc\n\n'
    exit 0
fi

_sec "Full suite install"

# ── Prerequisites check ───────────────────────────────────────────────────────
_sec "Checking prerequisites"
for cmd in git python3 sqlite3; do
    command -v "$cmd" &>/dev/null \
        && _ok "$cmd found" \
        || { _err "$cmd not found — install it first"; exit 1; }
done

python3 -c "import tomli_w" 2>/dev/null \
    && _ok "tomli_w found" \
    || { _add "Installing tomli_w..."; pip install tomli_w --break-system-packages -q; }

# ── Shared libs ───────────────────────────────────────────────────────────────
_sec "Shared libs"
mkdir -p ~/.local/lib/sconl ~/.config/sconl ~/.local/share/sconl/data

for lib in ui.sh db.sh events.sh; do
    src="$_ISCONL_ROOT/scope/cli/lib/$lib"
    dst="$HOME/.local/lib/sconl/$lib"
    if [[ -f "$src" ]]; then
        cp "$src" "$dst"
        _ok "Installed shared lib: $lib"
    fi
done

printf '1.0.0\n' > ~/.local/lib/sconl/VERSION
_ok "VERSION file written"

# ── Tenant config ─────────────────────────────────────────────────────────────
_sec "Tenant config"
if [[ ! -f "$HOME/.config/sconl/tenant.toml" ]]; then
    _add "Generating tenant.toml..."
    python3 - << PYEOF
import uuid, os
from pathlib import Path
from datetime import date

home  = Path.home()
xcore = home / "_/engineer-systems/Systems/XCore"
data  = home / ".local/share/sconl/data"

lines = [
    "[tenant]",
    f'id        = "{uuid.uuid4()}"',
    f'name      = ""',
    f'created   = "{date.today()}"',
    f'data_dir  = "{data}"',
    "",
    "[systems]",
    f'scope_dir = "{data}/scope"',
    f'space_dir = "{data}/space"',
    f'spark_dir = "{data}/spark"',
    "",
    "[libs]",
    f'shared_lib_dir = "{home}/.local/lib/sconl"',
    "",
    "[agent]",
    'enabled   = false',
    'model     = "claude-sonnet-4-20250514"',
    'endpoint  = ""',
    "",
    "[privacy]",
    "local_only = true",
    "",
    "[calendar]",
    'regions = ["KE", "INT"]',
    "",
    "[tools]",
    f'calendarx_dir = "{xcore}/calendar-core"',
    f'financex_dir  = "{xcore}/finance-core"',
    "",
    "[database]",
    f'local_db      = "{home}/.local/share/sconl/sconl.db"',
    'db_type       = "sqlite"',
    'cloud_db      = ""',
    'sync_enabled  = false',
]

Path(home / ".config/sconl").mkdir(parents=True, exist_ok=True)
(home / ".config/sconl/tenant.toml").write_text("\n".join(lines) + "\n")
print("  tenant.toml created")
PYEOF
else
    _ok "tenant.toml already exists"
fi

# ── isconl systems ────────────────────────────────────────────────────────────
_sec "isconl systems"
for repo in scope space spark; do
    dir="$_ISCONL_ROOT/$repo"
    _install_repo "$_ISCONL_ORG" "$repo" "$dir"
done

# ── xcorekit tools (via xcore barrel installer) ────────────────────────────────────────────────────────────
_sec "xcorekit tools"
for repo in calendar-core bash-core git-core animate-core finance-core; do
    dir="$_XCORE_ROOT/$repo"
    _install_repo "$_XCOREKIT_ORG" "$repo" "$dir"
done

# ── xcore private (backup-space, sys-space) ───────────────────────────────────
_sec "xcore private tools"
_XSPACE="$_XCORE_ROOT/xspace"
if [[ -d "$_XSPACE" ]]; then
    for space in backup-space sys-space; do
        _bin="$_XSPACE/$space/bin"
        if [[ -d "$_bin" ]]; then
            _wire_path "$_bin" "xcore/$space"
            _link_bin "$_bin"
        fi
    done
else
    printf '  (xcore private not cloned — skip backup/sys tools)\n'
fi

# ── Compat data dir (symlinks) ────────────────────────────────────────────────
_sec "Data directory"
mkdir -p ~/.local/share/sconl/data
for sub in scope space spark; do
    src="$_ISCONL_ROOT/$sub/data"
    dst="$HOME/.local/share/sconl/data/$sub"
    if [[ -d "$src" ]]; then
        ln -sfn "$src" "$dst"
        _ok "Symlinked: data/$sub → $sub/data"
    fi
done
for sub in journal notes; do
    src="$_ISCONL_ROOT/spark/data/$sub"
    dst="$HOME/.local/share/sconl/data/$sub"
    [[ -d "$src" ]] && ln -sfn "$src" "$dst" && _ok "Symlinked: data/$sub"
done

# ── SQLite database ───────────────────────────────────────────────────────────
_sec "SQLite database"
_DB_SETUP="$_XCORE_ROOT/calendar-core/core/sconl_db_setup.py"
if [[ -f "$_DB_SETUP" ]]; then
    python3 "$_DB_SETUP" --migrate
else
    printf '  (sconl_db_setup.py not found — copy it to calendar-core/core/ first)\n'
    printf '  Then run: python3 %s --migrate\n' "$_DB_SETUP"
fi

# ── Runtime env in .bashrc ────────────────────────────────────────────────────
_sec "Runtime env"
_EQ_PY="$_XCORE_ROOT/calendar-core/core/sconl_calendar/equicycle.py"
_CAL_PY="$_XCORE_ROOT/calendar-core/core/sconl_calendar/calendar_data.py"
_XSPACE_RT="$_XCORE_ROOT/xspace"

if ! grep -qF "_EQUICYCLE_PY" "$_RC" 2>/dev/null; then
cat >> "$_RC" << ENVEOF

# sconl runtime env
export _EQUICYCLE_PY="$_EQ_PY"
export _CAL_PY="$_CAL_PY"
export _XSPACE_ROOT="$_XSPACE_RT"
ENVEOF
    _add "Runtime env vars added to .bashrc"
else
    _ok "Runtime env already in .bashrc"
fi

# ── Final summary ─────────────────────────────────────────────────────────────
_sec "Done"
printf '  %-20s %s\n' "isconl suite:"    "scope  space  spark  hub"
printf '  %-20s %s\n' "xcorekit tools:"  "git-core  bash-core  calendar-core  animate-core"
printf '  %-20s %s\n' "data dir:"        "$HOME/.local/share/sconl/data"
printf '  %-20s %s\n' "database:"        "$HOME/.local/share/sconl/sconl.db"
printf '  %-20s %s\n' "tenant config:"   "$HOME/.config/sconl/tenant.toml"
printf '\n  Next steps:\n'
printf '    source ~/.bashrc\n'
printf '    isconl --version\n'
printf '    iscope inbox\n\n'
