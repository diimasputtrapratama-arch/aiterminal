import type { HardLimits, Mode } from '../risk/types';
import type { TpSlConfig } from '../trading/tpsl';

export type InstructionKind = 'ANALYSIS' | 'STRATEGY' | 'RISK' | 'EXECUTION_PERMISSION';
export interface ParsedParams {
  mode?: Mode;
  limits?: Partial<HardLimits>;
  filters?: { minHolderGrowthPct?: number; minVolumeGrowthPct?: number; excludeInsiderDump?: boolean; maxVolatilityPct?: number; minRiskReward?: number; timeframe?: '1m' | '5m' | '15m' | '1h' };
  tpsl?: Partial<TpSlConfig>;
  execution?: { autoTrade?: boolean; maxTradesPerDay?: number };
  warnings: string[];
}
/** Pola yang mencoba mematikan perlindungan: SELALU diabaikan. */
const FORBIDDEN = /(nonaktif|matikan|disable|turn off|abaikan|ignore|skip|tanpa|bypass|hilangkan|no)\s+(the\s+)?(stop\s*loss|sl\b|risk|validasi|validation|security|keamanan|safety|pemeriksaan|check)/i;

const num = (s: string) => Number(s.replace(',', '.'));
/** Parser berbasis aturan (ID + EN). Output tetap dilewatkan sanitizeParams(). */
export function parseInstruction(text: string, kind: InstructionKind): ParsedParams {
  const out: ParsedParams = { warnings: [] };
  const t = text.toLowerCase();
  if (FORBIDDEN.test(t)) out.warnings.push('Instruksi untuk menonaktifkan validasi/stop loss/keamanan DIABAIKAN.');
  const m = (re: RegExp) => { const r = t.match(re); return r ? num(r[1]) : undefined; };

  if (/konservatif|conservative/.test(t)) out.mode = 'CONSERVATIVE';
  else if (/agresif|aggressive/.test(t)) out.mode = 'AGGRESSIVE';
  else if (/seimbang|balanced/.test(t)) out.mode = 'BALANCED';

  const top10 = m(/(?:top\s*10|konsentrasi holder)[^0-9]{0,25}(\d+(?:[.,]\d+)?)\s*%/);
  const liq = m(/(?:likuiditas|liquidity)[^0-9$]{0,25}\$?\s*(\d[\d.,]*)\s*(?:k|rb)?/);
  const sl = m(/(?:stop\s*loss|sl)[^0-9]{0,15}-?(\d+(?:[.,]\d+)?)\s*%/);
  const pos = m(/(?:ukuran posisi|position size|maks(?:imal)? posisi)[^0-9]{0,20}(\d+(?:[.,]\d+)?)\s*%/);
  const dl = m(/(?:rugi harian|daily loss)[^0-9]{0,20}(\d+(?:[.,]\d+)?)\s*%/);
  const slip = m(/slippage[^0-9]{0,15}(\d+(?:[.,]\d+)?)\s*%/);
  const rr = m(/(?:risk\s*\/?\s*reward|r\/r|rr)[^0-9]{0,15}(\d+(?:[.,]\d+)?)/);
  const vol = m(/volatilitas[^0-9]{0,20}(\d+(?:[.,]\d+)?)\s*%/);
  out.limits = {};
  if (top10 !== undefined) out.limits.maxTop10HolderPct = top10;
  if (liq !== undefined) out.limits.minLiquidityUsd = /k|rb/.test(t.match(/(?:likuiditas|liquidity)[^0-9$]{0,25}\$?\s*\d[\d.,]*\s*(k|rb)?/)?.[1] ?? '') ? liq * 1000 : liq;
  if (pos !== undefined) out.limits.maxPositionPctOfEquity = pos;
  if (dl !== undefined) out.limits.maxDailyLossPct = dl;
  if (slip !== undefined) out.limits.maxSlippagePct = slip;
  if (sl !== undefined) out.tpsl = { stopLossPct: sl };
  out.filters = {};
  if (rr !== undefined) out.filters.minRiskReward = rr;
  if (vol !== undefined) out.filters.maxVolatilityPct = vol;
  if (/insider|dumping|dump/.test(t) && /hindari|jangan|avoid|no\b|don't/.test(t)) out.filters.excludeInsiderDump = true;
  const tf = t.match(/\b(1m|5m|15m|1h)\b/); if (tf) out.filters.timeframe = tf[1] as '1m';
  if (/jangka pendek|short[- ]term|scalp/.test(t)) out.filters.timeframe = out.filters.timeframe ?? '5m';
  const hg = m(/(?:pertumbuhan holder|holder growth)[^0-9]{0,20}(\d+(?:[.,]\d+)?)\s*%/);
  if (hg !== undefined) out.filters.minHolderGrowthPct = hg;
  if (kind === 'EXECUTION_PERMISSION') {
    if (/(izinkan|allow|aktifkan|enable).*(auto|otomatis)/.test(t)) out.execution = { autoTrade: true };
    if (/(larang|disallow|stop|matikan).*(auto|otomatis)/.test(t)) out.execution = { autoTrade: false };
    const mt = m(/(?:maks(?:imal)?|max)[^0-9]{0,15}(\d+)\s*(?:trade|transaksi)/);
    if (mt !== undefined) out.execution = { ...(out.execution ?? {}), maxTradesPerDay: mt };
  }
  return out;
}

/** Whitelist + clamp. Bagian LLM atau pengguna yang tak lolos dibuang. */
export function sanitizeParams(p: ParsedParams): ParsedParams {
  const w = [...p.warnings];
  const r = (v: number | undefined, lo: number, hi: number, name: string) => {
    if (v === undefined) return undefined;
    if (!Number.isFinite(v) || v < lo || v > hi) { w.push(`${name} di luar rentang ${lo}..${hi}, diabaikan`); return undefined; }
    return v;
  };
  const l = p.limits ?? {};
  const limits: Partial<HardLimits> = {};
  const a = r(l.maxPositionPctOfEquity, 0.1, 10, 'maxPositionPctOfEquity'); if (a !== undefined) limits.maxPositionPctOfEquity = a;
  const b = r(l.maxOpenPositions, 1, 20, 'maxOpenPositions'); if (b !== undefined) limits.maxOpenPositions = b;
  const c = r(l.maxDailyLossPct, 0.5, 15, 'maxDailyLossPct'); if (c !== undefined) limits.maxDailyLossPct = c;
  const d = r(l.maxSlippagePct, 0.1, 15, 'maxSlippagePct'); if (d !== undefined) limits.maxSlippagePct = d;
  const e = r(l.minLiquidityUsd, 1000, 5e6, 'minLiquidityUsd'); if (e !== undefined) limits.minLiquidityUsd = e;
  const f = r(l.maxTop10HolderPct, 5, 90, 'maxTop10HolderPct'); if (f !== undefined) limits.maxTop10HolderPct = f;
  const tpsl: Partial<TpSlConfig> = {};
  const sl = r(p.tpsl?.stopLossPct, 1, 50, 'stopLossPct'); if (sl !== undefined) tpsl.stopLossPct = sl;
  if (p.tpsl?.tpLevels) tpsl.tpLevels = p.tpsl.tpLevels;
  if (p.tpsl?.trailing) tpsl.trailing = p.tpsl.trailing;
  const filters = { ...(p.filters ?? {}) };
  const mt = r(p.execution?.maxTradesPerDay, 1, 200, 'maxTradesPerDay');
  return {
    mode: p.mode, limits, tpsl, filters, warnings: w,
    execution: p.execution ? { autoTrade: p.execution.autoTrade, maxTradesPerDay: mt } : undefined,
  };
}
