import { SolanaRpc, WSOL, USDC } from '@att/core';
import { prisma, loadAllUsers } from '@att/server';
import { alert } from './notify';
import { systemRpc } from './pipeline';
const lastSig = new Map<string, string>();
/** Memantau wallet pengguna: deteksi BUY/SELL dari perubahan saldo token owner tersebut. */
export async function walletTick() {
  const users = await loadAllUsers(); const sys = systemRpc(users); if (!sys) return; const rpc: SolanaRpc = sys.rpc;
  const wallets = await prisma.walletTracking.findMany();
  for (const w of wallets) {
    const u = users.find((x) => x.userId === w.userId); if (!u) continue;
    try {
      const sigs = await rpc.getSignatures(w.address, 15); const last = lastSig.get(w.id);
      const fresh = last ? sigs.slice(0, Math.max(0, sigs.findIndex((s: any) => s.signature === last))) : []; // pertama kali: hanya tandai posisi
      if (sigs[0]) lastSig.set(w.id, sigs[0].signature);
      for (const s of fresh.reverse()) {
        if (s.err) continue; const tx: any = await rpc.getTransaction(s.signature); if (!tx) continue;
        const pre = tx.meta?.preTokenBalances ?? [], post = tx.meta?.postTokenBalances ?? [];
        for (const pb of post) {
          if (pb.owner !== w.address || [WSOL, USDC].includes(pb.mint)) continue;
          const before = pre.find((x: any) => x.accountIndex === pb.accountIndex && x.owner === w.address);
          const delta = Number(pb.uiTokenAmount.uiAmount ?? 0) - Number(before?.uiTokenAmount?.uiAmount ?? 0); if (Math.abs(delta) < 1e-9) continue;
          const action = delta > 0 ? 'BUY' : 'SELL';
          await prisma.solanaTokens.upsert({ where: { mint: pb.mint }, create: { mint: pb.mint, source: 'wallet' }, update: {} });
          await prisma.smartMoneySignals.create({ data: { mint: pb.mint, walletAddress: w.address, action, notes: `Δ${delta.toFixed(4)} token | ${s.signature}` } });
          await prisma.tokenTransactions.upsert({ where: { signature: s.signature }, create: { mint: pb.mint, signature: s.signature, side: action, wallet: w.address, slot: BigInt(s.slot), blockTime: new Date((s.blockTime ?? Date.now() / 1000) * 1000) }, update: {} });
          await alert(u, action === 'BUY' ? 'WHALE_BUY' : 'WHALE_SELL', `${w.label ?? w.address.slice(0, 6)} ${action} ${pb.mint}\n(Bukan otomatis sinyal beli)`, pb.mint);
        }
      }
    } catch (e) { console.error('wallet', w.address, (e as Error).message); }
  }
}
/** Performa wallet dari transaksi yang TERLIHAT sejak ditambahkan (bukan riwayat penuh). Perkiraan; hanya hitungan & win-rate berbasis perubahan saldo. */
export async function walletPerfTick() {
  for (const w of await prisma.walletTracking.findMany()) {
    const sig = await prisma.smartMoneySignals.findMany({ where: { walletAddress: w.address } });
    const trades = sig.length; if (!trades) continue;
    await prisma.walletPerformance.create({ data: { walletId: w.id, trades, winRate: null, realizedPnlUsd: null, unrealizedPnlUsd: null } });
  }
}
