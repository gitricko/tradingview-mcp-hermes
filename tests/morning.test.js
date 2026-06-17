/**
 * Unit tests for morning brief system — security validation + session I/O.
 * No TradingView connection needed.
 *
 * Run: node --test tests/morning.test.js
 */

import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { unlinkSync } from 'node:fs';
import { join } from 'node:path';

import {
  assertSafeDate,
  assertSafeRulesPath,
  loadRules,
  saveSession,
  getSession,
} from '../src/core/morning.js';

const SESSIONS_DIR = join(process.env.HOME || process.env.USERPROFILE, '.tradingview-mcp', 'sessions');

function cleanSessionFile(date) {
  const filePath = join(SESSIONS_DIR, `${date}.json`);
  try { unlinkSync(filePath); } catch { /* ignore */ }
}

// ── assertSafeDate ────────────────────────────────────────────────────

describe('assertSafeDate', () => {
  it('accepts standard YYYY-MM-DD', () => {
    assertSafeDate('2026-05-11');
  });

  it('accepts boundary dates', () => {
    assertSafeDate('0001-01-01');
    assertSafeDate('9999-12-31');
  });

  it('rejects path traversal attempts', () => {
    assert.throws(() => assertSafeDate('../etc/passwd'), /Invalid date/);
  });

  it('rejects wrong date separators', () => {
    assert.throws(() => assertSafeDate('2026/05/11'), /Invalid date/);
    assert.throws(() => assertSafeDate('2026_05_11'), /Invalid date/);
  });

  it('rejects non-zero-padded month/day', () => {
    assert.throws(() => assertSafeDate('2026-5-11'), /Invalid date/);
    assert.throws(() => assertSafeDate('2026-05-1'), /Invalid date/);
  });

  it('rejects empty string', () => {
    assert.throws(() => assertSafeDate(''), /Invalid date/);
  });

  it('rejects partial date', () => {
    assert.throws(() => assertSafeDate('2026-05'), /Invalid date/);
  });

  it('rejects embedded newlines / injection', () => {
    assert.throws(() => assertSafeDate('2026-05-11\n../config'), /Invalid date/);
  });
});

// ── assertSafeRulesPath ──────────────────────────────────────────────

describe('assertSafeRulesPath', () => {
  it('accepts a relative path under project root', () => {
    assertSafeRulesPath('./rules.json');
  });

  it('accepts absolute path under project root', () => {
    assertSafeRulesPath(process.cwd() + '/rules.json');
  });

  it('throws for path outside project (system path)', () => {
    assert.throws(
      () => assertSafeRulesPath('/etc/passwd'),
      /rules_path must live inside/,
    );
  });

  it('throws for parent-dir traversal', () => {
    assert.throws(
      () => assertSafeRulesPath('../passwd'),
      /rules_path must live inside/,
    );
  });

  it('throws TypeError for non-string input (null)', () => {
    assert.throws(
      () => assertSafeRulesPath(null),
      /ERR_INVALID_ARG_TYPE/,
    );
  });
});

// ── loadRules ─────────────────────────────────────────────────────────

describe('loadRules', () => {
  it('finds rules.json in project root when no path given', () => {
    const result = loadRules(undefined);
    assert.notEqual(result, null);
    // It returns the project's rules.json structure
    assert.ok(result.path);
    assert.ok(result.rules);
    assert.ok(result.rules.watchlist);
  });

  it('throws when explicit path is outside safe zone', () => {
    assert.throws(
      () => loadRules('/etc/passwd'),
      /rules_path must live inside/,
    );
  });

  it('loads a valid rules file from project sub-path', () => {
    // Use an absolute path inside the project (rules.example.json)
    const cwd = process.cwd();
    const examplePath = join(cwd, 'rules.example.json');
    const result = loadRules(examplePath);
    assert.notEqual(result, null);
    assert.ok(result.rules);
  });

  it('falls back to project rules.json when explicit path does not exist', () => {
    const cwd = process.cwd();
    const missingPath = join(cwd, 'nonexistent-rules.json');
    const result = loadRules(missingPath);
    // Should cascade to PROJECT_ROOT/rules.json
    assert.notEqual(result, null);
    assert.ok(result.rules);
    assert.equal(result.path, join(cwd, 'rules.json'));
  });
});

// ── saveSession / getSession round-trip ──────────────────────────────

describe('session round-trip', () => {
  const date = '2026-06-17';
  const brief = 'Bullish bias confirmed — ES above VWAP';

  after(() => {
    const filePath = join(
      process.env.HOME || process.env.USERPROFILE,
      '.tradingview-mcp', 'sessions', `${date}.json`
    );
    try { unlinkSync(filePath); } catch { /* ignore */ }
  });

  it('writes a session entry', () => {
    const result = saveSession({ brief, date });
    assert.ok(result.success);
    assert.equal(result.date, date);
  });

  it('reads back the saved session', () => {
    const loaded = getSession({ date });
    assert.ok(loaded.success);
    assert.equal(loaded.brief, brief);
  });

  it('overwrites brief on second save (session is single entry)', () => {
    saveSession({ brief: 'Updated brief', date });
    const loaded = getSession({ date });
    assert.equal(loaded.brief, 'Updated brief');
  });

  it('getSession loads current date when no argument given', () => {
    const today = new Date().toISOString().split('T')[0];
    saveSession({ brief: 'Today test', date: today });
    const loaded = getSession();
    assert.ok(loaded.success);
    assert.equal(loaded.brief, 'Today test');
    // Cleanup today's file
    const todayPath = join(
      process.env.HOME || process.env.USERPROFILE,
      '.tradingview-mcp', 'sessions', `${today}.json`
    );
    try { unlinkSync(todayPath); } catch { /* ignore */ }
  });

  it('getSession throws for invalid date (path traversal)', () => {
    assert.throws(
      () => getSession({ date: '../hack' }),
      /Invalid date/,
    );
  });

  it('saveSession throws for invalid date (path traversal)', () => {
    assert.throws(
      () => saveSession({ brief: 'test', date: '/etc/passwd' }),
      /Invalid date/,
    );
  });
});
