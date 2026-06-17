# Jackson's Features — Added to tradingview-mcp-hermes

> **Sourced from:** [LewisWJackson/tradingview-mcp-jackson](https://github.com/LewisWJackson/tradingview-mcp-jackson)
> **Branch:** `feature/jackson-scalper-morning` (2 commits, 1271 lines)
> **Date ported:** 2026-06-17
> **Status:** ✅ All 54 tests pass — merged into Hermes fork

This document describes the features incorporated from LewisWJackson's fork, what each one does, and how to use them. It is meant to be the canonical reference for the Jackson additions — if a new team member asks "what did Jackson add?", point them here.

---

## Table of Contents

1. [Overview — What Was Added](#overview--what-was-added)
2. [Feature 1: Morning Brief System](#feature-1-morning-brief-system)
3. [Feature 2: Scalper Engine (XRP/BTC 10-second loop)](#feature-2-scalper-engine-xrpbtc-10-second-loop)
4. [Feature 3: Security Validation](#feature-3-security-validation)
5. [Feature 4: Trading Rules Config (`rules.json`)](#feature-4-trading-rules-config-rulesjson)
6. [Feature 5: CLI Integration (`tv brief` / `tv session`)](#feature-5-cli-integration-tv-brief--tv-session)
7. [Feature 6: .env / Secrets Hardening (`.gitignore`)](#feature-6-env--secrets-hardening-gitignore)
8. [Architecture — Where Each Piece Lives](#architecture--where-each-piece-lives)
9. [Testing — 32 New Tests, 54/54 Passing](#testing--32-new-tests-5454-passing)
10. [Quick Start — First-Time Use](#quick-start--first-time-use)
11. [Troubleshooting](#troubleshooting)
12. [What Was NOT Ported (and Why)](#what-was-not-ported-and-why)

---

## Overview — What Was Added

Jackson's fork added a daily-trading workflow on top of iliaal's MCP toolkit. The pieces are:

| # | Feature | Type | Where it lives | Why it matters |
|---|---------|------|----------------|----------------|
| 1 | **Morning Brief** | Workflow | `src/core/morning.js` + `src/tools/morning.js` + `src/cli/commands/morning.js` | One command scans your watchlist and returns a session bias |
| 2 | **Scalper Engine** | Trading bot | `scalper-run.js` | Automated 10-second momentum scalper on BitGet |
| 3 | **Security Validation** | Hardening | `assertSafeRulesPath`, `assertSafeDate` in `src/core/morning.js` | Path-traversal + date-injection protection |
| 4 | **Rules Config** | Data | `rules.json` + `rules.example.json` | Declarative watchlist + bias criteria + risk rules |
| 5 | **CLI Integration** | UX | `src/cli/index.js` | `tv brief` and `tv session` as native subcommands |
| 6 | **.env Hardening** | Hygiene | `.gitignore` | `.env`, `.env.*`, `AGENTS.md` blocked from git |

**What was intentionally skipped:** animated SUBSCRIBE banner (marketing, no technical value).

---

## Feature 1: Morning Brief System

### What it is
A daily pre-market ritual. One command (`tv brief` or the `morning_brief` MCP tool) reads your `rules.json`, scans every symbol in your watchlist through TradingView's live charts, fetches current indicator values, and returns a structured dataset that Claude can turn into a session bias. The output is plain text and JSON-friendly so you can pipe it.

### Why it exists
Before Jackson's fork, generating a morning bias meant: open chart → check RSI → switch symbol → check RSI → repeat 8 times → manually write down a table. The morning brief automates the data collection and lets Claude do the synthesis (which is what Claude is for).

### How to use it

**From the CLI:**
```bash
# Run with the default rules.json in the project root
tv brief

# Use a custom rules file (must be in project or ~/.tradingview-mcp/)
tv brief --rules /home/me/.tradingview-mcp/my-rules.json
```

**From Claude Code (MCP):**
Ask Claude: *"Run my morning brief"*

**From any JS caller:**
```js
import { runBrief } from './src/core/morning.js';

const result = await runBrief({ rules_path: './rules.json' });
// result.watchlist   — array of { symbol, bias, indicators, levels }
// result.applied_rules — the rules.json criteria that were used
```

### What it returns (sample)
```
BTCUSD  | BIAS: Bearish  | KEY LEVEL: 94,200  | WATCH: RSI crossing 50 on 4H
ETHUSD  | BIAS: Neutral  | KEY LEVEL: 3,180   | WATCH: Ribbon direction on daily
SOLUSD  | BIAS: Bullish  | KEY LEVEL: 178.50  | WATCH: Hold above 20 EMA

Overall: Cautious session. BTC leading bearish, SOL the exception — watch for divergence.
```

### Implementation
- **`src/core/morning.js`** — the logic. Loads `rules.json` (with safety checks), iterates the watchlist, fetches `quote_get` + `data_get_study_values` for each symbol, formats the result.
- **`src/tools/morning.js`** — wraps `runBrief` as an MCP tool (`morning_brief`).
- **`src/cli/commands/morning.js`** — exposes it as `tv brief` and `tv session` subcommands.

---

## Feature 2: Scalper Engine (XRP/BTC 10-second loop)

### What it is
A standalone Node.js script that runs a momentum scalper on BitGet spot. Every 10 seconds, it checks the current price, calculates an RSI(3) and an EMA(8) cross, and either buys, sells, or holds — based on a fixed strategy written in `rules.json`. After 6 trades it stops and writes a `safety-check-log.json` summary.

### Why it exists
A demo strategy for the YouTube tutorial — proves that the MCP toolkit can drive a real exchange end-to-end (chart → indicator → order). Not intended for live trading without modification.

### How to use it

**Setup (one-time):**
```bash
# 1. Get your BitGet API credentials
# 2. Create .env in the project root with:
cat > .env <<'EOF'
BITGET_API_KEY=your_key_here
BITGET_SECRET_KEY=your_secret_here
BITGET_PASSPHRASE=your_passphrase_here
EOF

# 3. Make sure .env is in .gitignore (it is, after the Jackson patch)
```

**Run it:**
```bash
# Default: 6 trades × 10s on XRPUSDT
node scalper-run.js

# Custom rules file (currently fixed to rules.json in this version)
node scalper-run.js --rules ./my-scalper-rules.json
```

**Dry-run mode** (paper trades, no API calls):
```bash
node scalper-run.js --dry-run
```

### What it does, step by step
1. **Read `.env`** → loads API keys into `process.env` (gracefully no-ops if missing)
2. **Read `rules.json`** → loads `entry_rules`, `risk_rules`, `exit_rules`
3. **Loop 6 times, every 10 seconds:**
   - Fetch current XRPUSDT price
   - Calculate RSI(3) and EMA(8)
   - Compare to `entry_rules.long` / `entry_rules.short`
   - If signal matches → `placeOrder('buy'/'sell', size)`
   - On sell, use `placeSellWithRetry()` to handle BitGet's anti-wash-trade lock
4. **Write `safety-check-log.json`** → array of every decision, order, and outcome

### Key bit: `placeSellWithRetry` (the asset-locking fix)
BitGet locks newly-purchased assets against immediate resale. Jackson's fix retries the sell, parsing the actually-available amount from the error message:

```
🔒 Lock active — only 0.5 XRP tradeable. Retry 1/12 in 3s...
🔒 Lock active — only 0.5 XRP tradeable. Retry 2/12 in 3s...
✅ Order placed: sold 0.5 XRP
```

The `parseLockError()` regex extracts the available quantity:
```js
parseLockError("0.001234XRP can be used at most")
// → 0.001234
```

The retry gives up after 12 attempts (default) and reports failure. This is the single most useful code change in the scalper.

### Auto-execution guard
The script does **not** run when imported as a module (so tests can `import` it). It only runs when invoked directly:
```js
const isMainModule = process.argv[1] && (
  process.argv[1] === import.meta.filename ||
  process.argv[1].endsWith('/scalper-run.js')
);
if (isMainModule) { main().catch(...); }
```

---

## Feature 3: Security Validation

### What it is
Two pure functions in `src/core/morning.js` that validate user input before it touches the filesystem:
- `assertSafeDate(dateStr)` — rejects anything that isn't `YYYY-MM-DD`
- `assertSafeRulesPath(p)` — rejects paths that aren't inside the project or `~/.tradingview-mcp/`

### Why it exists
Both functions are called with values from the user (CLI args, MCP tool calls). Without them, a path like `--rules ../../etc/passwd` or `--date 2026/../sneaky` would let an attacker read or write files outside the intended scope.

### How they work

**`assertSafeDate`** — strict regex check:
```js
if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
  throw new Error(`Invalid date: ${dateStr}. Use YYYY-MM-DD (e.g. 2026-05-11).`);
}
```
Rejects: `2026/05/11`, `2026-5-11`, `2026-05-11\n../config`, `../etc/passwd`, empty string.

**`assertSafeRulesPath`** — allowlist check:
```js
const resolved = resolve(p);
const inProject = resolved.startsWith(PROJECT_ROOT + '/');
const inUserData = resolved.startsWith(USER_DATA_DIR + '/');
if (!inProject && !inUserData) {
  throw new Error(`rules_path must live inside the project (${PROJECT_ROOT}) or ~/.tradingview-mcp/. Got: ${resolved}`);
}
```
Rejects: `/etc/passwd`, `../passwd`, `null` (TypeError). Accepts: `./rules.json`, absolute path under project.

### Where they're called
- `assertSafeDate` — at the start of `saveSession()`, `getSession()`, anywhere a date is read from disk or input
- `assertSafeRulesPath` — at the start of `loadRules()` when an explicit path is given

### Test coverage
8 cases in `tests/morning.test.js::assertSafeDate` — covers path-traversal, wrong separators, non-padded, empty, partial, embedded newlines.
5 cases in `tests/morning.test.js::assertSafeRulesPath` — covers relative/absolute, system paths, parent traversal, null input.

---

## Feature 4: Trading Rules Config (`rules.json`)

### What it is
A single JSON file that declares your watchlist, your bias criteria, your entry/exit rules, and your risk rules. The morning brief reads it automatically. The scalper reads it to know when to enter/exit.

### File location
- `rules.json` (your actual config — **not** committed, see `.gitignore`)
- `rules.example.json` (template — committed, copy this to start)

### Structure
```json
{
  "watchlist": ["BTCUSDT", "ETHUSDT", "SOLUSDT"],

  "default_timeframe": "1",

  "strategy": {
    "name": "10-Second Momentum Scalper",
    "sources": ["Price momentum", "RSI filter"],
    "primary_timeframes": ["1-minute (signal source)", "10-second execution loop"]
  },

  "indicators": {
    "rsi_14": "Momentum filter. Only trade when RSI is between 30–70.",
    "price_momentum": "Compare last close vs previous close. Up = long, down = short."
  },

  "bias_criteria": {
    "bullish": ["Last 1-min candle closed higher than the one before it", "RSI is between 30 and 70"],
    "bearish": ["Last 1-min candle closed lower than the one before it", "RSI is between 30 and 70"],
    "neutral": ["RSI is above 70", "RSI is below 30", "Candle close change is less than 0.05%"]
  },

  "entry_rules": {
    "long":  ["Last close > previous close by at least 0.05%", "RSI between 30 and 70", "Enter market buy immediately"],
    "short": ["Last close < previous close by at least 0.05%", "RSI between 30 and 70", "Enter market sell immediately"]
  },

  "exit_rules": [
    "Exit automatically after 10 seconds (next loop tick closes previous position)",
    "No manual exit management — pure time-based scalp"
  ],

  "risk_rules": [
    "Fixed trade size: 1% of portfolio per trade",
    "Maximum trade size: $3.00",
    "Maximum 6 trades per 60-second run",
    "No stop loss — exit is time-based at next tick"
  ],

  "notes": "Demo strategy for YouTube video. For demo purposes only."
}
```

### How to start
```bash
cp rules.example.json rules.json
# Edit rules.json with your watchlist, criteria, and rules
tv brief   # test it
```

### How it's loaded
`loadRules(rulesPath)` in `src/core/morning.js`:
1. If `rulesPath` given, validate via `assertSafeRulesPath`
2. Try `[rulesPath, PROJECT_ROOT/rules.json, ~/.tradingview-mcp/rules.json]` in order
3. Return `{ path, rules }` of the first one that exists, or `null` if none

---

## Feature 5: CLI Integration (`tv brief` / `tv session`)

### What it is
Two new top-level subcommands on the `tv` CLI:
- `tv brief` — run morning brief
- `tv session get` / `tv session save` — read/write daily session brief

### Why it exists
Lets you run the morning brief from the terminal (no Claude needed) and pipe it to other tools. Also makes the features testable via the standard CLI test pattern (`execFileSync('node', [CLI, 'brief', '--help'])`).

### Usage
```bash
# Show all subcommands
tv --help | grep -E 'brief|session'
# → brief       Run your morning brief — scan watchlist, read indicators, apply your rules
# → session     Get or save a session brief  [get, save]

# Run morning brief
tv brief
tv brief --rules /custom/path.json
tv brief -h        # short help

# Session management
tv session get                    # get today's brief
tv session save --brief "..."     # save a brief
tv session -h                     # show subcommands
```

### Where the wiring lives
- **`src/cli/commands/morning.js`** — defines `program.command('brief')` and `program.command('session')` using Commander.js (matches the rest of the CLI's style)
- **`src/cli/index.js`** — `import './commands/morning.js'` registers the commands at startup
- **`src/server.js`** — `import('./tools/morning.js')` and `registerMorningTools(server)` exposes them as MCP tools

---

## Feature 6: .env / Secrets Hardening (`.gitignore`)

### What it is
Three new entries in `.gitignore`:
```
.env
.env.*
AGENTS.md
```

### Why it exists
- **`.env`** — never commit BitGet API keys. If you have a `.env` in the repo, you've leaked your exchange credentials.
- **`.env.*`** — covers `.env.local`, `.env.production`, etc.
- **`AGENTS.md`** — local agent instructions, often contain project secrets, custom rules, or personal notes that shouldn't be public.

### How to verify
```bash
git check-ignore -v .env
# → .gitignore:42:.env	.env

git status --ignored
# → .env, .env.local, AGENTS.md, etc.
```

---

## Architecture — Where Each Piece Lives

```
tradingview-mcp-hermes/
├── src/
│   ├── cli/
│   │   ├── index.js              ← registers morning.js subcommands
│   │   └── commands/
│   │       └── morning.js        ← tv brief, tv session get/save
│   ├── core/
│   │   └── morning.js            ← runBrief, saveSession, getSession, assertSafe* ← 🔒 security
│   ├── tools/
│   │   └── morning.js            ← MCP tool: morning_brief
│   └── server.js                 ← registers morning tools
├── scalper-run.js                 ← standalone scalper (no MCP deps)
├── rules.json                     ← your config (not committed)
├── rules.example.json             ← template
├── safety-check-log.json          ← scalper decision log
├── .env                           ← API keys (not committed)
├── .gitignore                     ← locks down .env, .env.*, AGENTS.md
└── tests/
    ├── morning.test.js            ← 19 tests
    ├── scalper.test.js            ← 9 tests
    └── cli.test.js                ← +4 integration tests
```

**Layered design:**
- `src/core/morning.js` is **pure logic** (no I/O dependency on TradingView). Can be unit-tested without a running chart.
- `src/tools/morning.js` wraps it as an MCP tool — adds the MCP transport layer.
- `src/cli/commands/morning.js` exposes it as a CLI command — adds the CLI transport layer.
- `scalper-run.js` is intentionally **separate** from the MCP server. It runs independently and talks directly to BitGet. This keeps the exchange-credentials blast radius small (if scalper is compromised, the MCP server isn't).

---

## Testing — 32 New Tests, 54/54 Passing

### What got tested
| Suite | Tests | Coverage |
|-------|-------|----------|
| `tests/morning.test.js` | 19 | `assertSafeDate` (8), `assertSafeRulesPath` (5), `loadRules` (4), session round-trip (6) |
| `tests/scalper.test.js` | 9 | `parseLockError` (9) — decimals, case-insensitivity, other-ticker rejection, non-string safety |
| `tests/cli.test.js` (+4 new) | 4 | `tv brief --help`, `tv session --help` and short-flag variants |
| (existing) | 22 | Unchanged |
| **TOTAL** | **54** | **0 failures** |

### How to run
```bash
# All Jackson tests + the existing CLI/pine tests
npm run test:unit

# Just the morning tests
npm run test:morning

# Just the scalper tests
npm run test:scalper
```

### What the security tests prove
- `assertSafeDate("2026-05-11\n../config")` → throws (newline injection blocked)
- `assertSafeDate("2026/05/11")` → throws (wrong separator blocked)
- `assertSafeRulesPath("/etc/passwd")` → throws with informative error
- `assertSafeRulesPath("../passwd")` → throws (parent-dir traversal blocked)
- `assertSafeRulesPath(null)` → throws TypeError (non-string input rejected)

### What the lock-error tests prove
- `parseLockError("0.001234XRP can be used at most")` → `0.001234` (correct extraction)
- `parseLockError("5.5xrp CAN BE USED AT MOST")` → `5.5` (case-insensitive)
- `parseLockError("0.5USDT can be used at most")` → `null` (other ticker rejected)
- `parseLockError("Insufficient balance")` → `null` (non-lock error rejected)
- `parseLockError(null)` → `null` (non-string input safe)

---

## Quick Start — First-Time Use

### 1. Get the code
```bash
git clone https://github.com/gitricko/tradingview-mcp-hermes.git
cd tradingview-mcp-hermes
npm install
```

### 2. Set up your rules
```bash
cp rules.example.json rules.json
# Edit rules.json — add your watchlist, bias criteria, risk rules
```

### 3. (Optional) Set up BitGet API for the scalper
```bash
cat > .env <<'EOF'
BITGET_API_KEY=your_key_here
BITGET_SECRET_KEY=your_secret_here
BITGET_PASSPHRASE=your_passphrase_here
EOF
```

### 4. Launch TradingView with debug port
```bash
# Mac
/Applications/TradingView.app/Contents/MacOS/TradingView --remote-debugging-port=9222

# Linux
/opt/TradingView/tradingview --remote-debugging-port=9222
```

### 5. Test the morning brief
```bash
tv brief
```

### 6. (Optional) Run the scalper
```bash
node scalper-run.js
# Watch safety-check-log.json for the decision log
```

### 7. (Optional) Add to Claude Code MCP config
```json
{
  "mcpServers": {
    "tradingview": {
      "command": "node",
      "args": ["/path/to/tradingview-mcp-hermes/src/server.js"]
    }
  }
}
```
Restart Claude Code. Then ask: *"Run my morning brief"*

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `tv brief: ENOENT .env` | The scalper module loads `.env` at import time. If you don't have BitGet credentials, this is fine — `.env` is optional. The script will fail later when it tries to call BitGet. |
| `morning_brief: No rules.json found` | Run `cp rules.example.json rules.json` and fill in your watchlist. |
| `morning_brief: watchlist empty` | Edit `rules.json` and add symbols to the `watchlist` array. |
| `assertSafeRulesPath: rules_path must live inside the project` | Your `--rules` path is outside the project root and `~/.tradingview-mcp/`. Move the rules file into one of those locations. |
| `assertSafeDate: Invalid date` | You passed a date that isn't `YYYY-MM-DD`. Use the format `2026-05-11`, not `05/11/2026`. |
| Scalper: `Fatal: The "key" argument must be of type string` | `BITGET_SECRET_KEY` is missing or empty in `.env`. |
| Scalper: `🔒 Lock active — only X XRP tradeable` | Normal — BitGet's anti-wash-trade lock. The `placeSellWithRetry` function will keep retrying. |
| Tests fail with `Cannot find package 'chrome-remote-interface'` | Run `npm install` — the test suite needs the dep installed. |

---

## What Was NOT Ported (and Why)

| Skipped item | Why |
|--------------|-----|
| Animated SUBSCRIBE banner (`subscribe-prompt.cjs`) | Marketing / YouTube-specific. No technical value for the toolkit. |
| `dotenv` npm dependency | The scalper loads `.env` manually with `fs.readFileSync` + a `.split('\n')` loop. Adding `dotenv` would add a dependency for no benefit. |
| Jackson's `README.md` content wholesale | The original README is written for "video viewers" and assumes Mac-only paths (`/Users/YOUR_USERNAME/...`). This file replaces it with project-agnostic paths. |
| `SETUP_GUIDE.md` as a separate file | The setup steps are integrated into this document's [Quick Start](#quick-start--first-time-use) section. |
| Jackson's "tv_launch" launch scripts | iliaal's fork has its own `tv_launch` MCP tool that auto-detects platforms. Jackson's `scripts/launch_tv_debug_*.sh` files were Mac/Windows specific. |
| Daily-trade cron schedule | Not included — the scalper is intended as an on-demand demo, not a scheduled job. Adding one is straightforward but outside the scope of "incorporate Jackson's features". |

---

## Credits

These features were authored by [Lewis W. Jackson](https://github.com/LewisWJackson) as part of [tradingview-mcp-jackson](https://github.com/LewisWJackson/tradingview-mcp-jackson), a fork of [tradesdontlie/tradingview-mcp](https://github.com/tradesdontlie/tradingview-mcp) by [@tradesdontlie](https://github.com/tradesdontlie).

This document was written by the Hermes agent during the surgical merge into [gitricko/tradingview-mcp-hermes](https://github.com/gitricko/tradingview-mcp-hermes) on 2026-06-17. See commit `b13d6f9` for the test addition and `0a56942` for the feature incorporation.

**License:** MIT (same as upstream).
