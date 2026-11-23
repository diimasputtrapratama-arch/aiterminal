import { WSOL } from '../solana/programs';
export interface JupQuote { inAmount: string; outAmount: string; priceImpactPct: string; routePlan: any[]; [k: string]: unknown }
/** Base URL & API key bisa diubah dari dashboard (Jupiter mengubah endpoint dari waktu ke waktu). */
export class Jupiter {
  constructor(private base = 'https://lite-api.jup.ag/swap/v1', private apiKey?: string) {}
  private h() { return { 'content-type': 'application/json', ...(this.apiKey ? { 'x-api-key': this.apiKey } : {}) }; }
  async quote(inputMint: string, outputMint: string, amountRaw: string, slippageBps: number): Promise<JupQuote | null> {
    const u = `${this.base}/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amountRaw}&slippageBps=${slippageBps}&restrictIntermediateTokens=true`;
    const r = await fetch(u, { headers: this.h() });
    if (!r.ok) return null; // tidak ada rute
    return (await r.json()) as JupQuote;
  }
  async swapTransaction(quote: JupQuote, userPublicKey: string, priorityLamports = 'auto') {
    const r = await fetch(`${this.base}/swap`, { method: 'POST', headers: this.h(), body: JSON.stringify({ quoteResponse: quote, userPublicKey, dynamicComputeUnitLimit: true, prioritizationFeeLamports: priorityLamports }) });
    if (!r.ok) throw new Error(`Jupiter swap HTTP ${r.status}: ${await r.text()}`);
    return (await r.json()) as { swapTransaction: string; lastValidBlockHeight: number };
  }
  /** Indikator honeypot kasar: rute jual token->SOL harus ada dan price impact wajar. */
  async sellRouteCheck(mint: string, tokenAmountRaw: string): Promise<{ ok: boolean | 'UNKNOWN'; impactPct: number | 'UNKNOWN' }> {
    try {
      const q = await this.quote(mint, WSOL, tokenAmountRaw, 300);
      if (!q) return { ok: false, impactPct: 'UNKNOWN' };
      const imp = Number(q.priceImpactPct) * 100;
      return { ok: Number(q.outAmount) > 0, impactPct: Number.isFinite(imp) ? imp : 'UNKNOWN' };
    } catch { return { ok: 'UNKNOWN', impactPct: 'UNKNOWN' }; }
  }
}
