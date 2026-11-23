import { Connection, Keypair, VersionedTransaction } from '@solana/web3.js';
import bs58 from 'bs58';
import { Jupiter, fetchMarket, WSOL, SolanaRpc } from '@att/core';
import type { UserRuntime } from '@att/server';
import { ENV } from './env';

let solCache = { at: 0, px: 0 };
export async function solUsd(): Promise<number> {
  if (Date.now() - solCache.at < 30000 && solCache.px) return solCache.px;
  const m = (await fetchMarket([WSOL])).get(WSOL); if (!m || !(m.priceUsd > 0)) throw new Error('Harga SOL tidak tersedia');
  solCache = { at: Date.now(), px: m.priceUsd }; return m.priceUsd;
}
export function liveAllowed(u: UserRuntime): string | null {
  if (!ENV.ALLOW_LIVE) return 'ALLOW_LIVE=false di environment worker';
  if (u.cfg.tradingMode !== 'live') return 'tradingMode bukan live';
  if (!u.secrets.walletPrivateKey) return 'walletPrivateKey belum diisi di dashboard';
  if (!u.secrets.rpcUrl && !ENV.RPC_URL) return 'RPC URL belum diisi';
  return null;
}
export interface SwapResult { signature: string; inRaw: bigint; outRaw: bigint; priceImpactPct: number }
/** Jupiter quote -> sign -> kirim -> tunggu konfirmasi. Melempar error jika gagal/impact melebihi batas. */
export async function liveSwap(u: UserRuntime, inMint: string, outMint: string, amountRaw: bigint, slippageBps: number, maxImpactPct: number): Promise<SwapResult> {
  const why = liveAllowed(u); if (why) throw new Error('Live ditolak: ' + why);
  const kp = Keypair.fromSecretKey(bs58.decode(u.secrets.walletPrivateKey!));
  const jup = new Jupiter(u.cfg.jupiterBase, u.secrets.jupiterApiKey);
  const q = await jup.quote(inMint, outMint, amountRaw.toString(), slippageBps); if (!q) throw new Error('Tidak ada rute Jupiter');
  const impact = Math.abs(Number(q.priceImpactPct)) * 100; if (!(impact <= maxImpactPct)) throw new Error(`Price impact ${impact.toFixed(2)}% > batas ${maxImpactPct}%`);
  const { swapTransaction, lastValidBlockHeight } = await jup.swapTransaction(q, kp.publicKey.toBase58());
  const tx = VersionedTransaction.deserialize(Buffer.from(swapTransaction, 'base64')); tx.sign([kp]);
  const conn = new Connection(u.secrets.rpcUrl ?? ENV.RPC_URL, 'confirmed');
  const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 });
  const t0 = Date.now();
  while (Date.now() - t0 < 60000) {
    const st = (await conn.getSignatureStatuses([sig])).value[0];
    if (st?.err) throw new Error('Transaksi gagal on-chain: ' + JSON.stringify(st.err));
    if (st && (st.confirmationStatus === 'confirmed' || st.confirmationStatus === 'finalized')) return { signature: sig, inRaw: BigInt(q.inAmount), outRaw: BigInt(q.outAmount), priceImpactPct: impact };
    if ((await conn.getBlockHeight()) > lastValidBlockHeight) throw new Error('Blockhash kedaluwarsa, tx tidak masuk');
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error('Timeout konfirmasi transaksi');
}
export async function tokenDecimals(rpc: SolanaRpc, mint: string): Promise<number> { const m = await rpc.getMintInfo(mint); if (!m) throw new Error('Mint tidak ditemukan'); return m.decimals; }
