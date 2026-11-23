import { buildDailyReport, buildMonthlyReport, dayKey, aiSummary, analyzePerformance, tradeNet, fetchMarket, type CashFlow, type DailyReport } from '@att/core';
import { prisma } from './db';
import { closedTrades, toClosed } from './stats';
import { equityUsd } from './ledger';
import type { UserRuntime } from './settings';

/** Batas hari lokal pengguna -> rentang UTC (iterasi menit, aman untuk DST). */
export function dayRange(dateKey: string, tz: string): [Date, Date] {
  const base = new Date(dateKey + 'T00:00:00Z'); let lo = new Date(+base - 15 * 3.6e6); let hi = new Date(+base + 15 * 3.6e6);
  const f = (d: Date) => dayKey(d, tz) >= dateKey;
  while (+hi - +lo > 1000) { const mid = new Date((+lo + +hi) / 2); f(mid) ? (hi = mid) : (lo = mid); }
  const start = hi; const next = new Date(+new Date(dateKey + 'T12:00:00Z') + 24 * 3.6e6); const nextKey = next.toISOString().slice(0, 10);
  let a = new Date(+start), b = new Date(+start + 40 * 3.6e6); while (+b - +a > 1000) { const mid = new Date((+a + +b) / 2); dayKey(mid, tz) >= nextKey ? (b = mid) : (a = mid); }
  return [start, b];
}
async function equityAt(userId: string, at: Date): Promise<number | null> {
  return (await prisma.equitySnapshots.findFirst({ where: { userId, at: { lte: at } }, orderBy: { at: 'desc' } }))?.equityUsd ?? null;
}
async function flows(userId: string, from: Date, to: Date): Promise<CashFlow[]> {
  const r = await prisma.ledgerEntries.findMany({ where: { userId, type: { in: ['DEPOSIT', 'WITHDRAWAL'] }, createdAt: { gte: from, lt: to } } });
  return r.map((x) => ({ at: x.createdAt, type: x.type as 'DEPOSIT' | 'WITHDRAWAL', amountUsd: x.amountUsd }));
}
async function unrealized(userId: string) {
  const open = await prisma.positions.findMany({ where: { userId, status: 'OPEN' } }); let pr = 0, ls = 0;
  if (open.length) { let mk: Awaited<ReturnType<typeof fetchMarket>> | null = null; try { mk = await fetchMarket([...new Set(open.map((p) => p.mint))]); } catch { /* pakai lastPrice */ }
    for (const p of open) { const px = mk?.get(p.mint)?.priceUsd ?? p.lastPrice ?? p.entryPrice; const v = p.remainingQty * px - (p.costUsd * p.remainingQty) / p.initialQty; v >= 0 ? (pr += v) : (ls += -v); } }
  return { pr, ls };
}
export async function generateDaily(u: UserRuntime, dateKey: string, notify?: (text: string) => Promise<void>) {
  const [from, to] = dayRange(dateKey, u.tz);
  const trades = await closedTrades(u.userId, from, to); const fl = await flows(u.userId, from, to);
  const snaps = await prisma.equitySnapshots.findMany({ where: { userId: u.userId, at: { gte: from, lt: to } }, orderBy: { at: 'asc' } });
  const start = (await equityAt(u.userId, from)) ?? 0; const end = to > new Date() ? await equityUsd(u.userId) : ((await equityAt(u.userId, to)) ?? (await equityUsd(u.userId)));
  const un = await unrealized(u.userId);
  const rep: DailyReport = buildDailyReport({ date: dateKey, tz: u.tz, startingBalance: start, endingBalance: end, trades, flows: fl, unrealizedProfit: un.pr, unrealizedLoss: un.ls, equityIntraday: [start, ...snaps.map((s) => s.equityUsd), end] });
  const recent = (await prisma.positions.findMany({ where: { userId: u.userId, status: 'CLOSED', closedAt: { gte: new Date(+from - 30 * 864e5), lt: to } } })).map(toClosed);
  const issues = analyzePerformance(recent.map((t) => ({ trade: t })), { maxTradesPerDay: u.cfg.maxTradesPerDay });
  const summary = await aiSummary('daily', rep, issues, u.llm);
  const date = new Date(dateKey + 'T00:00:00.000Z');
  await prisma.dailyReports.upsert({ where: { userId_date: { userId: u.userId, date } }, create: { userId: u.userId, date, metrics: rep as any, aiSummary: summary }, update: { metrics: rep as any, aiSummary: summary } });
  await notify?.(`Laporan ${dateKey}\nNet: $${rep.netProfit.toFixed(2)} | Trade: ${trades.length} | WinRate: ${rep.winRatePct?.toFixed(0) ?? 'n/a'}%`);
  return { rep, summary };
}
export async function generateMonthly(u: UserRuntime, month: string, notify?: (text: string) => Promise<void>) {
  const [y, m] = month.split('-').map(Number); const from = dayRange(`${month}-01`, u.tz)[0]; const nm = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`; const to = dayRange(`${nm}-01`, u.tz)[0];
  const trades = await closedTrades(u.userId, from, to); const fl = await flows(u.userId, from, to);
  const snaps = await prisma.equitySnapshots.findMany({ where: { userId: u.userId, at: { gte: from, lt: to } }, orderBy: { at: 'asc' } });
  const opening = (await equityAt(u.userId, from)) ?? 0; const closing = to > new Date() ? await equityUsd(u.userId) : ((await equityAt(u.userId, to)) ?? (await equityUsd(u.userId)));
  const byDay = new Map<string, number>(); snaps.forEach((s) => byDay.set(dayKey(s.at, u.tz), s.equityUsd));
  const rep = buildMonthlyReport({ month, tz: u.tz, openingBalance: opening, closingBalance: closing, trades, flows: fl, equityDaily: [opening, ...byDay.values(), closing] });
  const issues = analyzePerformance(trades.map((t) => ({ trade: t })), { maxTradesPerDay: u.cfg.maxTradesPerDay });
  const evalText = await aiSummary('monthly', rep, issues, u.llm);
  await prisma.monthlyReports.upsert({ where: { userId_month: { userId: u.userId, month } }, create: { userId: u.userId, month, metrics: rep as any, aiEvaluation: evalText }, update: { metrics: rep as any, aiEvaluation: evalText } });
  await notify?.(`Laporan bulanan ${month}\nNet: $${rep.monthlyNetProfit.toFixed(2)} | Trade: ${trades.length}`);
  return { rep, evalText, best: trades.length ? Math.max(...trades.map(tradeNet)) : null };
}
