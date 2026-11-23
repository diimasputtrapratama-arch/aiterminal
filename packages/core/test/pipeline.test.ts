import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runEntryPipeline, analyzeSecurity, detectBundledBuys, topHolderPct, analyzeTa, DEFAULT_TPSL, analyzePerformance } from '../src';
import type { TokenContext, UserTradingConfig, Candle, SecurityInput, ClosedTrade } from '../src';

const U = 'UNKNOWN' as const;
const sec: SecurityInput = { mintAuthorityRevoked: true, freezeAuthorityRevoked: true, token2022Risky: false, top10HolderPct: 22, topHolderPct: 6, creatorHoldPct: 3, lpLockedOrBurned: true, bundledPct: 4, metadataMutable: false, sellRouteOk: true, sellImpactPct: 2, liquidityUsd: 90000, liquidityDropPct: 0, creatorDumped: false };
const market: any = { mint: 'M', dex: 'raydium', pairAddress: 'P', priceUsd: 0.001, liquidityUsd: 90000, volume5m: 30000, volume1h: 80000, volume24h: 200000, change5m: 14, change1h: 55, change24h: 120, buys5m: 120, sells5m: 60, buys1h: 500, sells1h: 300, marketCapUsd: 400000, fdvUsd: 400000, pairCreatedAtMs: Date.now() - 3600e3, twitter: 'x', telegram: 't', website: U };
const candles = (n: number): Candle[] => Array.from({ length: n }, (_, i) => ({ t: i, o: 1 + i * 0.01, h: 1.02 + i * 0.01, l: 0.99 + i * 0.01, c: 1.01 + i * 0.01, v: 100 }));
const ctx: TokenContext = { mint: 'M', symbol: 'MEME', source: 'raydium', market, candles: candles(40), security: sec, holders: 900, holdersGrowth1hPct: 40, smartWalletBuys: 2, socialMentions1h: 30 };
const cfg = (over: Partial<UserTradingConfig> = {}): UserTradingConfig => ({ mode: 'BALANCED', limits: {}, tpsl: DEFAULT_TPSL, filters: {}, portfolio: { equityUsd: 1000, openPositions: 0, dailyRealizedPnlUsd: 0 }, sizePctOfEquity: 2, autoTrade: true, sol24hChangePct: 1, ...over });

test('pipeline: token sehat -> BUY, execution hanya lewat ApprovedOrder', async () => {
  let executed = 0; const logs: string[] = [];
  const r = await runEntryPipeline(ctx, cfg(), { log: (x) => { logs.push(x.agent); }, execute: async () => { executed++; } });
  assert.equal(r.signal, 'BUY'); assert.equal(executed, 1); assert.ok(logs.includes('RiskManagement') && logs.includes('Execution'));
});
test('pipeline: tanpa autoTrade hanya sinyal', async () => {
  let executed = 0; const r = await runEntryPipeline(ctx, cfg({ autoTrade: false }), { execute: async () => { executed++; } });
  assert.equal(r.signal, 'BUY'); assert.equal(executed, 0);
});
test('pipeline: data keamanan UNKNOWN tidak pernah dieksekusi', async () => {
  let executed = 0;
  const bad = { ...ctx, security: { ...sec, mintAuthorityRevoked: U, top10HolderPct: U } };
  const r = await runEntryPipeline(bad, cfg(), { execute: async () => { executed++; } });
  assert.notEqual(r.signal, 'BUY'); assert.equal(executed, 0);
});
test('pipeline: ukuran posisi dibatasi limit sebelum eksekusi', async () => {
  const sizes: number[] = [];
  const r = await runEntryPipeline(ctx, cfg({ sizePctOfEquity: 50, limits: { maxPositionPctOfEquity: 1 } }), { execute: async (o) => { sizes.push(o.sizeUsd); } });
  assert.equal(r.signal, 'BUY'); assert.ok(sizes[0] <= 10 + 1e-9);
});
test('security: honeypot (tanpa rute jual) berisiko sangat tinggi', () => {
  const r = analyzeSecurity({ ...sec, sellRouteOk: false }); assert.equal(r.honeypotSuspected, true); assert.ok(r.riskScore >= 40);
});
test('security: UNKNOWN dicatat, tidak dianggap aman', () => {
  const r = analyzeSecurity({ ...sec, mintAuthorityRevoked: U }); assert.ok(r.unknown.includes('mintAuthority')); assert.ok(r.riskScore > analyzeSecurity(sec).riskScore);
});
test('bundled buy & top holder', () => {
  const b = detectBundledBuys([1, 2, 3, 4].map((i) => ({ wallet: 'w' + i, slot: 101, pctSupply: 2, funder: 'F' })), 100);
  assert.equal(b.clusterCount, 1); assert.equal(b.clusterPct, 8);
  assert.equal(topHolderPct([{ owner: 'lp', pct: 80 }, { owner: 'a', pct: 5 }, { owner: 'b', pct: 4 }], 10, ['lp']), 9);
});
test('TA: data kurang -> UNKNOWN', () => assert.equal(analyzeTa(candles(5)).dumpRisk, 'UNKNOWN'));
test('TA: uptrend terdeteksi', () => assert.equal(analyzeTa(candles(40)).momentum, 'UP'));
test('performance analyst mendeteksi rentetan loss', () => {
  const t = (n: number): ClosedTrade => ({ mint: 'A', openedAt: new Date(), closedAt: new Date(), costUsd: 100, proceedsUsd: 100 + n, feesUsd: 0, networkFeesUsd: 0 });
  const issues = analyzePerformance([-5, -5, -5, -5, -5, 3].map((n) => ({ trade: t(n) })));
  assert.ok(issues.some((i) => i.code === 'FREQUENT_LOSS'));
});
