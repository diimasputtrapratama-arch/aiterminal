import type { Maybe } from '../risk/types';
export interface MarketSnapshot {
  mint: string; dex: string; pairAddress: string; priceUsd: number; liquidityUsd: Maybe<number>;
  volume5m: Maybe<number>; volume1h: Maybe<number>; volume24h: Maybe<number>;
  change5m: Maybe<number>; change1h: Maybe<number>; change24h: Maybe<number>;
  buys5m: Maybe<number>; sells5m: Maybe<number>; buys1h: Maybe<number>; sells1h: Maybe<number>;
  marketCapUsd: Maybe<number>; fdvUsd: Maybe<number>; pairCreatedAtMs: Maybe<number>;
  twitter: Maybe<string>; telegram: Maybe<string>; website: Maybe<string>;
}
const U = 'UNKNOWN' as const;
const n = (v: any): Maybe<number> => (typeof v === 'number' && Number.isFinite(v) ? v : U);
/** DexScreener API publik (batas ~300 req/menit); maksimal 30 mint per request. */
export async function fetchMarket(mints: string[], base = 'https://api.dexscreener.com'): Promise<Map<string, MarketSnapshot>> {
  const out = new Map<string, MarketSnapshot>();
  for (let i = 0; i < mints.length; i += 30) {
    const chunk = mints.slice(i, i + 30);
    const r = await fetch(`${base}/tokens/v1/solana/${chunk.join(',')}`);
    if (!r.ok) throw new Error(`DexScreener HTTP ${r.status}`);
    const pairs: any[] = await r.json();
    for (const p of pairs) {
      const mint = p.baseToken?.address as string; if (!mint) continue;
      const liq = n(p.liquidity?.usd); const prev = out.get(mint);
      if (prev && prev.liquidityUsd !== U && (liq === U || liq <= prev.liquidityUsd)) continue; // ambil pool terlikuid
      const soc = (t: string) => (p.info?.socials ?? []).find((s: any) => s.type === t)?.url ?? U;
      out.set(mint, {
        mint, dex: p.dexId, pairAddress: p.pairAddress, priceUsd: Number(p.priceUsd), liquidityUsd: liq,
        volume5m: n(p.volume?.m5), volume1h: n(p.volume?.h1), volume24h: n(p.volume?.h24),
        change5m: n(p.priceChange?.m5), change1h: n(p.priceChange?.h1), change24h: n(p.priceChange?.h24),
        buys5m: n(p.txns?.m5?.buys), sells5m: n(p.txns?.m5?.sells), buys1h: n(p.txns?.h1?.buys), sells1h: n(p.txns?.h1?.sells),
        marketCapUsd: n(p.marketCap), fdvUsd: n(p.fdv), pairCreatedAtMs: n(p.pairCreatedAt),
        twitter: soc('twitter'), telegram: soc('telegram'), website: p.info?.websites?.[0]?.url ?? U,
      });
    }
  }
  return out;
}
export interface Candle { t: number; o: number; h: number; l: number; c: number; v: number }
/** GeckoTerminal API publik untuk OHLCV. */
export async function fetchOhlcv(pool: string, tf: 'minute' | 'hour' = 'minute', aggregate = 1, limit = 100): Promise<Candle[]> {
  const r = await fetch(`https://api.geckoterminal.com/api/v2/networks/solana/pools/${pool}/ohlcv/${tf}?aggregate=${aggregate}&limit=${limit}`);
  if (!r.ok) throw new Error(`GeckoTerminal HTTP ${r.status}`);
  const j: any = await r.json();
  return (j.data?.attributes?.ohlcv_list ?? []).map((x: number[]) => ({ t: x[0], o: x[1], h: x[2], l: x[3], c: x[4], v: x[5] })).sort((a: Candle, b: Candle) => a.t - b.t);
}
