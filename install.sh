#!/usr/bin/env bash
# hub/install.sh — isconl master installer
# Usage:
#   ./install.sh           → installs hub only (PATH + symlinks)
#   ./install.sh --full    → installs entire isconl suite + xcorekit
# ─────────────────────────────────────────────────────────────────────────────
# CHANGELOG (newest first)
# ─────────────────────────────────────────────────────────────────────────────
#   2026-05-03  Initial — hub-only + --full flag for complete suite
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
_BIN="$_ROOT/cli/bin"
_USER_BIN="${HOME}/bin"
_RC="${HOME}/.bashrc"
_ISCONL_ROOT="$(cd "$_ROOT/.." && pwd)"         # iSconl/
_GITHUB_ISCONL="git@github.com:isconl"
_GITHUB_XCOREKIT="git@github.com:xcorekit"
_FULL="${1:-}"

printf '\n  isconl hub install\n  ──────────────────\n\n'

# ── Helper: clone or pull ─────────────────────────────────────────────────────
_install_repo() {
    local org="$1" repo="$2" dir="$3"
    printf '  [%s]\n' "$repo"
    if [[ -d "$dir/.git" ]]; then
        git -C "$dir" pull --rebase origin main 2>/dev/null || \
            printf '    ! pull failed — continuing\n'
    else
        git clone "$org/$repo.git" "$dir" --quiet
    fi
    [[ -f "$dir/install.sh" ]] && bash "$dir/install.sh"
    printf '\n'
}

# ── Always: set up shared libs ────────────────────────────────────────────────
printf '  Setting up shared libs...\n'
mkdir -p ~/.local/lib/sconl ~/.config/sconl ~/.local/share/sconl

# Copy shared libs if not present (sourced by all binaries)
for lib in ui.sh db.sh events.sh; do
    [[ ! -f "$HOME/.local/lib/sconl/$lib" ]] && \
        [[ -f "$_ROOT/../scope/cli/lib/scope.sh" ]] && \
        printf '  ! shared lib missing: %s — run scope/install.sh first\n' "$lib"
done

# ── Always: install hub binary ────────────────────────────────────────────────
mkdir -p "$_USER_BIN"
chmod +x "$_BIN"/*

if ! grep -qF "$_BIN" "$_RC" 2>/dev/null; then
    printf '\n# isconl/hub\nexport PATH="$PATH:%s"\n' "$_BIN" >> "$_RC"
    printf '  +  Added hub to PATH\n'
else
    printf '  ✓  hub already in PATH\n'
fi

for f in "$_BIN"/*; do
    ln -sf "$f" "$_USER_BIN/$(basename "$f")"
    printf '  ~  Linked: %s\n' "$(basename "$f")"
done

# ── --full: install everything ────────────────────────────────────────────────
if [[ "$_FULL" == "--full" ]]; then
    printf '\n  Installing full isconl suite...\n\n'

    # Generate tenant config if missing
    if [[ ! -f "$HOME/.config/sconl/tenant.toml" ]]; then
        printf '  Generating tenant config...\n'
        python3 -c "
import uuid, tomli_w
from pathlib import Path
from datetime import date
home = Path.home()
config = {
    'tenant': {'id': str(uuid.uuid4()), 'name': '', 'created': str(date.today()),
               'data_dir': str(home / '.local/share/sconl/data')},
    'systems': {
        'scope_dir': str(home / '.local/share/sconl/data/scope'),
        'space_dir': str(home / '.local/share/sconl/data/space'),
        'spark_dir': str(home / '.local/share/sconl/data/spark'),
    },
    'libs': {'shared_lib_dir': str(home / '.local/lib/sconl')},
    'agent': {'enabled': False, 'model': 'claude-sonnet-4-20250514', 'endpoint': ''},
    'privacy': {'local_only': True},
    'calendar': {'regions': ['KE', 'INT']},
    'database': {'local_db': str(home / '.local/share/sconl/sconl.db'),
                 'db_type': 'sqlite', 'cloud_db': '', 'sync_enabled': False},
}
Path.home().joinpath('.config/sconl').mkdir(parents=True, exist_ok=True)
with open(home / '.config/sconl/tenant.toml', 'wb') as f:
    tomli_w.dump(config, f)
print('  ✓ tenant.toml created')
" 2>/dev/null || printf '  ! tomli_w not installed: pip install tomli-w\n'
    fi

    # isconl systems
    _install_repo "$_GITHUB_ISCONL" "scope" "$_ISCONL_ROOT/scope"
    _install_repo "$_GITHUB_ISCONL" "space" "$_ISCONL_ROOT/space"
    _install_repo "$_GITHUB_ISCONL" "spark" "$_ISCONL_ROOT/spark"

    # xcorekit tools (calendar-core required for equicycle)
    _XCORE="$(cd "$_ISCONL_ROOT/../XCore" 2>/dev/null && pwd)" || \
        _XCORE="$HOME/_/engineer-systems/Systems/XCore"
    mkdir -p "$_XCORE"
    _install_repo "$_GITHUB_XCOREKIT" "calendar-core"  "$_XCORE/calendar-core"
    _install_repo "$_GITHUB_XCOREKIT" "bash-core"      "$_XCORE/bash-core"
    _install_repo "$_GITHUB_XCOREKIT" "git-core"       "$_XCORE/git-core"

    # Export runtime env to .bashrc
    _ENV_BLOCK="# sconl runtime env"
    if ! grep -qF "$_ENV_BLOCK" "$_RC" 2>/dev/null; then
cat >> "$_RC" << ENVEOF

# sconl runtime env
export _EQUICYCLE_PY="$_XCORE/calendar-core/core/sconl_calendar/equicycle.py"
export _CAL_PY="$_XCORE/calendar-core/core/sconl_calendar/calendar_data.py"
export _XSPACE_ROOT="$HOME/_/engineer-systems/Systems/XCore/xspace"
ENVEOF
        printf '  +  Runtime env vars added to .bashrc\n'
    fi

    # Initialize local SQLite db
    printf '  Initializing local database...\n'
    python3 "$_ROOT/../scope/cli/lib/../../../XCore/calendar-core/core/sconl_calendar/equicycle.py" \
        --format short 2>/dev/null && printf '  ✓  equicycle working\n' || true

    printf '\n  ✓  Full suite installed.\n'
fi

printf '\n  Run: source ~/.bashrc\n'
printf '  Then: isconl --version\n\n'
