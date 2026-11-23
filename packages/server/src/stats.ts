import { dayKey, tradeStats, type ClosedTrade } from '@att/core';
import { prisma } from './db';
export const toClosed = (p: any): ClosedTrade => ({ mint: p.mint, symbol: p.symbol ?? undefined, strategyId: p.strategyId ?? undefined, openedAt: p.openedAt, closedAt: p.closedAt!, costUsd: p.costUsd, proceedsUsd: p.proceedsUsd, feesUsd: p.feesUsd, networkFeesUsd: p.networkFeesUsd });
export async function closedTrades(userId: string, from: Date, to: Date): Promise<ClosedTrade[]> {
  return (await prisma.positions.findMany({ where: { userId, status: 'CLOSED', closedAt: { gte: from, lt: to } }, orderBy: { closedAt: 'asc' } })).map(toClosed);
}
export async function todayStats(userId: string, tz: string) {
  const rows = await closedTrades(userId, new Date(Date.now() - 36 * 3.6e6), new Date(Date.now() + 1000));
  const k = dayKey(new Date(), tz); const today = rows.filter((t) => dayKey(t.closedAt, tz) === k);
  const s = tradeStats(today); return { trades: today.length, netProfit: s.netProfit };
}
export async function upsertCalendarDay(userId: string, tz: string, at: Date) {
  const k = dayKey(at, tz); const rows = await closedTrades(userId, new Date(+at - 36 * 3.6e6), new Date(+at + 36 * 3.6e6));
  const day = rows.filter((t) => dayKey(t.closedAt, tz) === k); const s = tradeStats(day);
  const date = new Date(k + 'T00:00:00.000Z');
  await prisma.tradingCalendar.upsert({ where: { userId_date: { userId, date } }, create: { userId, date, pnlUsd: s.netProfit, trades: day.length, winRate: s.winRate }, update: { pnlUsd: s.netProfit, trades: day.length, winRate: s.winRate } });
}
