import { HardLimits, Mode, OrderProposal, PortfolioState, RiskDecision } from './types';

export const MODE_LIMITS: Record<Mode, HardLimits> = {
  CONSERVATIVE: { maxPositionPctOfEquity: 2, maxOpenPositions: 3, maxDailyLossPct: 3, maxSlippagePct: 3, minLiquidityUsd: 50_000, maxTop10HolderPct: 30, requireStopLoss: true, requireMintAuthorityRevoked: true, requireFreezeAuthorityRevoked: true },
  BALANCED:     { maxPositionPctOfEquity: 4, maxOpenPositions: 5, maxDailyLossPct: 5, maxSlippagePct: 6, minLiquidityUsd: 20_000, maxTop10HolderPct: 40, requireStopLoss: true, requireMintAuthorityRevoked: true, requireFreezeAuthorityRevoked: true },
  AGGRESSIVE:   { maxPositionPctOfEquity: 6, maxOpenPositions: 8, maxDailyLossPct: 8, maxSlippagePct: 10, minLiquidityUsd: 8_000, maxTop10HolderPct: 50, requireStopLoss: true, requireMintAuthorityRevoked: true, requireFreezeAuthorityRevoked: true },
};

/**
 * Pengguna boleh MENGETATKAN batas lewat instruksi, tidak pernah melonggarkan
 * melebihi batas mode. Field boolean 'require*' tidak dapat diubah.
 */
export function mergeUserLimits(mode: Mode, user: Partial<HardLimits> = {}): HardLimits {
  const base = MODE_LIMITS[mode];
  return {
    ...base,
    maxPositionPctOfEquity: Math.min(base.maxPositionPctOfEquity, user.maxPositionPctOfEquity ?? Infinity),
    maxOpenPositions: Math.min(base.maxOpenPositions, user.maxOpenPositions ?? Infinity),
    maxDailyLossPct: Math.min(base.maxDailyLossPct, user.maxDailyLossPct ?? Infinity),
    maxSlippagePct: Math.min(base.maxSlippagePct, user.maxSlippagePct ?? Infinity),
    minLiquidityUsd: Math.max(base.minLiquidityUsd, user.minLiquidityUsd ?? 0),
    maxTop10HolderPct: Math.min(base.maxTop10HolderPct, user.maxTop10HolderPct ?? Infinity),
  };
}

export function validateOrder(order: OrderProposal, pf: PortfolioState, limits: HardLimits): RiskDecision {
  const reasons: string[] = [];
  // SELL selalu diizinkan agar posisi bisa keluar (emergency sell).
  if (order.side === 'SELL') return { approved: true, reasons: [] };

  const t = order.token;
  const fail = (m: string) => reasons.push(m);

  if (pf.equityUsd <= 0) fail('Equity tidak valid');
  if (order.sizeUsd <= 0) fail('Ukuran order tidak valid');
  if (order.sizeUsd > (pf.equityUsd * limits.maxPositionPctOfEquity) / 100) fail('Ukuran posisi melebihi batas');
  if (pf.openPositions >= limits.maxOpenPositions) fail('Jumlah posisi terbuka mencapai batas');
  if (pf.dailyRealizedPnlUsd <= -(pf.equityUsd * limits.maxDailyLossPct) / 100) fail('Batas kerugian harian tercapai');
  if (limits.requireStopLoss && (order.stopLossPct === null || order.stopLossPct <= 0)) fail('Stop loss wajib');

  // Data UNKNOWN pada pemeriksaan keamanan = ditolak (fail-closed).
  if (t.mintAuthorityRevoked !== true) fail('Mint authority belum terbukti dicabut');
  if (t.freezeAuthorityRevoked !== true) fail('Freeze authority belum terbukti dicabut');
  if (t.honeypotSuspected !== false) fail('Honeypot tidak dapat dipastikan aman');
  if (t.liquidityUsd === 'UNKNOWN' || t.liquidityUsd < limits.minLiquidityUsd) fail('Likuiditas kurang/tidak diketahui');
  if (t.top10HolderPct === 'UNKNOWN' || t.top10HolderPct > limits.maxTop10HolderPct) fail('Konsentrasi holder tinggi/tidak diketahui');
  if (t.estSlippagePct === 'UNKNOWN' || t.estSlippagePct > limits.maxSlippagePct) fail('Slippage tinggi/tidak diketahui');

  return { approved: reasons.length === 0, reasons };
}

declare const approvedBrand: unique symbol;
/** Hanya dapat dibuat lewat approveOrder(); Execution Agent WAJIB menerima tipe ini. */
export type ApprovedOrder = OrderProposal & { readonly [approvedBrand]: true };
export function approveOrder(order: OrderProposal, pf: PortfolioState, limits: HardLimits): { ok: true; order: ApprovedOrder } | { ok: false; reasons: string[] } {
  const d = validateOrder(order, pf, limits);
  return d.approved ? { ok: true, order: order as ApprovedOrder } : { ok: false, reasons: d.reasons };
}
