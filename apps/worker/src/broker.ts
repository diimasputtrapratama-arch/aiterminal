import { simulateFill, simulateSellQty, newPosition, mergeUserLimits, WSOL, SolanaRpc, type ApprovedOrder, type TpSlConfig, type TokenContext, type PositionState } from '@att/core';
import { prisma, type UserRuntime, upsertCalendarDay } from '@att/server';
import { alert } from './notify';
import { liveAllowed, liveSwap, solUsd, tokenDecimals } from './live';

/** Satu-satunya pintu masuk BUY. Wajib ApprovedOrder dari Risk Management. */
export async function openPosition(u: UserRuntime, order: ApprovedOrder, tpsl: TpSlConfig, ctx: TokenContext, rpc: SolanaRpc) {
  const m = ctx.market; if (!m || !(m.priceUsd > 0)) throw new Error('Harga tidak tersedia');
  if (await prisma.positions.findFirst({ where: { userId: u.userId, mint: order.token.mint, status: 'OPEN' } })) throw new Error('Posisi sudah terbuka');
  const liq = m.liquidityUsd === 'UNKNOWN' ? 0 : m.liquidityUsd; const live = u.cfg.tradingMode === 'live'; const now = Date.now();
  let qty: number, entry: number, cost: number, fee = 0, net = 0.05, slip = 0, sig: string | undefined;
  if (live) {
    const why = liveAllowed(u); if (why) throw new Error('Live ditolak: ' + why);
    const sol = await solUsd(); const lamports = BigInt(Math.floor((order.sizeUsd / sol) * 1e9)); const dec = await tokenDecimals(rpc, order.token.mint);
    const lim = mergeUserLimits(u.cfg.mode, u.cfg.limits);
    const r = await liveSwap(u, WSOL, order.token.mint, lamports, Math.round(lim.maxSlippagePct * 100), lim.maxSlippagePct);
    qty = Number(r.outRaw) / 10 ** dec; cost = order.sizeUsd; entry = cost / qty; slip = r.priceImpactPct; sig = r.signature; net = 0.05;
  } else {
    const f = simulateFill('BUY', order.sizeUsd, m.priceUsd, liq); qty = f.qty; entry = f.price; cost = order.sizeUsd - f.feeUsd; fee = f.feeUsd; net = f.networkFeeUsd; slip = f.slippagePct;
  }
  const state = newPosition(entry, qty, now, tpsl);
  const pos = await prisma.positions.create({ data: { userId: u.userId, mint: order.token.mint, symbol: ctx.symbol ?? null, strategyId: u.cfg.activeStrategyId ?? null, mode: live ? 'live' : 'paper', entryPrice: entry, initialQty: qty, remainingQty: qty, costUsd: cost, feesUsd: fee, networkFeesUsd: net, entryLiquidityUsd: liq || null, entrySlippagePct: slip, state: state as any, tpsl: tpsl as any, lastPrice: m.priceUsd } });
  await prisma.ledgerEntries.createMany({ data: [{ userId: u.userId, type: 'BUY', amountUsd: order.sizeUsd, note: pos.id }, { userId: u.userId, type: 'FEE', amountUsd: net, note: 'network ' + pos.id }] });
  await prisma.executionLogs.create({ data: { userId: u.userId, mint: order.token.mint, side: 'BUY', mode: live ? 'live' : 'paper', sizeUsd: order.sizeUsd, riskApproved: true, riskReasons: [], txSignature: sig, feeUsd: fee + net } });
  await alert(u, 'AUTO_BUY', `${live ? 'LIVE' : 'PAPER'} BUY ${ctx.symbol ?? order.token.mint}\nUkuran $${order.sizeUsd.toFixed(2)} @ ${entry}\nSL -${tpsl.stopLossPct}%`, order.token.mint);
  return pos;
}

/** SELL sebagian/seluruh. Selalu diizinkan oleh risk engine (agar bisa keluar). */
export async function sellPosition(u: UserRuntime, posId: string, qty: number, midPrice: number, liqUsd: number, reason: string, rpc: SolanaRpc, newState: PositionState) {
  const p = await prisma.positions.findUnique({ where: { id: posId } }); if (!p || p.status !== 'OPEN') return;
  qty = Math.min(qty, p.remainingQty); let proceeds: number, fee: number, net: number, sig: string | undefined;
  if (p.mode === 'live') {
    const sol = await solUsd(); const dec = await tokenDecimals(rpc, p.mint); const raw = BigInt(Math.floor(qty * 10 ** dec));
    const r = await liveSwap(u, p.mint, WSOL, raw, 1500, 40); // jual: toleransi lebih longgar agar bisa keluar
    proceeds = (Number(r.outRaw) / 1e9) * sol; fee = 0; net = 0.05; sig = r.signature;
  } else { const f = simulateSellQty(qty, midPrice, liqUsd); proceeds = f.grossUsd; fee = f.feeUsd; net = f.networkFeeUsd; }
  const closed = newState.remainingQty <= 1e-12; const cash = proceeds - fee;
  await prisma.positions.update({ where: { id: posId }, data: { remainingQty: closed ? 0 : newState.remainingQty, state: newState as any, proceedsUsd: { increment: proceeds }, feesUsd: { increment: fee }, networkFeesUsd: { increment: net }, status: closed ? 'CLOSED' : 'OPEN', closedAt: closed ? new Date() : null, lastPrice: midPrice } });
  await prisma.ledgerEntries.createMany({ data: [{ userId: u.userId, type: 'SELL', amountUsd: cash, note: `${reason} ${posId}` }, { userId: u.userId, type: 'FEE', amountUsd: net, note: 'network ' + posId }] });
  await prisma.executionLogs.create({ data: { userId: u.userId, mint: p.mint, side: 'SELL', mode: p.mode, sizeUsd: proceeds, riskApproved: true, riskReasons: [reason], txSignature: sig, feeUsd: fee + net } });
  if (closed) await upsertCalendarDay(u.userId, u.tz, new Date());
  return { proceeds, closed };
}
