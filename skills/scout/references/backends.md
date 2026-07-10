# Backends & retry chains

Each platform routes through an ordered backend list (primary ▸ fallback).
Like Agent Reach: switching a backend = reordering, not rewriting.

| Platform | Primary | Fallback | Auth model |
|---|---|---|---|
| Web page | Jina Reader (`r.jina.ai`) | — | none (public relay) |
| Web search | Exa via `mcporter` | — | none (free hosted) |
| GitHub | `gh` CLI | — | none (public) · `gh auth login` for full |
| YouTube | `yt-dlp` | — | none (public page scrape) |
| Twitter/X | Xquik REST API (when `XQUIK_API_KEY` is set) | `twitter-cli`, then OpenCLI | API key or local Chrome cookie (burner) |
| Reddit | OpenCLI | rdt-cli | local Chrome session |
| Facebook | OpenCLI | — | local Chrome session |
| Instagram | OpenCLI | — | local Chrome session |
| LinkedIn | Jina (public) | linkedin-scraper-mcp | none for public; login for deep |

## Known environment fixes (this deployment)

### Xquik — optional API key

Xquik provides structured read routes for search, tweet details, and account
timelines. Use it only when `XQUIK_API_KEY` is already set. Keys beginning with
`xq_` use the `x-api-key` header. Never echo the key or place it in a command
history entry as a literal value. A missing key is a normal signal to continue
with `twitter-cli`; it is not an error to retry.

### OpenCLI — daemon port env conflict
The OpenCLIApp shim injects `OPENCLI_DAEMON_PORT`, which opencli >=1.8 rejects,
so every `opencli` command fails. Fix in place: a wrapper at `~/.local/bin/opencli`
strips the var and calls the bundled CLI directly. `~/.local/bin` is prepended to
PATH. If OpenCLI ever "fails to start / reconnecting", verify the wrapper wins:
`command -v opencli` → should be `~/.local/bin/opencli`.
(Upstream: jackwener/OpenCLI#2068 · fix: Panniantong/Agent-Reach#465)

### Twitter — burner account pin
`twitter-cli` reads the local Chrome cookie. It is pinned to a burner account so
the user's main account is never used:
```
export TWITTER_BROWSER=chrome
export TWITTER_CHROME_PROFILE="Default"    # profile holding the burner
```
Verify with `twitter whoami` → burner handle, never the main account.

## Failure → cause cheat sheet

| Symptom | Likely cause | Action |
|---|---|---|
| `opencli` hangs / "reconnecting" | daemon/extension not connected, or PATH shim | check wrapper + `opencli doctor` |
| Xquik returns 401/403 | missing, expired, or unauthorized API key | use the local-cookie fallback; do not retry with the same response |
| Reddit/FB/IG empty or "no rows" | user not logged into that site in Chrome | ask user to log in once |
| Twitter account returns empty | account private/deleted/renamed | note it, move on |
| `gh` asks to auth | full API needs login | `gh auth login` (public search still works) |
| YouTube warnings but metadata returns | JS challenge / ffmpeg missing | usually fine for info/subs |
