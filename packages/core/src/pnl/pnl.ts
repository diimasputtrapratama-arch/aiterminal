export interface ClosedTrade {
  mint: string; symbol?: string; strategyId?: string;
  openedAt: Date; closedAt: Date;
  costUsd: number;        // modal masuk (belum termasuk fee)
  proceedsUsd: number;    // hasil jual kotor
  feesUsd: number;        // fee DEX/protokol (buy+sell)
  networkFeesUsd: number; // fee jaringan + priority
}
export interface CashFlow { at: Date; type: 'DEPOSIT' | 'WITHDRAWAL'; amountUsd: number }
export const tradeNet = (t: ClosedTrade) => t.proceedsUsd - t.costUsd - t.feesUsd - t.networkFeesUsd;

export interface TradeStats {
  trades: number; wins: number; losses: number; winRate: number | null;
  realizedProfit: number; realizedLoss: number; netProfit: number;
  fees: number; networkFees: number; volume: number;
  profitFactor: number | null; avgProfit: number | null; avgLoss: number | null;
  best: ClosedTrade | null; worst: ClosedTrade | null;
  mostTraded: { mint: string; symbol?: string; count: number } | null;
}
export function tradeStats(ts: ClosedTrade[]): TradeStats {
  let rp = 0, rl = 0, w = 0, l = 0, fees = 0, nf = 0, vol = 0;
  let best: ClosedTrade | null = null, worst: ClosedTrade | null = null;
  const cnt = new Map<string, { symbol?: string; count: number }>();
  for (const t of ts) {
    const n = tradeNet(t);
    if (n > 0) { rp += n; w++; } else if (n < 0) { rl += -n; l++; }
    fees += t.feesUsd; nf += t.networkFeesUsd; vol += t.costUsd + t.proceedsUsd;
    if (!best || n > tradeNet(best)) best = t;
    if (!worst || n < tradeNet(worst)) worst = t;
    const c = cnt.get(t.mint) ?? { symbol: t.symbol, count: 0 };
    c.count++; cnt.set(t.mint, c);
  }
  let mt: TradeStats['mostTraded'] = null;
  for (const [mint, c] of cnt) if (!mt || c.count > mt.count) mt = { mint, symbol: c.symbol, count: c.count };
  return {
    trades: ts.length, wins: w, losses: l, winRate: ts.length ? (w / ts.length) * 100 : null,
    realizedProfit: rp, realizedLoss: rl, netProfit: rp - rl, fees, networkFees: nf, volume: vol,
    profitFactor: rl > 0 ? rp / rl : rp > 0 ? null : null, // null = tak terdefinisi (tanpa loss)
    avgProfit: w ? rp / w : null, avgLoss: l ? rl / l : null, best, worst, mostTraded: mt,
  };
}
/** Max drawdown (%) dari deret equity yang sudah dikoreksi cash flow. */
export function maxDrawdownPct(equity: number[]): number {
  let peak = -Infinity, mdd = 0;
  for (const e of equity) { peak = Math.max(peak, e); if (peak > 0) mdd = Math.max(mdd, ((peak - e) / peak) * 100); }
  return mdd;
}
/** Deret equity dikoreksi: deposit/withdrawal TIDAK dihitung sebagai profit/rugi. */
export function adjustedEquitySeries(points: { at: Date; equity: number }[], flows: CashFlow[]): number[] {
  const sorted = [...flows].sort((a, b) => +a.at - +b.at);
  const signed = (f: CashFlow) => (f.type === 'DEPOSIT' ? f.amountUsd : -f.amountUsd);
  const cumAt = (t: Date) => sorted.filter((f) => +f.at <= +t).reduce((a, f) => a + signed(f), 0);
  if (!points.length) return [];
  const base = cumAt(points[0].at);
  return points.map((p) => p.equity - (cumAt(p.at) - base));
}
export function roiPct(netProfit: number, base: number): number | null { return base > 0 ? (netProfit / base) * 100 : null; }
