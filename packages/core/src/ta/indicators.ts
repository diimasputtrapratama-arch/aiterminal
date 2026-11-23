import type { Candle } from '../market/dexscreener';
export const ema = (v: number[], p: number): number[] => { const k = 2 / (p + 1); const o: number[] = []; v.forEach((x, i) => o.push(i === 0 ? x : x * k + o[i - 1] * (1 - k))); return o; };
export function rsi(closes: number[], p = 14): number | null {
  if (closes.length <= p) return null; let g = 0, l = 0;
  for (let i = 1; i <= p; i++) { const d = closes[i] - closes[i - 1]; d >= 0 ? (g += d) : (l -= d); }
  g /= p; l /= p;
  for (let i = p + 1; i < closes.length; i++) { const d = closes[i] - closes[i - 1]; g = (g * (p - 1) + Math.max(d, 0)) / p; l = (l * (p - 1) + Math.max(-d, 0)) / p; }
  return l === 0 ? 100 : 100 - 100 / (1 + g / l);
}
/** ATR dalam % dari harga terakhir. */
export function atrPct(c: Candle[], p = 14): number | null {
  if (c.length <= p) return null; const tr: number[] = [];
  for (let i = 1; i < c.length; i++) tr.push(Math.max(c[i].h - c[i].l, Math.abs(c[i].h - c[i - 1].c), Math.abs(c[i].l - c[i - 1].c)));
  const a = tr.slice(-p).reduce((x, y) => x + y, 0) / p; const last = c[c.length - 1].c; return last > 0 ? (a / last) * 100 : null;
}
export interface TaReport { rsi: number | null; ema9AboveEma21: boolean | null; atrPct: number | null; breakout: boolean | null; volumeSpike: boolean | null; dumpRisk: 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN'; momentum: 'UP' | 'DOWN' | 'FLAT' | 'UNKNOWN' }
export function analyzeTa(c: Candle[]): TaReport {
  if (c.length < 25) return { rsi: null, ema9AboveEma21: null, atrPct: null, breakout: null, volumeSpike: null, dumpRisk: 'UNKNOWN', momentum: 'UNKNOWN' };
  const cl = c.map((x) => x.c); const e9 = ema(cl, 9), e21 = ema(cl, 21); const r = rsi(cl);
  const last = c[c.length - 1], prevHigh = Math.max(...c.slice(-21, -1).map((x) => x.h));
  const avgVol = c.slice(-21, -1).reduce((a, x) => a + x.v, 0) / 20;
  const spike = avgVol > 0 ? last.v > avgVol * 2.5 : null;
  const breakout = last.c > prevHigh;
  const peak = Math.max(...c.slice(-30).map((x) => x.h)); const drawFromPeak = peak > 0 ? ((peak - last.c) / peak) * 100 : 0;
  const redRun = c.slice(-4).every((x) => x.c < x.o);
  const dump: TaReport['dumpRisk'] = drawFromPeak > 35 || (redRun && last.v > avgVol * 2) ? 'HIGH' : drawFromPeak > 20 || (r !== null && r > 85) ? 'MEDIUM' : 'LOW';
  const mom = e9[e9.length - 1] > e21[e21.length - 1] * 1.002 ? 'UP' : e9[e9.length - 1] < e21[e21.length - 1] * 0.998 ? 'DOWN' : 'FLAT';
  return { rsi: r, ema9AboveEma21: e9[e9.length - 1] > e21[e21.length - 1], atrPct: atrPct(c), breakout, volumeSpike: spike, dumpRisk: dump, momentum: mom };
}
