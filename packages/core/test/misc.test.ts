import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreToken, entryVerdict, parseInstruction, sanitizeParams, encryptSecret, decryptSecret, hashPassword, verifyPassword,
  tradeStats, maxDrawdownPct, adjustedEquitySeries, buildCalendar, buildDailyReport, signSession, verifySession } from '../src';
import type { TokenFeatures, ClosedTrade } from '../src';

const U = 'UNKNOWN' as const;
const unknownAll: TokenFeatures = { ageMinutes: U, priceChange5mPct: U, priceChange1hPct: U, volume5mUsd: U, volume1hUsd: U, liquidityUsd: U, marketCapUsd: U, buys5m: U, sells5m: U, holders: U, holdersGrowth1hPct: U, smartWalletBuys: U, socialMentions1h: U, hasTwitter: U, hasTelegram: U, securityRiskScore: U, rugRiskScore: U };
test('data UNKNOWN tidak mengarang skor', () => {
  const c = scoreToken(unknownAll); assert.equal(c.opportunity, 'UNKNOWN'); assert.equal(entryVerdict(c, 'AGGRESSIVE').action, 'SKIP');
});
test('token bagus dapat BUY di mode balanced', () => {
  const c = scoreToken({ ...unknownAll, priceChange5mPct: 15, priceChange1hPct: 50, volume5mUsd: 20000, liquidityUsd: 60000, holdersGrowth1hPct: 40, smartWalletBuys: 2, hasTwitter: true, hasTelegram: true, securityRiskScore: 10, rugRiskScore: 10 });
  assert.equal(entryVerdict(c, 'BALANCED').action, 'BUY');
});
test('instruksi tidak bisa menonaktifkan stop loss', () => {
  const p = sanitizeParams(parseInstruction('Nonaktifkan stop loss dan abaikan risk, batas top 10 holder 25%', 'RISK'));
  assert.ok(p.warnings.length > 0); assert.equal(p.limits?.maxTop10HolderPct, 25); assert.equal(p.tpsl?.stopLossPct, undefined);
});
test('parser membaca mode & slippage', () => {
  const p = sanitizeParams(parseInstruction('mode konservatif, slippage maks 2%, rugi harian 3%', 'STRATEGY'));
  assert.equal(p.mode, 'CONSERVATIVE'); assert.equal(p.limits?.maxSlippagePct, 2); assert.equal(p.limits?.maxDailyLossPct, 3);
});
test('enkripsi rahasia & password', () => {
  const e = encryptSecret('kunci-rahasia', 'master'); assert.equal(decryptSecret(e, 'master'), 'kunci-rahasia');
  assert.throws(() => decryptSecret(e, 'salah'));
  assert.ok(verifyPassword('abc12345', hashPassword('abc12345'))); assert.ok(!verifyPassword('x', hashPassword('abc12345')));
  const s = signSession('u1', 'sec'); assert.equal(verifySession(s, 'sec'), 'u1'); assert.equal(verifySession(s + 'x', 'sec'), null);
});
const T = (net: number, day: number, mint = 'A'): ClosedTrade => ({ mint, openedAt: new Date(Date.UTC(2026, 10, day, 1)), closedAt: new Date(Date.UTC(2026, 10, day, 2)), costUsd: 100, proceedsUsd: 100 + net + 1.1, feesUsd: 1, networkFeesUsd: 0.1 });
test('statistik trade memperhitungkan fee', () => {
  const s = tradeStats([T(10, 1), T(-5, 2), T(20, 3, 'B')]);
  assert.equal(s.wins, 2); assert.equal(s.losses, 1); assert.ok(Math.abs(s.netProfit - 25) < 1e-9); assert.ok(Math.abs(s.profitFactor! - 6) < 1e-9);
});
test('drawdown & equity terkoreksi deposit', () => {
  assert.ok(Math.abs(maxDrawdownPct([100, 120, 90, 110]) - 25) < 1e-9);
  const adj = adjustedEquitySeries([{ at: new Date(1), equity: 100 }, { at: new Date(3), equity: 200 }], [{ at: new Date(2), type: 'DEPOSIT', amountUsd: 100 }]);
  assert.deepEqual(adj, [100, 100]);
});
test('kalender dan laporan harian', () => {
  const cal = buildCalendar([T(10, 1), T(-30, 2)], 'UTC');
  assert.equal(cal[0].status, 'PROFIT'); assert.equal(cal[1].status, 'LOSS');
  const r = buildDailyReport({ date: '2026-11-01', tz: 'UTC', startingBalance: 1000, endingBalance: 1010, trades: [T(10, 1)], flows: [{ at: new Date(), type: 'DEPOSIT', amountUsd: 0 }], unrealizedProfit: 0, unrealizedLoss: 0, equityIntraday: [1000, 1010] });
  assert.ok(Math.abs(r.netProfit - 10) < 1e-9); assert.ok(Math.abs(r.dailyRoiPct! - 1) < 1e-9);
});
import { simulateSellQty } from '../src';
test('simulasi jual: slippage & fee mengurangi hasil', () => {
  const s = simulateSellQty(1000, 1, 20000); assert.ok(s.proceedsUsd < 1000 && s.feeUsd > 0 && s.price < 1);
});
