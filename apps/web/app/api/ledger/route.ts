import { prisma, cashBalance, equityUsd } from '@att/server';
import { handle, requireUser, HttpError } from '@/lib/auth';
export const GET = handle(async () => { const u = await requireUser(); return { cash: await cashBalance(u.userId), equity: await equityUsd(u.userId), entries: await prisma.ledgerEntries.findMany({ where: { userId: u.userId, type: { in: ['DEPOSIT', 'WITHDRAWAL'] } }, orderBy: { createdAt: 'desc' }, take: 30 }) }; });
export const POST = handle(async (req) => {
  const u = await requireUser(); const { type, amountUsd } = await req.json(); const a = Number(amountUsd);
  if (!['DEPOSIT', 'WITHDRAWAL'].includes(type) || !(a > 0) || a > 1e9) throw new HttpError(400, 'Input tidak valid');
  if (type === 'WITHDRAWAL' && a > (await cashBalance(u.userId))) throw new HttpError(400, 'Saldo kas tidak cukup');
  await prisma.ledgerEntries.create({ data: { userId: u.userId, type, amountUsd: a, note: u.cfg.tradingMode === 'paper' ? 'modal paper' : 'tercatat manual' } }); return { ok: true };
});
