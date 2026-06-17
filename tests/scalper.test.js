/**
 * Unit tests for scalper lock-error parsing — pure function, no network.
 *
 * Run: node --test tests/scalper.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { parseLockError } from '../scalper-run.js';

// ── parseLockError ───────────────────────────────────────────────────

describe('parseLockError', () => {
  it('extracts tradeable qty from standard lock error', () => {
    const qty = parseLockError('0.001234XRP can be used at most');
    assert.strictEqual(qty, 0.001234);
  });

  it('extracts small decimal quantities', () => {
    const qty = parseLockError('0.00001XRP can be used at most');
    assert.strictEqual(qty, 0.00001);
  });

  it('extracts whole-number quantities', () => {
    const qty = parseLockError('10XRP can be used at most');
    assert.strictEqual(qty, 10);
  });

  it('is case-insensitive', () => {
    assert.strictEqual(parseLockError('5.5xrp CAN BE USED AT MOST'), 5.5);
    assert.strictEqual(parseLockError('5.5Xrp can be used at most'), 5.5);
  });

  it('returns null for non-lock error messages', () => {
    assert.strictEqual(parseLockError('Insufficient balance'), null);
    assert.strictEqual(parseLockError('Order rejected: market closed'), null);
    assert.strictEqual(parseLockError(''), null);
  });

  it('returns null for other tickers (different coin)', () => {
    assert.strictEqual(parseLockError('0.5USDT can be used at most'), null);
    assert.strictEqual(parseLockError('0.5BTC can be used at most'), null);
  });

  it('returns null for non-string input', () => {
    assert.strictEqual(parseLockError(null), null);
    assert.strictEqual(parseLockError(undefined), null);
    assert.strictEqual(parseLockError(123), null);
    assert.strictEqual(parseLockError({}), null);
  });

  it('extracts from realistic BitGet error object message', () => {
    const res = { code: 'E00001', msg: '0.050000XRP can be used at most' };
    const qty = parseLockError(res.msg);
    assert.strictEqual(qty, 0.05);
  });

  it('handles large quantities', () => {
    const qty = parseLockError('1234.567890XRP can be used at most');
    assert.strictEqual(qty, 1234.56789);
  });
});
