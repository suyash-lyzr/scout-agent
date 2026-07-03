#!/usr/bin/env bash
# Scout — one-command setup. Idempotent; safe to re-run.
# Installs the runtime + checks the fetch tools, then tells you what's left.
set -uo pipefail
cd "$(dirname "$0")"

say()  { printf "\n\033[1;36m▸ %s\033[0m\n" "$1"; }
ok()   { printf "  \033[32m✓\033[0m %s\n" "$1"; }
warn() { printf "  \033[33m!\033[0m %s\n" "$1"; }

say "Scout setup"

# ── 1. Runtime prerequisites ──────────────────────────────────
if command -v node >/dev/null 2>&1; then ok "Node $(node -v)"; else
  warn "Node.js 18+ is required — install from https://nodejs.org and re-run"; exit 1; fi

if command -v gitclaw >/dev/null 2>&1; then ok "gitclaw present"; else
  say "Installing gitclaw (the GitAgent runtime)…"
  npm install -g gitclaw && ok "gitclaw installed" || warn "npm install -g gitclaw failed — install manually"; fi

# ── 2. Config ─────────────────────────────────────────────────
if [ -f .env ]; then ok ".env exists"; else
  cp .env.example .env && ok "created .env — add your ANTHROPIC_API_KEY or OPENAI_API_KEY"; fi

# ── 3. Zero-config fetch tools (Web · Search · YouTube · GitHub) ─
say "Zero-config platforms (work with no login)"
command -v curl   >/dev/null 2>&1 && ok "curl      → web pages (via Jina Reader)" || warn "curl missing"
command -v gh     >/dev/null 2>&1 && ok "gh        → GitHub"                       || warn "gh missing        → https://cli.github.com"
command -v yt-dlp >/dev/null 2>&1 && ok "yt-dlp    → YouTube"                      || warn "yt-dlp missing    → pip install yt-dlp  (or brew install yt-dlp)"
command -v mcporter >/dev/null 2>&1 && ok "mcporter → Exa web search"             || warn "mcporter missing  → npm i -g mcporter, then add the Exa backend (see README)"

# ── 4. Optional session-backed tools (Twitter · Reddit · FB · IG) ─
say "Optional platforms (reuse your logged-in browser sessions)"
command -v twitter >/dev/null 2>&1 && ok "twitter-cli → Twitter/X"          || warn "twitter-cli missing (optional) — see README ▸ Session-backed platforms"
command -v opencli >/dev/null 2>&1 && ok "opencli     → Reddit / FB / IG"   || warn "opencli missing (optional)     — see README ▸ Session-backed platforms"

# ── 5. Done ───────────────────────────────────────────────────
say "Next steps"
echo "  1. Put an Anthropic OR OpenAI key in .env"
echo "  2. node ui/server.js        → open http://localhost:4545"
echo "     (or: gitclaw --dir . \"what's trending on r/LocalLLaMA?\")"
echo ""
ok "Out of the box, the 4 zero-config platforms above work immediately."
echo "  Add the optional tools any time to unlock Twitter / Reddit / Facebook / Instagram."
