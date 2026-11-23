export interface TpLevel { gainPct: number; sellPct: number } // sellPct = % dari posisi awal
export interface TpSlConfig {
  tpLevels: TpLevel[];
  stopLossPct: number;
  trailing?: { activateGainPct: number; trailPct: number };
  breakEven?: { atGainPct: number; offsetPct?: number };
  volatilityStop?: { atrPct: number; multiplier: number };
  maxHoldMinutes?: number;
}
export const DEFAULT_TPSL: TpSlConfig = {
  tpLevels: [{ gainPct: 20, sellPct: 25 }, { gainPct: 50, sellPct: 25 }, { gainPct: 100, sellPct: 25 }, { gainPct: 200, sellPct: 25 }],
  stopLossPct: 15,
  trailing: { activateGainPct: 30, trailPct: 12 },
  breakEven: { atGainPct: 20, offsetPct: 1 },
};
export interface PositionState {
  entryPrice: number;
  openedAtMs: number;
  initialQty: number;
  remainingQty: number;
  highestPrice: number;
  tpHit: number[];
  stopPrice: number;
}
export type ExitReason = 'TP' | 'SL' | 'TRAILING' | 'BREAK_EVEN' | 'TIME' | 'EMERGENCY' | 'AI_EXIT';
export interface ExitAction { qty: number; reason: ExitReason; detail: string }
export interface EvalInput { price: number; nowMs: number; emergency?: boolean; aiExit?: boolean }

export function validateTpSl(c: TpSlConfig): string[] {
  const e: string[] = [];
  if (!(c.stopLossPct > 0 && c.stopLossPct < 100)) e.push('stopLossPct harus 0..100');
  let sum = 0, last = -1;
  for (const l of c.tpLevels) {
    if (l.gainPct <= 0 || l.sellPct <= 0 || l.sellPct > 100) e.push('Level TP tidak valid');
    if (l.gainPct <= last) e.push('Level TP harus naik berurutan');
    last = l.gainPct; sum += l.sellPct;
  }
  if (sum > 100) e.push('Total sellPct > 100');
  return e;
}
export function newPosition(entryPrice: number, qty: number, nowMs: number, c: TpSlConfig): PositionState {
  return { entryPrice, openedAtMs: nowMs, initialQty: qty, remainingQty: qty, highestPrice: entryPrice, tpHit: [], stopPrice: entryPrice * (1 - c.stopLossPct / 100) };
}

/** Murni & deterministik. Mengembalikan state baru + aksi jual. */
export function evaluatePosition(p: PositionState, c: TpSlConfig, i: EvalInput): { state: PositionState; actions: ExitAction[] } {
  const s: PositionState = { ...p, tpHit: [...p.tpHit] };
  const acts: ExitAction[] = [];
  if (s.remainingQty <= 0) return { state: s, actions: [] };
  const gain = (i.price / s.entryPrice - 1) * 100;
  s.highestPrice = Math.max(s.highestPrice, i.price);

  if (i.emergency) return { state: { ...s, remainingQty: 0 }, actions: [{ qty: s.remainingQty, reason: 'EMERGENCY', detail: 'Emergency sell' }] };
  if (i.aiExit) return { state: { ...s, remainingQty: 0 }, actions: [{ qty: s.remainingQty, reason: 'AI_EXIT', detail: 'AI exit' }] };

  if (c.breakEven && gain >= c.breakEven.atGainPct) {
    const be = s.entryPrice * (1 + (c.breakEven.offsetPct ?? 0) / 100);
    if (be > s.stopPrice) s.stopPrice = be;
  }
  if (c.trailing && gain >= c.trailing.activateGainPct) {
    const tr = s.highestPrice * (1 - c.trailing.trailPct / 100);
    if (tr > s.stopPrice) s.stopPrice = tr;
  }
  if (c.volatilityStop && c.volatilityStop.atrPct > 0) {
    const vs = s.highestPrice * (1 - Math.min(c.stopLossPct, c.volatilityStop.atrPct * c.volatilityStop.multiplier) / 100);
    if (vs > s.stopPrice) s.stopPrice = vs;
  }
  if (i.price <= s.stopPrice) {
    const hardSl = i.price <= s.entryPrice * (1 - c.stopLossPct / 100);
    const reason: ExitReason = hardSl ? 'SL' : (s.stopPrice > s.entryPrice * 1.0001 ? 'TRAILING' : 'BREAK_EVEN');
    acts.push({ qty: s.remainingQty, reason, detail: `Harga ${i.price} <= stop ${s.stopPrice}` });
    s.remainingQty = 0;
    return { state: s, actions: acts };
  }
  c.tpLevels.forEach((l, idx) => {
    if (s.remainingQty > 0 && !s.tpHit.includes(idx) && gain >= l.gainPct) {
      const qty = Math.min(s.remainingQty, s.initialQty * (l.sellPct / 100));
      s.remainingQty -= qty; s.tpHit.push(idx);
      acts.push({ qty, reason: 'TP', detail: `TP${idx + 1} +${l.gainPct}%` });
    }
  });
  if (s.remainingQty > 1e-12 && c.maxHoldMinutes && i.nowMs - s.openedAtMs > c.maxHoldMinutes * 60000) {
    acts.push({ qty: s.remainingQty, reason: 'TIME', detail: 'Batas waktu hold' });
    s.remainingQty = 0;
  }
  if (s.remainingQty < 1e-12) s.remainingQty = 0;
  return { state: s, actions: acts };
}

/** Saran AI tidak boleh melonggarkan batas pengguna. */
export function clampAiSuggestion(sug: Partial<TpSlConfig>, user: TpSlConfig): TpSlConfig {
  const out: TpSlConfig = { ...user };
  if (sug.stopLossPct !== undefined) out.stopLossPct = Math.min(user.stopLossPct, Math.max(1, sug.stopLossPct));
  if (sug.tpLevels && validateTpSl({ ...user, tpLevels: sug.tpLevels }).length === 0) out.tpLevels = sug.tpLevels;
  if (sug.trailing) out.trailing = { activateGainPct: Math.max(1, sug.trailing.activateGainPct), trailPct: Math.min(user.trailing?.trailPct ?? 50, sug.trailing.trailPct) };
  return out;
}
