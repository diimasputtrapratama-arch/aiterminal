import { fetchMarket, scoreToken, analyzeSecurity, buildFeatures, type TokenContext, type SecurityInput } from '@att/core';
import { prisma, equityUsd, cashBalance, todayStats } from '@att/server';
import { handle, requireUser } from '@/lib/auth';
const U = 'UNKNOWN' as const; const nz = <T,>(v: T | null | undefined): T | 'UNKNOWN' => (v === null || v === undefined ? U : v);
export const GET = handle(async () => {
  const u = await requireUser();
  const tokens = await prisma.solanaTokens.findMany({ orderBy: { discoveredAt: 'desc' }, take: 40, include: { security: { orderBy: { checkedAt: 'desc' }, take: 1 }, metadata: true } });
  let mk = new Map<string, any>(); try { mk = await fetchMarket(tokens.map((t) => t.mint)); } catch { /* pasar tak tersedia */ }
  const rows = tokens.map((t) => { const s = t.security[0]; const m = mk.get(t.mint) ?? null; const si: SecurityInput = { mintAuthorityRevoked: nz(s?.mintAuthorityRevoked), freezeAuthorityRevoked: nz(s?.freezeAuthorityRevoked), token2022Risky: U, top10HolderPct: nz(s?.top10HolderPct), topHolderPct: U, creatorHoldPct: U, lpLockedOrBurned: nz(s?.lpLockedOrBurned), bundledPct: U, metadataMutable: U, sellRouteOk: s?.honeypotSuspected === null || s?.honeypotSuspected === undefined ? U : !s.honeypotSuspected, sellImpactPct: U, liquidityUsd: m?.liquidityUsd ?? U, liquidityDropPct: U, creatorDumped: U };
    const sec = analyzeSecurity(si); const ctx: TokenContext = { mint: t.mint, source: t.source, market: m, candles: [], security: si, holders: U, holdersGrowth1hPct: U, smartWalletBuys: U, socialMentions1h: U };
    const card = scoreToken(buildFeatures(ctx, sec)); return { mint: t.mint, source: t.source, discoveredAt: t.discoveredAt, price: m?.priceUsd ?? null, liq: m?.liquidityUsd ?? U, vol5m: m?.volume5m ?? U, vol1h: m?.volume1h ?? U, ch5m: m?.change5m ?? U, ch1h: m?.change1h ?? U, mcap: m?.marketCapUsd ?? U, opp: card.opportunity, risk: sec.riskScore, coverage: card.coverage, flags: sec.flags, unknown: sec.unknown }; });
  const num = (v: any) => (typeof v === 'number' ? v : -Infinity); const top = (f: (r: any) => number, n = 8, asc = false) => [...rows].filter((r) => Number.isFinite(f(r))).sort((a, b) => (asc ? f(a) - f(b) : f(b) - f(a))).slice(0, n);
  const positions = await prisma.positions.findMany({ where: { userId: u.userId, status: 'OPEN' }, orderBy: { openedAt: 'desc' } });
  const [equity, cash, today] = [await equityUsd(u.userId), await cashBalance(u.userId), await todayStats(u.userId, u.tz)];
  const snaps = await prisma.equitySnapshots.findMany({ where: { userId: u.userId, at: { gte: new Date(Date.now() - 7 * 864e5) } }, orderBy: { at: 'asc' }, take: 600 });
  return {
    portfolio: { equity, cash, todayNet: today.netProfit, todayTrades: today.trades, mode: u.cfg.tradingMode, autoTrade: u.cfg.autoTrade, killSwitch: !!u.cfg.killSwitch },
    equitySeries: snaps.map((s) => [+s.at, s.equityUsd]),
    newFeed: rows.slice(0, 15), trending: top((r) => (typeof r.vol5m === 'number' && typeof r.liq === 'number' && r.liq > 0 ? r.vol5m / r.liq : -Infinity)),
    topVolume: top((r) => num(r.vol1h)), topLiquidity: top((r) => num(r.liq)), gainers: top((r) => num(r.ch1h)), losers: top((r) => num(r.ch1h), 8, true),
    aiRanking: top((r) => num(r.opp)), securityRanking: top((r) => r.risk, 8, true),
    positions: positions.map((p) => ({ id: p.id, mint: p.mint, symbol: p.symbol, mode: p.mode, entry: p.entryPrice, last: p.lastPrice, qty: p.remainingQty, gainPct: p.lastPrice ? (p.lastPrice / (p.state as any).entryPrice - 1) * 100 : null, stop: (p.state as any).stopPrice, openedAt: p.openedAt })),
    whales: await prisma.smartMoneySignals.findMany({ orderBy: { createdAt: 'desc' }, take: 15 }),
    alerts: await prisma.tokenAlerts.findMany({ where: { userId: u.userId }, orderBy: { createdAt: 'desc' }, take: 20 }),
  };
});
