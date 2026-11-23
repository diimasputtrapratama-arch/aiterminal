import { ClosedTrade, CashFlow, tradeNet, tradeStats, maxDrawdownPct } from '../pnl/pnl';

export function dayKey(d: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
export interface DailyInput {
  date: string; tz: string;
  startingBalance: number; endingBalance: number;
  trades: ClosedTrade[]; flows: CashFlow[];
  unrealizedProfit: number; unrealizedLoss: number;
  equityIntraday: number[];
}
export function buildDailyReport(i: DailyInput) {
  const s = tradeStats(i.trades);
  const dep = i.flows.filter((f) => f.type === 'DEPOSIT').reduce((a, f) => a + f.amountUsd, 0);
  const wd = i.flows.filter((f) => f.type === 'WITHDRAWAL').reduce((a, f) => a + f.amountUsd, 0);
  const net = s.netProfit; // sudah termasuk fee & network fee; deposit/withdrawal terpisah
  const base = i.startingBalance + dep;
  return {
    date: i.date, tz: i.tz,
    startingBalance: i.startingBalance, endingBalance: i.endingBalance,
    totalDeposit: dep, totalWithdrawal: wd, totalVolume: s.volume,
    totalBuy: i.trades.reduce((a, t) => a + t.costUsd, 0), totalSell: i.trades.reduce((a, t) => a + t.proceedsUsd, 0),
    winningTrades: s.wins, losingTrades: s.losses,
    realizedProfit: s.realizedProfit, realizedLoss: s.realizedLoss,
    unrealizedProfit: i.unrealizedProfit, unrealizedLoss: i.unrealizedLoss,
    tradingFees: s.fees, networkFees: s.networkFees, netProfit: net,
    dailyRoiPct: base > 0 ? (net / base) * 100 : null, winRatePct: s.winRate,
    maxDrawdownPct: maxDrawdownPct(i.equityIntraday),
    bestTrade: s.best ? { mint: s.best.mint, symbol: s.best.symbol, netUsd: tradeNet(s.best) } : null,
    worstTrade: s.worst ? { mint: s.worst.mint, symbol: s.worst.symbol, netUsd: tradeNet(s.worst) } : null,
    mostTradedCoin: s.mostTraded,
  };
}
export type DailyReport = ReturnType<typeof buildDailyReport>;

export function buildMonthlyReport(i: { month: string; tz: string; openingBalance: number; closingBalance: number; trades: ClosedTrade[]; flows: CashFlow[]; equityDaily: number[] }) {
  const s = tradeStats(i.trades);
  const perCoin = new Map<string, { symbol?: string; net: number }>();
  const perDay = new Map<string, number>();
  for (const t of i.trades) {
    const n = tradeNet(t);
    const c = perCoin.get(t.mint) ?? { symbol: t.symbol, net: 0 }; c.net += n; perCoin.set(t.mint, c);
    const k = dayKey(t.closedAt, i.tz); perDay.set(k, (perDay.get(k) ?? 0) + n);
  }
  const coins = [...perCoin.entries()].map(([mint, v]) => ({ mint, ...v }));
  const days = [...perDay.entries()].map(([day, net]) => ({ day, net }));
  const pick = <T>(a: T[], f: (x: T) => number, max: boolean) => a.length ? a.reduce((p, c) => (max ? f(c) > f(p) : f(c) < f(p)) ? c : p) : null;
  const dep = i.flows.filter((f) => f.type === 'DEPOSIT').reduce((a, f) => a + f.amountUsd, 0);
  const base = i.openingBalance + dep;
  return {
    month: i.month, openingBalance: i.openingBalance, closingBalance: i.closingBalance,
    monthlyNetProfit: s.netProfit, monthlyRoiPct: base > 0 ? (s.netProfit / base) * 100 : null,
    totalVolume: s.volume, totalTransactions: s.trades * 2, monthlyWinRatePct: s.winRate,
    profitFactor: s.profitFactor, maxDrawdownPct: maxDrawdownPct(i.equityDaily),
    avgProfitPerWin: s.avgProfit, avgLossPerLoss: s.avgLoss, totalFees: s.fees + s.networkFees,
    bestCoin: pick(coins, (c) => c.net, true), worstCoin: pick(coins, (c) => c.net, false),
    bestDay: pick(days, (d) => d.net, true), worstDay: pick(days, (d) => d.net, false),
    charts: { equityCurve: i.equityDaily, dailyProfit: days.sort((a, b) => a.day.localeCompare(b.day)), coinPerformance: coins },
  };
}
export type MonthlyReport = ReturnType<typeof buildMonthlyReport>;

export interface CalendarDay { date: string; pnl: number; trades: number; winRatePct: number | null; best: number | null; worst: number | null; status: 'PROFIT' | 'LOSS' | 'NONE' }
export function buildCalendar(trades: ClosedTrade[], tz: string): CalendarDay[] {
  const m = new Map<string, ClosedTrade[]>();
  for (const t of trades) { const k = dayKey(t.closedAt, tz); (m.get(k) ?? m.set(k, []).get(k)!).push(t); }
  return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, ts]) => {
    const nets = ts.map(tradeNet); const pnl = nets.reduce((a, b) => a + b, 0);
    return { date, pnl, trades: ts.length, winRatePct: (nets.filter((n) => n > 0).length / ts.length) * 100, best: Math.max(...nets), worst: Math.min(...nets), status: pnl > 0 ? 'PROFIT' : pnl < 0 ? 'LOSS' : 'NONE' };
  });
}
export function tradesToCsv(trades: ClosedTrade[]): string {
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = ['mint', 'symbol', 'opened_at', 'closed_at', 'cost_usd', 'proceeds_usd', 'fees_usd', 'network_fees_usd', 'net_usd'];
  const rows = trades.map((t) => [t.mint, t.symbol, t.openedAt.toISOString(), t.closedAt.toISOString(), t.costUsd, t.proceedsUsd, t.feesUsd, t.networkFeesUsd, tradeNet(t)].map(esc).join(','));
  return [head.join(','), ...rows].join('\n');
}
