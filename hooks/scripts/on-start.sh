#!/usr/bin/env bash
# on-start.sh — Scout session init.
# Ensures reach tools are reachable and records a one-line session note.
set -euo pipefail
INPUT=$(cat)

# Reach tools (opencli wrapper, twitter, etc.) live here on this deployment.
export PATH="$HOME/.local/bin:$PATH"

# Non-fatal health note (fail_open: true — never blocks the session).
note="reach: PATH ok"
command -v opencli   >/dev/null 2>&1 && note="$note; opencli ok"   || note="$note; opencli missing"
command -v twitter   >/dev/null 2>&1 && note="$note; twitter ok"   || note="$note; twitter missing"
command -v gh        >/dev/null 2>&1 && note="$note; gh ok"        || note="$note; gh missing"
command -v yt-dlp    >/dev/null 2>&1 && note="$note; yt-dlp ok"    || note="$note; yt-dlp missing"
command -v mcporter  >/dev/null 2>&1 && note="$note; exa ok"       || note="$note; exa missing"

>&2 echo "[scout] $note"
echo '{"action": "allow", "modifications": null}'
