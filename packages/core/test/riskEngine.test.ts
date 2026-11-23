import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateOrder, mergeUserLimits, MODE_LIMITS, approveOrder } from '../src';
import type { OrderProposal, PortfolioState } from '../src';

const pf: PortfolioState = { equityUsd: 1000, openPositions: 0, dailyRealizedPnlUsd: 0 };
const good: OrderProposal = {
  side: 'BUY', sizeUsd: 15, stopLossPct: 15,
  token: { mint: 'X', liquidityUsd: 60000, top10HolderPct: 20, mintAuthorityRevoked: true,
    freezeAuthorityRevoked: true, lpLockedOrBurned: true, honeypotSuspected: false, estSlippagePct: 2 },
};
test('menyetujui order valid', () => assert.equal(validateOrder(good, pf, MODE_LIMITS.CONSERVATIVE).approved, true));
test('menolak UNKNOWN (fail-closed)', () => {
  const o = { ...good, token: { ...good.token, liquidityUsd: 'UNKNOWN' as const } };
  assert.equal(validateOrder(o, pf, MODE_LIMITS.CONSERVATIVE).approved, false);
});
test('menolak tanpa stop loss', () => assert.equal(validateOrder({ ...good, stopLossPct: null }, pf, MODE_LIMITS.BALANCED).approved, false));
test('menolak saat batas rugi harian tercapai', () => assert.equal(validateOrder(good, { ...pf, dailyRealizedPnlUsd: -40 }, MODE_LIMITS.CONSERVATIVE).approved, false));
test('pengguna tidak bisa melonggarkan batas', () => {
  const m = mergeUserLimits('CONSERVATIVE', { maxPositionPctOfEquity: 50, minLiquidityUsd: 1 });
  assert.equal(m.maxPositionPctOfEquity, 2); assert.equal(m.minLiquidityUsd, 50000);
});
test('SELL selalu diizinkan', () => assert.equal(validateOrder({ ...good, side: 'SELL' }, pf, MODE_LIMITS.CONSERVATIVE).approved, true));
test('approveOrder menolak order buruk', () => assert.equal(approveOrder({ ...good, sizeUsd: 500 }, pf, MODE_LIMITS.CONSERVATIVE).ok, false));
