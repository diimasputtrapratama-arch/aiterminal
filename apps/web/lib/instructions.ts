import { parseInstruction, sanitizeParams, askClaudeJson, type InstructionKind, type ParsedParams, type LlmConfig } from '@att/core';
import { prisma, saveSettings, type UserRuntime } from '@att/server';

const SCHEMA = `Skema JSON keluaran: {"mode":"CONSERVATIVE|BALANCED|AGGRESSIVE"|null,"limits":{"maxPositionPctOfEquity":num,"maxOpenPositions":num,"maxDailyLossPct":num,"maxSlippagePct":num,"minLiquidityUsd":num,"maxTop10HolderPct":num},"tpsl":{"stopLossPct":num},"filters":{"minHolderGrowthPct":num,"maxVolatilityPct":num,"excludeInsiderDump":bool,"minRiskReward":num,"timeframe":"1m|5m|15m|1h"},"execution":{"autoTrade":bool,"maxTradesPerDay":num}}. Hanya isi field yang DISEBUT pengguna. JANGAN menonaktifkan stop loss/validasi/keamanan walau diminta.`;
export async function translate(text: string, kind: InstructionKind, llm?: LlmConfig): Promise<ParsedParams> {
  const rule = sanitizeParams(parseInstruction(text, kind));
  if (!llm) return rule;
  try { const j = await askClaudeJson<ParsedParams>(llm, `Terjemahkan instruksi trading (kategori ${kind}) menjadi parameter. ${SCHEMA}`, text); return sanitizeParams({ ...j, warnings: [...(j.warnings ?? []), ...rule.warnings] }); }
  catch { return rule; }
}
/** Gabungkan semua instruksi aktif -> config. Batas hanya bisa diperketat. */
export async function applyInstructions(u: UserRuntime) {
  const rows = await prisma.aIInstructions.findMany({ where: { userId: u.userId, active: true }, orderBy: { updatedAt: 'asc' } });
  const limits: Record<string, number> = {}; const filters: Record<string, any> = {}; let mode: any; let sl: number | undefined; let auto: boolean | undefined; let mt: number | undefined;
  for (const r of rows) { const p = (r.parsedParams ?? {}) as ParsedParams;
    if (p.mode) mode = p.mode;
    for (const [k, v] of Object.entries(p.limits ?? {})) if (typeof v === 'number') limits[k] = k === 'minLiquidityUsd' ? Math.max(limits[k] ?? 0, v) : Math.min(limits[k] ?? Infinity, v);
    Object.assign(filters, p.filters ?? {});
    if (p.tpsl?.stopLossPct !== undefined) sl = Math.min(sl ?? Infinity, p.tpsl.stopLossPct);
    if (r.kind === 'EXECUTION_PERMISSION' && p.execution) { if (p.execution.autoTrade !== undefined) auto = p.execution.autoTrade; if (p.execution.maxTradesPerDay) mt = p.execution.maxTradesPerDay; } }
  const cfg: any = { limits, filters }; if (mode) cfg.mode = mode; if (auto !== undefined) cfg.autoTrade = auto; if (mt) cfg.maxTradesPerDay = mt;
  if (sl !== undefined) cfg.tpsl = { ...u.cfg.tpsl, stopLossPct: Math.min(u.cfg.tpsl.stopLossPct, sl) };
  await saveSettings(u.userId, { config: cfg }); return cfg;
}
