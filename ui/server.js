// Scout — minimal streaming chat UI server.
// Pure Node built-ins, no dependencies. Spawns the `gitclaw` CLI (already on the
// forker's PATH) against this agent dir and streams the response to the browser.
//
//   node ui/server.js         → http://localhost:4545
//
// Portable by design: needs only `gitclaw` on PATH + the repo's .env (API keys).
import http from 'node:http';
import { spawn } from 'node:child_process';
import { readFileSync, createReadStream, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const AGENT_DIR = resolve(__dirname, '..');            // repo root = the agent
const PORT = Number(process.env.SCOUT_UI_PORT) || 4545;

// Build the child env: load .env, ensure reach tools (~/.local/bin) are on PATH.
function agentEnv() {
  const env = { ...process.env };
  try {
    for (const line of readFileSync(join(AGENT_DIR, '.env'), 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch { /* no .env — user may have keys exported already */ }
  // Put every reach-tool location ahead of system paths so the agent uses the
  // correct binaries (e.g. the venv yt-dlp, not a broken system one).
  env.PATH = [`${env.HOME}/.agent-reach-venv/bin`, `${env.HOME}/.local/bin`,
    `${env.HOME}/.npm-global/bin`, '/opt/homebrew/bin', env.PATH || ''].join(':');
  return env;
}

const stripAnsi = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');

// GitClaw's built-in `skill_learner` sometimes writes malformed YAML into a skill's
// frontmatter (stray "- ..." list items, learner bookkeeping keys). That makes the
// WHOLE agent fail to load → every query returns empty ("Done."). Repair it before
// each run: in a SKILL.md frontmatter there are no legitimate list items, so any
// line starting with "- " (or a known learner key) is corruption and gets dropped.
const LEARNER_KEY = /^\s*(confidence|usage_count|success_count|failure_count|negative_examples|examples|last_used|reinforcement)\s*:/;
function sanitizeSkills() {
  let fixed = 0;
  try {
    const skdir = join(AGENT_DIR, 'skills');
    for (const name of readdirSync(skdir)) {
      const f = join(skdir, name, 'SKILL.md');
      let s; try { s = readFileSync(f, 'utf8'); } catch { continue; }
      const m = s.match(/^---\n([\s\S]*?)\n---/);
      if (!m) continue;
      const fm = m[1];
      const cleaned = fm.split('\n').filter((l) => !/^\s*-\s/.test(l) && !LEARNER_KEY.test(l)).join('\n');
      if (cleaned !== fm) { writeFileSync(f, s.replace(fm, cleaned)); fixed++; }
    }
  } catch { /* best-effort */ }
  return fixed;
}

// Strip leading env-setup segments (export .../cd .../source ... joined by && or ;)
// so a compound like `export PATH=... && twitter search "..."` maps to the REAL tool.
function realCmd(cmd) {
  let c = cmd;
  for (;;) {
    const m = c.match(/^\s*(export\s+[^&;|]+|cd\s+[^&;|]+|source\s+[^&;|]+|set\s+[^&;|]+|\.\s+[^&;|]+)\s*(&&|;)\s*/i);
    if (!m) break;
    c = c.slice(m[0].length);
  }
  return c.trim();
}
// Map a raw shell command → a friendly "thinking" step (platform + label).
function stepFor(cmd) {
  const c = cmd.toLowerCase();
  if (/^gh\b/.test(c))              return { platform: 'github',    label: 'Searching GitHub' };
  if (/^twitter\b/.test(c))         return { platform: 'twitter',   label: 'Searching Twitter/X' };
  if (/opencli\s+reddit/.test(c))   return { platform: 'reddit',    label: 'Browsing Reddit' };
  if (/opencli\s+facebook/.test(c)) return { platform: 'facebook',  label: 'Browsing Facebook' };
  if (/opencli\s+instagram/.test(c))return { platform: 'instagram', label: 'Browsing Instagram' };
  if (/r\.jina\.ai|linkedin/.test(c))return { platform: 'web',      label: 'Reading web page' };
  if (/mcporter|exa/.test(c))       return { platform: 'search',    label: 'Searching the web' };
  if (/yt-dlp|youtube/.test(c))     return { platform: 'youtube',   label: 'Fetching YouTube' };
  return { platform: 'shell', label: 'Running ' + (cmd.split(/\s+/)[0] || 'command') };
}
// GitClaw CLI boilerplate we don't want in the chat bubble.
const SKIP = /^(Compliance warnings|\s*⚠|scout v\d|Model:|Tools:|Skills:|Type \/|Task started:|Objective:|No matching skills|Step \d+ recorded:|Task [0-9a-f-]{6,}|Skill ".*" confidence|Consider calling skill_learner|Skill loaded\.)/;
// Raw upstream-tool noise that must never reach the chat bubble (Jina page headers,
// scraped login-form fields, bare tool-failure markers).
const JUNK = /^([×✗x]?\s*cli failed|feed_failed|\(no output\)|[×✗]\s|URL Source:|Markdown Content:|Title:\s|Published Time:|Log ?in(to Facebook)?\s*$|Log into Facebook|Email or mobile number|^Password\s*$|Forgotten (account|password)\??|Create new account|Explore the things you love|\[[ x]\]\s*$|See more on Facebook)/i;

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store, must-revalidate' });
    createReadStream(join(__dirname, 'index.html')).pipe(res);
    return;
  }
  // local static assets (motion.js, etc.) — same dir only
  if (req.method === 'GET' && /^\/[\w.-]+\.(js|css)$/.test(req.url)) {
    const f = join(__dirname, req.url.slice(1));
    if (f.startsWith(__dirname)) {
      try { readFileSync(f); res.writeHead(200, { 'Content-Type': req.url.endsWith('.css') ? 'text/css' : 'text/javascript' }); createReadStream(f).pipe(res); return; }
      catch { /* fall through to 404 */ }
    }
  }

  if (req.method === 'POST' && req.url === '/api/chat') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      let message = '';
      try { message = (JSON.parse(body).message || '').trim(); } catch {}
      if (!message) { res.writeHead(400).end('{}'); return; }

      res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-cache' });
      const send = (obj) => res.write(JSON.stringify(obj) + '\n');
      let sentChars = 0, capped = false;               // guard against a runaway/looping agent flooding the client

      const repaired = sanitizeSkills();               // heal any skill_learner YAML corruption first
      if (repaired) console.log(`  [heal] repaired ${repaired} skill file(s) before run`);
      const child = spawn('gitclaw', ['--dir', AGENT_DIR, message], { env: agentEnv() });

      let buf = '';
      const emit = (line) => {
        if (SKIP.test(line) || JUNK.test(line)) return;
        const tool = line.match(/^▶\s*(\w+)\((.*)\)\s*$/);       // ▶ cli(command: gh ...)
        if (tool) {
          // Only surface the real internet fetches (`cli`) as friendly "thinking" steps.
          if (tool[1] === 'cli') { const cmd = realCmd(tool[2].replace(/^command:\s*/, ''));
            if (cmd && !/^\s*(export|cd|source|ls|echo|date|which|pwd|set|:|true|printf|mkdir)\b/.test(cmd)) send({ type: 'step', ...stepFor(cmd) }); }
          return;
        }
        if (/^--+\s*$/.test(line)) return;                        // stray separators
        // Drop raw intermediate tool output (JSON/HTML/frontmatter/tab-separated dumps);
        // keep the model's prose answer + progress narration.
        const raw = /\t/.test(line)                                // tab-separated CLI output (gh, twitter)
          || /^\s*[\[{"]/.test(line) || /^\s*---/.test(line) || /^\s*<\/?[a-z!]/i.test(line)
          || /^(name|description|license|allowed-tools|metadata|category|risk_tier|ports|author|version|id|text|score|likes|rts|url|time|comments|screenName|username|play|danmaku|bvid):/i.test(line)
          || /^\s{2,}["'\-]/.test(line);
        if (raw) return;
        if (capped) return;
        sentChars += line.length + 1;
        if (sentChars > 500000) { capped = true; send({ type: 'text', content: '\n\n_…response truncated (too long)_\n' }); try { child.kill(); } catch {} return; }
        send({ type: 'text', content: line + '\n' });
      };
      const flush = (final = false) => {
        buf = stripAnsi(buf);
        let idx;
        while ((idx = buf.indexOf('\n')) >= 0) { emit(buf.slice(0, idx)); buf = buf.slice(idx + 1); }
        if (final && buf.trim()) { emit(buf); buf = ''; }
      };

      child.stdout.on('data', (d) => { buf += d.toString(); flush(); });
      child.stderr.on('data', () => { /* swallow debug noise */ });
      child.on('close', (code) => { flush(true); send({ type: 'done', code }); res.end(); });
      child.on('error', (e) => { send({ type: 'text', content: `Error launching gitclaw: ${e.message}\n` }); send({ type: 'done' }); res.end(); });
      // Kill the child only if the client actually disconnects mid-response.
      res.on('close', () => { if (!res.writableEnded) child.kill(); });
    });
    return;
  }

  res.writeHead(404).end('not found');
});

sanitizeSkills();   // heal any corruption left from a previous session on boot
server.listen(PORT, () => console.log(`\n  👁️  Scout UI  →  http://localhost:${PORT}\n  agent: ${AGENT_DIR}\n`));
