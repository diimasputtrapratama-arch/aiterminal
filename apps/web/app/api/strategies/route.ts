import { prisma, saveSettings } from '@att/server';
import { handle, requireUser, HttpError } from '@/lib/auth';
import { DEFAULT_TPSL } from '@att/core';
export const PRESETS = [
  { name: 'Konservatif - likuiditas dalam', mode: 'CONSERVATIVE', params: { limits: { minLiquidityUsd: 60000, maxTop10HolderPct: 25 }, tpsl: { ...DEFAULT_TPSL, stopLossPct: 10 } } },
  { name: 'Seimbang - momentum', mode: 'BALANCED', params: { limits: {}, tpsl: DEFAULT_TPSL } },
  { name: 'Agresif - entry awal', mode: 'AGGRESSIVE', params: { limits: { maxSlippagePct: 8 }, tpsl: { ...DEFAULT_TPSL, stopLossPct: 20, trailing: { activateGainPct: 40, trailPct: 18 } } } },
];
export const GET = handle(async () => { const u = await requireUser(); return { presets: PRESETS, items: await prisma.aIStrategies.findMany({ where: { userId: u.userId } }), activeId: u.cfg.activeStrategyId ?? null }; });
export const POST = handle(async (req) => {
  const u = await requireUser(); const b = await req.json();
  if (b.action === 'activate') { const s = await prisma.aIStrategies.findFirst({ where: { id: b.id, userId: u.userId } }); if (!s) throw new HttpError(404, 'Strategi tidak ada');
    const p = s.params as any; await saveSettings(u.userId, { config: { mode: s.mode as any, limits: p.limits ?? {}, tpsl: p.tpsl ?? u.cfg.tpsl, filters: p.filters ?? {}, activeStrategyId: s.id } }); return { ok: true }; }
  if (typeof b.name !== 'string' || !['CONSERVATIVE', 'BALANCED', 'AGGRESSIVE'].includes(b.mode)) throw new HttpError(400, 'Data strategi tidak valid');
  return { item: await prisma.aIStrategies.create({ data: { userId: u.userId, name: b.name.slice(0, 80), mode: b.mode, params: b.params ?? {} } }) };
});
export const PUT = handle(async (req) => { const u = await requireUser(); const b = await req.json(); const s = await prisma.aIStrategies.findFirst({ where: { id: b.id, userId: u.userId } }); if (!s) throw new HttpError(404, 'Tidak ada');
  if (b.live === true && b.confirm !== true) throw new HttpError(400, 'Mengaktifkan strategi live butuh konfirmasi eksplisit');
  return { item: await prisma.aIStrategies.update({ where: { id: s.id }, data: { name: b.name ?? s.name, params: b.params ?? (s.params as any), memory: b.memory ?? (s.memory as any), live: b.live ?? s.live } }) }; });
export const DELETE = handle(async (req) => { const u = await requireUser(); const { id } = await req.json(); await prisma.aIStrategies.deleteMany({ where: { id, userId: u.userId } }); return { ok: true }; });
