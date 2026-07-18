#!/usr/bin/env bash
set -euo pipefail

guard="$(cd "$(dirname "$0")" && pwd)/read-only-guard.sh"

assert_action() {
  expected="$1"
  payload="$2"
  output="$(printf '%s' "$payload" | "$guard")"
  node -e '
    const output = JSON.parse(process.argv[1]);
    if (output.action !== process.argv[2]) {
      throw new Error("expected " + process.argv[2] + ", received " + output.action);
    }
  ' "$output" "$expected"
}

assert_action block '{"event":"pre_tool_use","tool":"cli","args":{"command":"twitter post \"hello\""}}'
assert_action block '{"event":"pre_tool_use","toolName":"cli","args":{"command":"twitter like 123"}}'
assert_action block '{"event":"pre_tool_use","tool":"cli","args":{}}'
assert_action allow '{"event":"pre_tool_use","tool":"cli","args":{"command":"twitter search \"agent safety\""}}'
assert_action allow '{"event":"pre_tool_use","tool":"read","args":{"path":"README.md"}}'

override_output="$(
  printf '%s' '{"event":"pre_tool_use","tool":"cli","args":{"command":"twitter post \"approved\""}}' |
    SCOUT_ALLOW_WRITES=1 "$guard"
)"
node -e '
  const output = JSON.parse(process.argv[1]);
  if (output.action !== "allow") {
    throw new Error("expected override to allow, received " + output.action);
  }
' "$override_output"

printf 'read-only guard fixtures passed\n'
