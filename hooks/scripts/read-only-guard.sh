#!/usr/bin/env bash
# read-only-guard.sh — Scout governance hook (pre_tool_use).
#
# Reads the tool-call JSON on stdin. If it's a `cli` command that performs a
# WRITE action on any reach platform, it is BLOCKED — unless the operator has
# explicitly opted in with SCOUT_ALLOW_WRITES=1.
#
# Returns JSON: {"action":"allow"} or {"action":"block","reason":"..."}.
# This is what turns "read-only by default" from a suggestion into a guarantee.

set -euo pipefail
payload="$(cat)"

# Escape hatch: operator explicitly allows writes for this session.
if [ "${SCOUT_ALLOW_WRITES:-0}" = "1" ]; then
  printf '{"action":"allow"}'
  exit 0
fi

# Extract the shell command from the tool payload (best-effort, no jq dependency).
# GitClaw uses `tool`; retain `toolName` as a fallback for older runtimes.
tool="$(printf '%s' "$payload" | sed -n 's/.*"tool"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)"
if [ -z "$tool" ]; then
  tool="$(printf '%s' "$payload" | sed -n 's/.*"toolName"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)"
fi
cmd="$(printf '%s' "$payload"  | sed -n 's/.*"command"[[:space:]]*:[[:space:]]*"\(.*\)".*/\1/p'  | head -1)"

# Only police the cli tool; everything else passes.
if [ "$tool" != "cli" ]; then
  printf '{"action":"allow"}'
  exit 0
fi

# A cli payload without a readable command cannot be classified safely.
if [ -z "$cmd" ]; then
  printf '{"action":"block","reason":"Blocked by Scout: missing CLI command. Read-only policy could not classify this request."}'
  exit 0
fi

lc="$(printf '%s' "$cmd" | tr '[:upper:]' '[:lower:]')"

# Write-action verbs across twitter-cli / opencli / gh.
# Word-boundary-ish match to avoid catching substrings like "following.json".
write_re='(^|[[:space:]])(post|tweet|reply|quote|retweet|unretweet|like|unlike|favorite|unfavorite|follow|unfollow|bookmark|unbookmark|delete|remove|comment|upvote|downvote|save|publish|send|dm)([[:space:]]|$)'

if printf '%s' "$lc" | grep -Eq "$write_re"; then
  printf '{"action":"block","reason":"Blocked by Scout: CLI command looks like a write action. Confirm with the user and set SCOUT_ALLOW_WRITES=1 to allow it."}'
  exit 0
fi

printf '{"action":"allow"}'
