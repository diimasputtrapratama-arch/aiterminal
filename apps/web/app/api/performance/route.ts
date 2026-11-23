import { analyzePerformance, tradeStats, type TradeMeta } from '@att/core';
import { prisma, toClosed } from '@att/server';
import { handle, requireUser } from '@/lib/auth';
export const GET = handle(async () => {
  const u = await requireUser(); const rows = await prisma.positions.findMany({ where: { userId: u.userId, status: 'CLOSED', closedAt: { gte: new Date(Date.now() - 90 * 864e5) } } });
  const meta: TradeMeta[] = rows.map((p) => { const t = toClosed(p); return { trade: t, strategyId: p.strategyId ?? undefined, entrySlippagePct: p.entrySlippagePct ?? undefined, peakGainPct: p.peakGainPct, exitGainPct: p.costUsd > 0 ? (p.proceedsUsd / p.costUsd - 1) * 100 : undefined }; });
  const byStrat = new Map<string, TradeMeta[]>(); meta.forEach((m) => (byStrat.get(m.strategyId ?? 'tanpa-strategi') ?? byStrat.set(m.strategyId ?? 'tanpa-strategi', []).get(m.strategyId ?? 'tanpa-strategi')!).push(m));
  const names = new Map((await prisma.aIStrategies.findMany({ where: { userId: u.userId } })).map((s) => [s.id, s.name]));
  const strategies = [...byStrat.entries()].map(([id, ms]) => { const s = tradeStats(ms.map((m) => m.trade)); return { id, name: names.get(id) ?? id, trades: s.trades, winRatePct: s.winRate, netProfit: s.netProfit, profitFactor: s.profitFactor }; });
  return { issues: analyzePerformance(meta, { maxTradesPerDay: u.cfg.maxTradesPerDay }), strategies, note: 'Saran hanya usulan. Perubahan strategi live memerlukan persetujuan Anda di Pengaturan.' };
});
