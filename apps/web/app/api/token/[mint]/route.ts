import { collectTokenContext, runEntryPipeline, SolanaRpc, Jupiter, scoreToken, DEFAULT_TPSL } from '@att/core';
import { equityUsd, todayStats, prisma } from '@att/server';
import { handle, requireUser, HttpError } from '@/lib/auth';
export const maxDuration = 60;
export const GET = handle(async (_req, { params }) => {
  const u = await requireUser(); const mint = params.mint as string;
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint)) throw new HttpError(400, 'Contract address tidak valid');
  const url = u.secrets.rpcUrl ?? process.env.SOLANA_RPC_URL; if (!url) throw new HttpError(400, 'Isi RPC URL di Pengaturan terlebih dahulu');
  const { ctx, notes } = await collectTokenContext(mint, 'manual', undefined, { rpc: new SolanaRpc(url), jupiter: new Jupiter(u.cfg.jupiterBase, u.secrets.jupiterApiKey), xBearer: u.secrets.xBearerToken, useDas: u.cfg.useDas, smartBuys: async (m) => (await prisma.smartMoneySignals.findMany({ where: { mint: m, action: 'BUY', createdAt: { gte: new Date(Date.now() - 3.6e6) } }, distinct: ['walletAddress'] })).length });
  const eq = await equityUsd(u.userId); const t = await todayStats(u.userId, u.tz);
  const out = await runEntryPipeline(ctx, { mode: u.cfg.mode, limits: u.cfg.limits, tpsl: u.cfg.tpsl ?? DEFAULT_TPSL, filters: u.cfg.filters, portfolio: { equityUsd: eq, openPositions: await prisma.positions.count({ where: { userId: u.userId, status: 'OPEN' } }), dailyRealizedPnlUsd: t.netProfit }, sizePctOfEquity: u.cfg.sizePctOfEquity, autoTrade: false }, { llm: u.llm });
  return { market: ctx.market, security: out.security, card: out.card, ta: out.ta, signal: out.signal, reasons: out.reasons, rejected: out.rejected ?? null, unknown: out.security?.unknown ?? [], notes, agents: out.results.map((r) => ({ agent: r.agent, ok: r.ok, ms: r.ms, notes: r.notes })) };
});
