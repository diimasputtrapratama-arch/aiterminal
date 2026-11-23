import { prisma } from './db';
export async function cashBalance(userId: string): Promise<number> {
  const rows = await prisma.ledgerEntries.groupBy({ by: ['type'], where: { userId }, _sum: { amountUsd: true } });
  const g = (t: string) => rows.find((r) => r.type === t)?._sum.amountUsd ?? 0;
  return g('DEPOSIT') - g('WITHDRAWAL') - g('BUY') + g('SELL') - g('FEE');
}
export async function equityUsd(userId: string): Promise<number> {
  const open = await prisma.positions.findMany({ where: { userId, status: 'OPEN' } });
  return (await cashBalance(userId)) + open.reduce((a, p) => a + p.remainingQty * (p.lastPrice ?? p.entryPrice), 0);
}
