#!/usr/bin/env bash
# health-check.sh — report which reach platforms are usable right now.
# Reads {} on stdin, returns {"report": "..."} on stdout.
set -uo pipefail
cat >/dev/null 2>&1 || true
export PATH="$HOME/.local/bin:$PATH"

line() { command -v "$1" >/dev/null 2>&1 && echo "$2: ready ($1)" || echo "$2: MISSING ($1 not installed)"; }

{
  line curl     'Web page (Jina)'
  line mcporter 'Web search (Exa)'
  line gh       'GitHub'
  line yt-dlp   'YouTube'
  line twitter  'Twitter/X'
  line opencli  'Reddit / Facebook / Instagram (OpenCLI)'
  echo 'Note: Web + Exa + LinkedIn-public need no login; Twitter/Reddit/FB/IG reuse local Chrome sessions.'
} | python3 -c 'import sys,json; print(json.dumps({"report": sys.stdin.read().rstrip()}))'
