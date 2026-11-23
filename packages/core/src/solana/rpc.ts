import { PROGRAMS } from './programs';
import type { Maybe } from '../risk/types';

export class SolanaRpc {
  constructor(private url: string, private timeoutMs = 10000) {}
  async call<T = any>(method: string, params: unknown[] = []): Promise<T> {
    const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), this.timeoutMs);
    try {
      const r = await fetch(this.url, { method: 'POST', headers: { 'content-type': 'application/json' }, signal: ctl.signal,
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
      if (!r.ok) throw new Error(`RPC ${method} HTTP ${r.status}`);
      const j: any = await r.json();
      if (j.error) throw new Error(`RPC ${method}: ${j.error.message}`);
      return j.result as T;
    } finally { clearTimeout(to); }
  }
  async getMintInfo(mint: string) {
    const r: any = await this.call('getAccountInfo', [mint, { encoding: 'jsonParsed' }]);
    const v = r?.value; const info = v?.data?.parsed?.info;
    if (!info) return null;
    const exts: string[] = (info.extensions ?? []).map((e: any) => e.extension);
    return {
      program: v.owner as string, decimals: info.decimals as number, supply: Number(info.supply),
      mintAuthority: (info.mintAuthority ?? null) as string | null, freezeAuthority: (info.freezeAuthority ?? null) as string | null,
      isToken2022: v.owner === PROGRAMS.TOKEN_2022, extensions: exts,
    };
  }
  async getLargestHolders(mint: string) {
    const r: any = await this.call('getTokenLargestAccounts', [mint]);
    return (r?.value ?? []).map((x: any) => ({ address: x.address as string, amount: Number(x.amount), uiAmount: Number(x.uiAmount) }));
  }
  /** Pemilik (wallet) dari token account, untuk mengabaikan LP/bonding curve. */
  async getTokenAccountOwners(addresses: string[]) {
    const r: any = await this.call('getMultipleAccounts', [addresses, { encoding: 'jsonParsed' }]);
    return (r?.value ?? []).map((a: any) => a?.data?.parsed?.info?.owner as string | undefined);
  }
  getTransaction(sig: string) {
    return this.call('getTransaction', [sig, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0, commitment: 'confirmed' }]);
  }
  getSignatures(addr: string, limit = 50) { return this.call<any[]>('getSignaturesForAddress', [addr, { limit }]); }
  async getBalanceSol(addr: string) { const r: any = await this.call('getBalance', [addr]); return r.value / 1e9; }
  /** Jumlah holder: hanya jika provider mendukung DAS (mis. Helius). Selain itu UNKNOWN. */
  async holderCountDas(mint: string, maxPages = 5): Promise<Maybe<number>> {
    try {
      const owners = new Set<string>();
      for (let page = 1; page <= maxPages; page++) {
        const r: any = await this.call('getTokenAccounts', { mint, page, limit: 1000 } as any);
        const arr = r?.token_accounts ?? [];
        arr.forEach((a: any) => Number(a.amount) > 0 && owners.add(a.owner));
        if (arr.length < 1000) return owners.size;
      }
      return owners.size; // batas bawah
    } catch { return 'UNKNOWN'; }
  }
}
/** Ambil mint token baru dari transaksi pembuatan (abaikan WSOL/USDC). */
export function extractMintFromTx(tx: any, ignore: string[]): string | null {
  const bal = [...(tx?.meta?.postTokenBalances ?? []), ...(tx?.meta?.preTokenBalances ?? [])];
  for (const b of bal) if (b.mint && !ignore.includes(b.mint)) return b.mint as string;
  return null;
}
