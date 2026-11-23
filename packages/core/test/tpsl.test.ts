import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_TPSL, newPosition, evaluatePosition, validateTpSl, clampAiSuggestion, simulateFill } from '../src';

const p0 = () => newPosition(1, 1000, 0, DEFAULT_TPSL);
test('SL -15% menjual semua', () => {
  const r = evaluatePosition(p0(), DEFAULT_TPSL, { price: 0.85, nowMs: 1 });
  assert.equal(r.actions[0].reason, 'SL'); assert.equal(r.state.remainingQty, 0);
});
test('TP1 +20% jual 25% sekali saja', () => {
  const a = evaluatePosition(p0(), DEFAULT_TPSL, { price: 1.21, nowMs: 1 });
  assert.equal(a.actions.length, 1); assert.equal(a.actions[0].qty, 250);
  const b = evaluatePosition(a.state, DEFAULT_TPSL, { price: 1.22, nowMs: 2 });
  assert.equal(b.actions.length, 0);
});
test('break even menggeser stop setelah +20%', () => {
  const a = evaluatePosition(p0(), DEFAULT_TPSL, { price: 1.21, nowMs: 1 });
  assert.ok(a.state.stopPrice >= 1.01);
  const b = evaluatePosition(a.state, DEFAULT_TPSL, { price: 1.0, nowMs: 2 });
  assert.ok(['BREAK_EVEN', 'TRAILING'].includes(b.actions[0].reason));
});
test('trailing stop mengikuti harga tertinggi', () => {
  let s = p0(); s = evaluatePosition(s, DEFAULT_TPSL, { price: 1.6, nowMs: 1 }).state;
  const r = evaluatePosition(s, DEFAULT_TPSL, { price: 1.6 * 0.87, nowMs: 2 });
  assert.equal(r.actions.at(-1)?.reason, 'TRAILING');
});
test('emergency sell menjual semua sisa', () => {
  const r = evaluatePosition(p0(), DEFAULT_TPSL, { price: 1, nowMs: 1, emergency: true });
  assert.equal(r.actions[0].qty, 1000);
});
test('validasi konfigurasi', () => {
  assert.ok(validateTpSl({ tpLevels: [{ gainPct: 50, sellPct: 60 }, { gainPct: 20, sellPct: 60 }], stopLossPct: 15 }).length > 0);
  assert.equal(validateTpSl(DEFAULT_TPSL).length, 0);
});
test('saran AI tidak boleh melonggarkan SL', () => assert.equal(clampAiSuggestion({ stopLossPct: 40 }, DEFAULT_TPSL).stopLossPct, 15));
test('fill paper memperhitungkan slippage dan fee', () => {
  const f = simulateFill('BUY', 100, 1, 10000);
  assert.ok(f.price > 1 && f.feeUsd > 0 && f.qty > 0);
});
