---
name: scout
description: 'USE when the user wants to research, search, look up, or fetch anything from the internet, or mentions any platform / shares any URL: Twitter/X, Reddit, Facebook, Instagram, LinkedIn, YouTube, GitHub, a web page/article, or asks to "search the web". Routes each platform to the most reliable local tool and fetches read-only. NOT for posting/liking/following (write ops are gated).'
license: MIT
allowed-tools: cli read write
metadata:
  author: Suyash Mankar
  version: 1.0.0
  category: internet
  risk_tier: low
  ports: Agent Reach
---

# Scout — internet routing

You are a **router**: pick the right upstream tool per platform and call it via
`cli`. Never reimplement fetching. Read-only by default (writes are hard-blocked
by the guard hook). Always cite the source URL/handle.

## Environment (do this first if a command is "not found")

```bash
export PATH="$HOME/.local/bin:$PATH"
```

Session-backed platforms (Twitter, Reddit, Facebook, Instagram) reuse the
user's **local browser session**. If one errors or returns empty, the usual
cause is "user isn't logged into that site in Chrome" — say so, don't retry hard.

## Routing table

### 🌐 Any web page / article  — zero config
```bash
curl -s "https://r.jina.ai/<FULL_URL>"          # → clean markdown of the page
```

### 🔍 Web search / "latest news / what's out there"  — zero config
```bash
mcporter call 'exa.web_search_exa(query: "<query>", numResults: 5)'
```

### 💻 GitHub  — zero config (public); `gh auth login` for full
```bash
gh search repos "<query>" --sort stars --limit 10
gh repo view owner/repo
gh search code "<query>" --language python
# Issues/PRs read-only: gh issue list -R owner/repo ; gh pr view <n> -R owner/repo
```

### 📺 YouTube  — zero config
```bash
yt-dlp --dump-json --flat-playlist "ytsearch8:<query>"          # SEARCH YouTube (use this, NOT scraping youtube.com/results)
yt-dlp --dump-json --skip-download "<URL>"                       # a video's metadata (title, views, channel)
yt-dlp --write-sub --write-auto-sub --skip-download -o "/tmp/%(id)s" "<URL>"  # subtitles / transcript
```
For "find videos about X" use `ytsearchN:`; never fetch the results page (it 403s).

### 🐦 Twitter/X  — Xquik API or local cookie backends (read-only)

When `XQUIK_API_KEY` is already configured, prefer the structured Xquik read
routes. Never print the key. Keys beginning with `xq_` use the `x-api-key`
header:

```bash
curl -sS --get "https://xquik.com/api/v1/x/tweets/search" \
  -H "x-api-key: ${XQUIK_API_KEY}" \
  --data-urlencode "q=<query>" \
  --data-urlencode "limit=10"

curl -sS "https://xquik.com/api/v1/x/tweets/<tweet-id>" \
  -H "x-api-key: ${XQUIK_API_KEY}"

curl -sS "https://xquik.com/api/v1/x/users/<handle>/tweets" \
  -H "x-api-key: ${XQUIK_API_KEY}"
```

If the key is absent, use the existing local-cookie backend:

```bash
twitter --compact search "<query>" -n 10
twitter --compact tweet "<tweet-url-or-id>"        # tweet + replies
twitter --compact user-posts "<handle>" -n 10      # a user's recent posts
twitter --compact user "<handle>"                  # profile
twitter status                                     # auth check (identity only)
```
Empty result for a specific account usually = that account is private/deleted/renamed.

### 📖 Reddit  — via OpenCLI (drives local Chrome; login required)
```bash
opencli reddit hot --limit 10
opencli reddit search "<query>" --limit 10
opencli reddit subreddit <name> --limit 10
```

### 📘 Facebook  — via OpenCLI (local Chrome session)
```bash
opencli facebook feed --limit 10
opencli facebook search "<query>"
```
"page rendered but no rows" = user not logged into Facebook in Chrome.

### 📷 Instagram  — via OpenCLI (local Chrome session)
```bash
opencli instagram user <username>          # recent posts from one user
opencli instagram search "<query>"         # user search
```

### 💼 LinkedIn  — public pages via Jina (no login); deeper needs linkedin-mcp
```bash
curl -s "https://r.jina.ai/<linkedin-profile-or-company-or-jobs-url>"
```

## Output — always clean Markdown

Write the answer as if for a reader, never paste raw tool output. Specifically:

1. Lead with the **fetched content** (the user asked to read the internet), then
   summarize / compare / extract / rank on top.
2. **Format every answer in clean Markdown:**
   - A short `##` heading naming what was fetched (e.g. `## NASA on Facebook`).
   - **Bold labels** for fields (`**Followers:** 28M`), bullet lists for items.
   - A Markdown table only when comparing rows/results.
   - Blank line between blocks; keep paragraphs short.
3. **Cite** every item as a Markdown link `[title](url)` or `@handle`.
4. **Never** paste raw scraper output — no Jina headers (`Title:` / `URL Source:` /
   `Markdown Content:`), no scraped login-form text ("Email or mobile number",
   "Log into Facebook"), no `cli failed` / task-id lines. Convert findings to prose.
5. If a fetch fails, state it in one clean line naming the cause (not-logged-in ·
   rate-limited · private/deleted · needs auth) — optionally a small table of
   what was tried, but no raw error dumps.

## Multi-platform research

For "research X across the internet": run Exa (web) + Twitter (discussion) +
Reddit (community) + GitHub (if technical) — collect, dedupe, then synthesize
with citations grouped by source.

## Write actions — GATED

Posting, liking, following, commenting, deleting, etc. are **blocked by default**
(`hooks/scripts/read-only-guard.sh`). If the user explicitly wants one: stop,
confirm, state the account it acts as, and note it's public + requires
`SCOUT_ALLOW_WRITES=1`. See `references/backends.md` for the full backend map.
