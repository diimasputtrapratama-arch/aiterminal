import type { Maybe, Mode, HardLimits, PortfolioState, OrderProposal } from '../risk/types';
import { approveOrder, mergeUserLimits, type ApprovedOrder } from '../risk/riskEngine';
import { scoreToken, entryVerdict, type ScoreCard, type TokenFeatures, type EntryVerdict } from '../scoring/scoring';
import { analyzeSecurity, type SecurityInput, type SecurityReport } from '../security/analyzer';
import { analyzeTa, type TaReport } from '../ta/indicators';
import { estimateSlippagePct } from '../trading/fills';
import { DEFAULT_TPSL, type TpSlConfig } from '../trading/tpsl';
import type { MarketSnapshot, Candle } from '../market/dexscreener';
import { askClaude, type LlmConfig } from './llm';
import { tradeStats, tradeNet, type ClosedTrade } from '../pnl/pnl';

export type AgentName = 'MarketResearch' | 'MemeScanner' | 'OnChainIntelligence' | 'TokenSecurity' | 'TechnicalAnalysis' | 'TradingStrategy' | 'RiskManagement' | 'Execution' | 'PortfolioManager' | 'PerformanceAnalyst' | 'DailyReporting' | 'MonthlyReporting';
export interface AgentResult<T = unknown> { agent: AgentName; ok: boolean; output: T; notes: string[]; ms: number }
export type AgentLogger = (r: AgentResult, mint?: string) => void | Promise<void>;
const U = 'UNKNOWN' as const;

export interface TokenContext {
  mint: string; symbol?: string; source: string;
  market: MarketSnapshot | null; candles: Candle[];
  security: SecurityInput;
  holders: Maybe<number>; holdersGrowth1hPct: Maybe<number>;
  smartWalletBuys: Maybe<number>; socialMentions1h: Maybe<number>;
}
export interface UserTradingConfig {
  mode: Mode; limits: Partial<HardLimits>; tpsl: TpSlConfig;
  filters: { maxVolatilityPct?: number; minRiskReward?: number; excludeInsiderDump?: boolean; minHolderGrowthPct?: number };
  portfolio: PortfolioState; sizePctOfEquity: number; autoTrade: boolean; sol24hChangePct?: Maybe<number>;
}
async function timed<T>(agent: AgentName, notes: string[], fn: () => Promise<T> | T, log?: AgentLogger, mint?: string): Promise<AgentResult<T | null>> {
  const t0 = Date.now(); let r: AgentResult<T | null>;
  try { r = { agent, ok: true, output: await fn(), notes, ms: 0 }; } catch (e) { notes.push('ERROR: ' + (e as Error).message); r = { agent, ok: false, output: null, notes, ms: 0 }; }
  r.ms = Date.now() - t0; await log?.(r as AgentResult, mint); return r;
}
const f = <T,>(v: Maybe<T> | undefined): Maybe<T> => (v === undefined ? U : v);

export function buildFeatures(c: TokenContext, sec: SecurityReport): TokenFeatures {
  const m = c.market;
  return {
    ageMinutes: m && m.pairCreatedAtMs !== U ? (Date.now() - m.pairCreatedAtMs) / 60000 : U,
    priceChange5mPct: f(m?.change5m), priceChange1hPct: f(m?.change1h), volume5mUsd: f(m?.volume5m), volume1hUsd: f(m?.volume1h),
    liquidityUsd: f(m?.liquidityUsd), marketCapUsd: f(m?.marketCapUsd), buys5m: f(m?.buys5m), sells5m: f(m?.sells5m),
    holders: c.holders, holdersGrowth1hPct: c.holdersGrowth1hPct, smartWalletBuys: c.smartWalletBuys, socialMentions1h: c.socialMentions1h,
    hasTwitter: m ? m.twitter !== U : U, hasTelegram: m ? m.telegram !== U : U,
    securityRiskScore: sec.riskScore, rugRiskScore: sec.rugRiskScore,
  };
}

