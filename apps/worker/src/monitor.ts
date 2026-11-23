import { evaluatePosition, fetchMarket, SolanaRpc, type PositionState, type TpSlConfig } from '@att/core';
import { prisma, loadAllUsers, todayStats, type UserRuntime } from '@att/server';
import { alert } from './notify';
import { sellPosition } from './broker';
import { systemRpc } from './pipeline';

const capHit = new Set<string>(); let busy = false;
/** Loop TP/SL: harga dari DexScreener tiap ~5 detik, evaluasi mesin TP/SL murni, eksekusi jual. */
export async function monitorTick() {
  if (busy) return; busy = true;
  try {
    const open = await prisma.positions.findMany({ where: { status: 'OPEN' } }); if (!open.length) return;
    const users = new Map((await loadAllUsers()).map((u) => [u.userId, u])); const sys = systemRpc([...users.values()]); if (!sys) return;
    let mk: Awaited<ReturnType<typeof fetchMarket>>; try { mk = await fetchMarket([...new Set(open.map((p) => p.mint))]); } catch (e) { console.error('harga gagal', (e as Error).message); return; }
    for (const p of open) {
      const u = users.get(p.userId); const m = mk.get(p.mint); if (!u || !m || !(m.priceUsd > 0)) continue;
      const liq = m.liquidityUsd === 'UNKNOWN' ? 0 : m.liquidityUsd;
      const entryLiq = p.entryLiquidityUsd ?? 0;
      const rugged = (entryLiq > 0 && liq < entryLiq * 0.5) || (liq > 0 && liq < 2000);
      const dumping = m.change5m !== 'UNKNOWN' && m.change5m < -35 && m.sells5m !== 'UNKNOWN' && m.buys5m !== 'UNKNOWN' && m.sells5m > m.buys5m * 2;
      const emergency = rugged || dumping || u.cfg.killSwitch === true;
      const tpsl = p.tpsl as unknown as TpSlConfig; const st = p.state as unknown as PositionState;
      const r = evaluatePosition(st, tpsl, { price: m.priceUsd, nowMs: Date.now(), emergency });
      const gain = (m.priceUsd / st.entryPrice - 1) * 100;
      if (!r.actions.length) { await prisma.positions.update({ where: { id: p.id }, data: { state: r.state as any, lastPrice: m.priceUsd, peakGainPct: Math.max(p.peakGainPct, (r.state.highestPrice / st.entryPrice - 1) * 100) } }); continue; }
      let remaining = st.remainingQty;
      for (const a of r.actions) {
        remaining -= a.qty; const ns: PositionState = { ...r.state, remainingQty: Math.max(0, remaining) };
        try {
          const res = await sellPosition(u, p.id, a.qty, m.priceUsd, liq, a.reason, sys.rpc, ns);
          const label = a.reason === 'TP' ? 'TP_HIT' : 'SL_HIT';
          await alert(u, label, `${p.symbol ?? p.mint.slice(0, 6)} ${a.reason}: ${a.detail}\nGain ${gain.toFixed(1)}% | Hasil $${res?.proceeds.toFixed(2)}${emergency ? '\n(EMERGENCY: likuiditas/dump)' : ''}`, p.mint);
        } catch (e) { console.error('jual gagal', p.id, (e as Error).message); await alert(u, 'SL_HIT', `GAGAL menjual ${p.symbol ?? p.mint}: ${(e as Error).message}. Periksa manual!`, p.mint); }
      }
    }
    for (const u of users.values()) { const t = await todayStats(u.userId, u.tz); const lim = u.cfg.limits.maxDailyLossPct ?? 5; const eq = (await prisma.equitySnapshots.findFirst({ where: { userId: u.userId }, orderBy: { at: 'desc' } }))?.equityUsd ?? 0;
      const k = u.userId + new Date().toISOString().slice(0, 10); if (eq > 0 && t.netProfit <= -(eq * lim) / 100 && !capHit.has(k)) { capHit.add(k); await alert(u, 'MAX_DAILY_LOSS', `Batas rugi harian ${lim}% tercapai. Entry baru ditolak oleh Risk Engine hari ini.`); } }
  } finally { busy = false; }
}
