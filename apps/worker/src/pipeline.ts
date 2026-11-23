import { collectTokenContext, runEntryPipeline, SolanaRpc, Jupiter, type Candidate, type UserTradingConfig, type TokenContext } from '@att/core';
import { prisma, loadAllUsers, equityUsd, todayStats, type UserRuntime } from '@att/server';
import { alert } from './notify';
import { openPosition } from './broker';
import { ENV } from './env';

const done = new Set<string>(); const warned = new Set<string>();
export function systemRpc(users: UserRuntime[]): { rpc: SolanaRpc; jup: Jupiter; ws: string; owner?: UserRuntime } | null {
  const owner = users.find((u) => u.secrets.rpcUrl) ; const url = owner?.secrets.rpcUrl ?? ENV.RPC_URL; if (!url) return null;
  return { rpc: new SolanaRpc(url), jup: new Jupiter(owner?.cfg.jupiterBase, owner?.secrets.jupiterApiKey), ws: owner?.secrets.wsUrl ?? ENV.WS_URL, owner };
}
export async function onCandidate(c: Candidate) {
  await prisma.solanaTokens.upsert({ where: { mint: c.mint }, create: { mint: c.mint, source: c.source, createdAtChain: new Date() }, update: {} });
  for (const u of await loadAllUsers()) if (u.cfg.alerts.NEW_TOKEN === true) await alert(u, 'NEW_TOKEN', `${c.source}: ${c.mint}`, c.mint);
  // Data pasar butuh waktu: evaluasi bertahap, tidak membeli hanya karena token baru.
  for (const delay of [20, 90, 300]) setTimeout(() => { evaluate(c, delay).catch((e) => console.error('evaluate', c.mint, e.message)); }, delay * 1000);
}
export async function evaluate(c: Candidate, stageSec: number) {
  const users = await loadAllUsers(); const sys = systemRpc(users); if (!sys) return;
  const prev = await prisma.tokenSecurity.findFirst({ where: { mint: c.mint }, orderBy: { checkedAt: 'desc' } });
  const prevH = (prev?.rawJson as any)?.holders; const useDas = users.some((u) => u.cfg.useDas) || /helius/i.test(sys.owner?.secrets.rpcUrl ?? ENV.RPC_URL);
  const { ctx, notes } = await collectTokenContext(c.mint, c.source, c.creator, {
    rpc: sys.rpc, jupiter: sys.jup, xBearer: sys.owner?.secrets.xBearerToken, deepBundleScan: users.some((u) => u.cfg.deepBundleScan), useDas,
    prevHolders: prevH ? { count: prevH, atMs: +prev!.checkedAt } : null,
    smartBuys: async (m) => (await prisma.smartMoneySignals.findMany({ where: { mint: m, action: 'BUY', createdAt: { gte: new Date(Date.now() - 3.6e6) } }, distinct: ['walletAddress'] })).length,
  });
  ctx.symbol = ctx.symbol ?? c.mint.slice(0, 5);
  const s = ctx.security;
  await prisma.tokenSecurity.create({ data: { mint: c.mint, mintAuthorityRevoked: s.mintAuthorityRevoked === 'UNKNOWN' ? null : s.mintAuthorityRevoked, freezeAuthorityRevoked: s.freezeAuthorityRevoked === 'UNKNOWN' ? null : s.freezeAuthorityRevoked, top10HolderPct: s.top10HolderPct === 'UNKNOWN' ? null : s.top10HolderPct, lpLockedOrBurned: s.lpLockedOrBurned === 'UNKNOWN' ? null : s.lpLockedOrBurned, honeypotSuspected: s.sellRouteOk === 'UNKNOWN' ? null : !s.sellRouteOk, rawJson: { holders: ctx.holders === 'UNKNOWN' ? null : ctx.holders, notes } as any } });
  if (ctx.market) {
    const m = ctx.market;
    await prisma.liquidityPools.upsert({ where: { poolAddress: m.pairAddress }, create: { mint: c.mint, dex: m.dex, poolAddress: m.pairAddress, liquidityUsd: m.liquidityUsd === 'UNKNOWN' ? null : m.liquidityUsd, migratedFromBondingCurve: c.source === 'pumpswap' }, update: { liquidityUsd: m.liquidityUsd === 'UNKNOWN' ? null : m.liquidityUsd } });
    await prisma.tokenMetadata.upsert({ where: { mint: c.mint }, create: { mint: c.mint, twitter: m.twitter === 'UNKNOWN' ? null : m.twitter, telegram: m.telegram === 'UNKNOWN' ? null : m.telegram, website: m.website === 'UNKNOWN' ? null : m.website }, update: {} });
  }
  for (const u of users) { try { await runForUser(u, ctx, c, stageSec); } catch (e) { console.error('pipeline user', u.userId, (e as Error).message); } }
}
async function runForUser(u: UserRuntime, ctx: TokenContext, c: Candidate, stageSec: number) {
  const key = `${u.userId}:${c.mint}`; if (done.has(key)) return;
  const equity = await equityUsd(u.userId); const today = await todayStats(u.userId, u.tz);
  const open = await prisma.positions.count({ where: { userId: u.userId, status: 'OPEN' } });
  const canAuto = u.cfg.autoTrade && !u.cfg.killSwitch && today.trades < u.cfg.maxTradesPerDay && equity > 0;
  const cfg: UserTradingConfig = { mode: u.cfg.mode, limits: u.cfg.limits, tpsl: u.cfg.tpsl, filters: u.cfg.filters, portfolio: { equityUsd: equity, openPositions: open, dailyRealizedPnlUsd: today.netProfit }, sizePctOfEquity: u.cfg.sizePctOfEquity, autoTrade: canAuto };
  const sys = systemRpc([u]) ?? systemRpc(await loadAllUsers());
  const out = await runEntryPipeline(ctx, cfg, {
    llm: stageSec >= 90 ? u.llm : undefined,
    log: async (r) => { await prisma.aIAgentLogs.create({ data: { agent: r.agent, mint: c.mint, input: { userId: u.userId, stageSec } as any, output: { ok: r.ok, notes: r.notes, ms: r.ms, output: r.output } as any } }).catch(() => {}); },
    execute: async (order, tpsl) => { await openPosition(u, order, tpsl, ctx, sys!.rpc); done.add(key); },
  });
  const opp = out.card?.opportunity;
  if (typeof opp === 'number' && opp >= 70 && !warned.has('hp' + key)) { warned.add('hp' + key); await alert(u, 'HIGH_POTENTIAL', `${ctx.symbol} skor ${opp.toFixed(0)} | likuiditas ${ctx.market?.liquidityUsd}`, c.mint); }
  if (out.security && out.security.riskScore >= 70 && !warned.has('sus' + key)) { warned.add('sus' + key); await alert(u, 'SUSPICIOUS', `${ctx.symbol}: ${out.security.flags.join('; ')}`, c.mint); }
  if (out.signal === 'BUY' && !done.has(key)) { done.add(key); await alert(u, 'AI_ENTRY', `Sinyal BUY ${ctx.symbol} (${u.cfg.mode})${out.order ? '' : ' - auto-trade nonaktif'}`, c.mint); }
}