export interface PipelineOutput {
  results: AgentResult[]; card?: ScoreCard; security?: SecurityReport; ta?: TaReport; verdict?: EntryVerdict;
  signal: 'BUY' | 'WATCH' | 'SKIP'; order?: ApprovedOrder; rejected?: string[]; tpsl?: TpSlConfig; reasons: string[];
}
/** Agent 1-8 berjalan berurutan; Execution hanya menerima ApprovedOrder dari Risk Management. */
export async function runEntryPipeline(
  ctx: TokenContext, cfg: UserTradingConfig,
  deps: { llm?: LlmConfig; log?: AgentLogger; execute?: (o: ApprovedOrder, tpsl: TpSlConfig) => Promise<unknown> },
): Promise<PipelineOutput> {
  const results: AgentResult[] = []; const reasons: string[] = [];
  const push = (r: AgentResult<unknown>) => results.push(r as AgentResult);

  // 1. Market research
  push(await timed('MarketResearch', [], async () => {
    const reg = cfg.sol24hChangePct === undefined || cfg.sol24hChangePct === U ? 'UNKNOWN' : cfg.sol24hChangePct < -6 ? 'RISK_OFF' : cfg.sol24hChangePct > 4 ? 'RISK_ON' : 'NEUTRAL';
    let text = `Rezim pasar: ${reg}`;
    if (deps.llm) { try { text = await askClaude(deps.llm, 'Kamu analis pasar kripto. Jawab ringkas (maks 3 kalimat), jangan mengarang data.', `SOL 24h: ${cfg.sol24hChangePct}%. Rezim: ${reg}.`, 300); } catch { /* fallback */ } }
    return { regime: reg, text };
  }, deps.log, ctx.mint));
  const regime = (results[0].output as any)?.regime;

  // 3. On-chain (data sudah dikumpulkan worker; agent ini merangkum & menandai UNKNOWN)
  push(await timed('OnChainIntelligence', [], () => ({ top10: ctx.security.top10HolderPct, bundled: ctx.security.bundledPct, creator: ctx.security.creatorHoldPct, holders: ctx.holders, unknown: Object.entries(ctx.security).filter(([, v]) => v === U).map(([k]) => k) }), deps.log, ctx.mint));

  // 4. Security
  const secR = await timed('TokenSecurity', [], () => analyzeSecurity(ctx.security), deps.log, ctx.mint); push(secR);
  const security = secR.output as SecurityReport;
  if (!security) return { results, signal: 'SKIP', reasons: ['Security agent gagal'] };

  // 2. Scanner (skor)
  const cardR = await timed('MemeScanner', [], () => scoreToken(buildFeatures(ctx, security)), deps.log, ctx.mint); push(cardR);
  const card = cardR.output as ScoreCard;

  // 5. TA
  const taR = await timed('TechnicalAnalysis', [], () => analyzeTa(ctx.candles), deps.log, ctx.mint); push(taR);
  const ta = taR.output as TaReport;

  // 6. Strategy
  const stratR = await timed('TradingStrategy', [], () => {
    const v = entryVerdict(card, cfg.mode); const why = [...v.reasons];
    let action = v.action;
    const flt = cfg.filters;
    if (flt.maxVolatilityPct !== undefined && ta.atrPct !== null && ta.atrPct > flt.maxVolatilityPct) { action = 'WATCH'; why.push(`Volatilitas ${ta.atrPct.toFixed(1)}% > ${flt.maxVolatilityPct}%`); }
    if (flt.excludeInsiderDump && (security.flags.some((x) => x.includes('Creator sudah menjual')) || ta.dumpRisk === 'HIGH')) { action = 'SKIP'; why.push('Indikasi insider dumping / dump risk tinggi'); }
    if (flt.minHolderGrowthPct !== undefined && (ctx.holdersGrowth1hPct === U || (ctx.holdersGrowth1hPct as number) < flt.minHolderGrowthPct)) { if (action === 'BUY') action = 'WATCH'; why.push('Pertumbuhan holder belum memenuhi filter'); }
    if (regime === 'RISK_OFF' && cfg.mode !== 'AGGRESSIVE' && action === 'BUY') { action = 'WATCH'; why.push('Pasar RISK_OFF'); }
    if (ta.dumpRisk === 'HIGH' && action === 'BUY') { action = 'WATCH'; why.push('TA: dump risk tinggi'); }
    const tp = cfg.tpsl; const avgTp = tp.tpLevels.reduce((a, l) => a + l.gainPct * l.sellPct, 0) / Math.max(1, tp.tpLevels.reduce((a, l) => a + l.sellPct, 0));
    const rr = avgTp / tp.stopLossPct;
    if (flt.minRiskReward !== undefined && rr < flt.minRiskReward) { action = 'SKIP'; why.push(`R/R ${rr.toFixed(2)} < ${flt.minRiskReward}`); }
    return { verdict: { action, reasons: why } as EntryVerdict, rr };
  }, deps.log, ctx.mint); push(stratR);
  const verdict = (stratR.output as any)?.verdict as EntryVerdict | undefined;
  if (!verdict || verdict.action !== 'BUY') return { results, card, security, ta, verdict, signal: verdict?.action ?? 'SKIP', reasons: verdict?.reasons ?? ['Strategy gagal'], tpsl: cfg.tpsl };

  // 9. Portfolio (ukuran posisi)
  const limits = mergeUserLimits(cfg.mode, cfg.limits);
  const pfR = await timed('PortfolioManager', [], () => {
    const maxUsd = (cfg.portfolio.equityUsd * limits.maxPositionPctOfEquity) / 100;
    return { sizeUsd: Math.min(maxUsd, (cfg.portfolio.equityUsd * cfg.sizePctOfEquity) / 100) };
  }, deps.log, ctx.mint); push(pfR);
  const sizeUsd = (pfR.output as any)?.sizeUsd ?? 0;

  // 7. Risk
  const liq = ctx.market?.liquidityUsd ?? U;
  const proposal: OrderProposal = { side: 'BUY', sizeUsd, stopLossPct: cfg.tpsl.stopLossPct, token: {
    mint: ctx.mint, liquidityUsd: liq, top10HolderPct: ctx.security.top10HolderPct,
    mintAuthorityRevoked: ctx.security.mintAuthorityRevoked, freezeAuthorityRevoked: ctx.security.freezeAuthorityRevoked,
    lpLockedOrBurned: ctx.security.lpLockedOrBurned, honeypotSuspected: security.honeypotSuspected,
    estSlippagePct: liq === U ? U : estimateSlippagePct(sizeUsd, liq) } };
  const riskR = await timed('RiskManagement', [], () => approveOrder(proposal, cfg.portfolio, limits), deps.log, ctx.mint); push(riskR);
  const decision = riskR.output as ReturnType<typeof approveOrder> | null;
  if (!decision || !decision.ok) { const rr = decision && !decision.ok ? decision.reasons : ['Risk agent gagal']; return { results, card, security, ta, verdict, signal: 'WATCH', rejected: rr, reasons: rr, tpsl: cfg.tpsl }; }

  // 8. Execution (hanya jika diizinkan pengguna)
  if (cfg.autoTrade && deps.execute) {
    push(await timed('Execution', [], () => deps.execute!(decision.order, cfg.tpsl), deps.log, ctx.mint));
  } else reasons.push('Auto-trade nonaktif: hanya sinyal');
  return { results, card, security, ta, verdict, signal: 'BUY', order: decision.order, tpsl: cfg.tpsl, reasons: [...verdict.reasons, ...reasons] };
}

