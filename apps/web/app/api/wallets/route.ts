import { prisma } from '@att/server';
import { handle, requireUser, HttpError } from '@/lib/auth';
export const GET = handle(async () => { const u = await requireUser(); const ws = await prisma.walletTracking.findMany({ where: { userId: u.userId }, include: { performance: { orderBy: { computedAt: 'desc' }, take: 1 } } });
  const sig = await prisma.smartMoneySignals.findMany({ where: { walletAddress: { in: ws.map((w) => w.address) } }, orderBy: { createdAt: 'desc' }, take: 50 }); return { wallets: ws, signals: sig }; });
export const POST = handle(async (req) => { const u = await requireUser(); const { address, label } = await req.json();
  if (typeof address !== 'string' || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) throw new HttpError(400, 'Alamat Solana tidak valid');
  await prisma.walletTracking.upsert({ where: { userId_address: { userId: u.userId, address } }, create: { userId: u.userId, address, label: label ?? null }, update: { label: label ?? null } }); return { ok: true }; });
export const DELETE = handle(async (req) => { const u = await requireUser(); const { address } = await req.json(); await prisma.walletTracking.deleteMany({ where: { userId: u.userId, address } }); return { ok: true }; });