/** Agent 10: Performance Analyst — mendeteksi masalah & mengusulkan (bukan menerapkan) perubahan. */
export interface TradeMeta { trade: ClosedTrade; strategyId?: string; entrySlippagePct?: number; peakGainPct?: number; exitGainPct?: number }
export interface PerfIssue { code: 'FREQUENT_LOSS' | 'LOW_WIN_RATE' | 'LATE_ENTRY_SLIPPAGE' | 'EXIT_TOO_EARLY' | 'EXIT_TOO_LATE' | 'OVERTRADING' | 'VOLATILITY_LOSS' | 'COIN_SELECTION'; detail: string; suggestion: string }
export function analyzePerformance(rows: TradeMeta[], opts: { maxTradesPerDay?: number } = {}): PerfIssue[] {
  const out: PerfIssue[] = []; if (rows.length < 5) return out;
  const st = tradeStats(rows.map((r) => r.trade));
  if (st.winRate !== null && st.winRate < 35 && rows.length >= 10) out.push({ code: 'LOW_WIN_RATE', detail: `Win rate ${st.winRate.toFixed(0)}% dari ${rows.length} trade`, suggestion: 'Naikkan minOpportunity / gunakan mode lebih konservatif' });
  let streak = 0, maxStreak = 0; for (const r of rows) { if (tradeNet(r.trade) < 0) { streak++; maxStreak = Math.max(maxStreak, streak); } else streak = 0; }
  if (maxStreak >= 5) out.push({ code: 'FREQUENT_LOSS', detail: `Rentetan ${maxStreak} loss berturut-turut`, suggestion: 'Jeda strategi dan tinjau filter keamanan' });
  const sl = rows.filter((r) => r.entrySlippagePct !== undefined); if (sl.length && sl.reduce((a, r) => a + r.entrySlippagePct!, 0) / sl.length > 5) out.push({ code: 'LATE_ENTRY_SLIPPAGE', detail: 'Rata-rata slippage entry >5%', suggestion: 'Turunkan maxSlippagePct atau perkecil ukuran posisi' });
  const early = rows.filter((r) => r.peakGainPct !== undefined && r.exitGainPct !== undefined && r.peakGainPct > 60 && r.exitGainPct < r.peakGainPct * 0.3 && r.exitGainPct > 0);
  if (early.length >= 3) out.push({ code: 'EXIT_TOO_LATE', detail: `${early.length} trade memberi kembali >70% keuntungan puncak`, suggestion: 'Aktifkan/ketatkan trailing stop' });
  const cut = rows.filter((r) => r.peakGainPct !== undefined && r.exitGainPct !== undefined && r.exitGainPct > 0 && r.exitGainPct < 10 && r.peakGainPct > 100);
  if (cut.length >= 3) out.push({ code: 'EXIT_TOO_EARLY', detail: `${cut.length} trade keluar <10% padahal puncak >100%`, suggestion: 'Longgarkan level TP awal / perbesar trailing' });
  const perDay = new Map<string, number>(); rows.forEach((r) => { const k = r.trade.closedAt.toISOString().slice(0, 10); perDay.set(k, (perDay.get(k) ?? 0) + 1); });
  const limit = opts.maxTradesPerDay ?? 30; if ([...perDay.values()].some((c) => c > limit)) out.push({ code: 'OVERTRADING', detail: `Ada hari dengan >${limit} trade`, suggestion: 'Batasi maxTradesPerDay' });
  return out;
}

/** Agent 11/12: ringkasan deterministik + opsional LLM. Tidak mengarang angka: LLM hanya diberi data laporan. */
export async function aiSummary(kind: 'daily' | 'monthly', report: unknown, issues: PerfIssue[], llm?: LlmConfig): Promise<string> {
  const base = `Ringkasan ${kind === 'daily' ? 'harian' : 'bulanan'} (otomatis):\n` + JSON.stringify(report).slice(0, 1500) + (issues.length ? '\nMasalah terdeteksi: ' + issues.map((i) => `${i.code} (${i.detail})`).join('; ') : '');
  if (!llm) return base;
  try {
    return await askClaude(llm, 'Kamu analis trading. Gunakan HANYA angka pada data. Jelaskan: kondisi trading, strategi berhasil/gagal, kesalahan entry/exit, risiko, rekomendasi. Bahasa Indonesia, ringkas. Jangan menjanjikan profit.', JSON.stringify({ report, issues }), 900);
  } catch { return base; }
}
