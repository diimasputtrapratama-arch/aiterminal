import type { Maybe } from './risk/types';
import { SolanaRpc } from './solana/rpc';
import { fetchMarket, fetchOhlcv, type MarketSnapshot, type Candle } from './market/dexscreener';
import { Jupiter } from './market/jupiter';
import { xMentions1h } from './market/social';
import { TOKEN2022_RISKY, type SecurityInput, detectBundledBuys, type EarlyBuy } from './security/analyzer';
import type { TokenContext } from './agents/agents';
import { WSOL } from './solana/programs';

const U = 'UNKNOWN' as const;
const SYSTEM_PROGRAM = '11111111111111111111111111111111';
export interface CollectDeps {
  rpc: SolanaRpc; jupiter?: Jupiter; xBearer?: string; deepBundleScan?: boolean; useDas?: boolean;
  prevHolders?: { count: number; atMs: number } | null;
  smartBuys?: (mint: string) => Promise<number>;
}
/** Mengumpulkan semua data yang tersedia. Yang gagal/tidak ada => 'UNKNOWN' (tidak ditebak). */
export async function collectTokenContext(mint: string, source: string, creator: string | undefined, d: CollectDeps): Promise<{ ctx: TokenContext; notes: string[] }> {
  const notes: string[] = []; const sec: SecurityInput = {
    mintAuthorityRevoked: U, freezeAuthorityRevoked: U, token2022Risky: U, top10HolderPct: U, topHolderPct: U, creatorHoldPct: U,
    lpLockedOrBurned: U, bundledPct: U, metadataMutable: U, sellRouteOk: U, sellImpactPct: U, liquidityUsd: U, liquidityDropPct: U, creatorDumped: U };
  const safe = async <T,>(name: string, fn: () => Promise<T>): Promise<T | null> => { try { return await fn(); } catch (e) { notes.push(`${name}: ${(e as Error).message}`); return null; } };

  const [mi, mkts] = await Promise.all([safe('mintInfo', () => d.rpc.getMintInfo(mint)), safe('market', () => fetchMarket([mint]))]);
  const market: MarketSnapshot | null = mkts?.get(mint) ?? null;
  if (mi) {
    sec.mintAuthorityRevoked = mi.mintAuthority === null; sec.freezeAuthorityRevoked = mi.freezeAuthority === null;
    sec.token2022Risky = mi.isToken2022 ? mi.extensions.some((e) => TOKEN2022_RISKY.includes(e)) : false;
  }
  if (market) sec.liquidityUsd = market.liquidityUsd;

  let supplyUi = mi ? mi.supply / 10 ** mi.decimals : 0;
  const hs = await safe('holders', async () => {
    const top = await d.rpc.getLargestHolders(mint);
    const owners = await d.rpc.getTokenAccountOwners(top.map((t: any) => t.address));
    const kinds: (string | null)[] = await Promise.all(owners.map(async (o: string | undefined) => {
      if (!o) return null; const r: any = await d.rpc.call('getAccountInfo', [o, { encoding: 'base64' }]); return r?.value?.owner ?? null; }));
    return top.map((t: any, i: number) => ({ owner: owners[i], isWallet: kinds[i] === SYSTEM_PROGRAM, pct: supplyUi > 0 ? (t.uiAmount / supplyUi) * 100 : 0 }));
  });
  if (hs && supplyUi > 0) {
    const wallets = hs.filter((h: any) => h.isWallet).sort((a: any, b: any) => b.pct - a.pct);
    sec.top10HolderPct = wallets.slice(0, 10).reduce((a: number, h: any) => a + h.pct, 0);
    sec.topHolderPct = wallets[0]?.pct ?? 0;
    if (creator) { const c = hs.find((h: any) => h.owner === creator); sec.creatorHoldPct = c ? c.pct : Math.min(...hs.map((h: any) => h.pct)); notes.push(c ? 'creator ada di top-20' : 'creator tidak di top-20: nilai = batas atas'); }
  }
  // Rute jual (indikator honeypot) untuk ~US$5
  if (d.jupiter && mi && market && market.priceUsd > 0) {
    const raw = BigInt(Math.max(1, Math.floor((5 / market.priceUsd) * 10 ** mi.decimals))).toString();
    const s = await d.jupiter.sellRouteCheck(mint, raw); sec.sellRouteOk = s.ok; sec.sellImpactPct = s.impactPct;
  }
  // Holder count (DAS) & pertumbuhan
  let holders: Maybe<number> = U, growth: Maybe<number> = U;
  if (d.useDas) { holders = await d.rpc.holderCountDas(mint); if (holders !== U && d.prevHolders && d.prevHolders.count > 0) { const hrs = (Date.now() - d.prevHolders.atMs) / 3.6e6; if (hrs > 0.05) growth = (((holders as number) - d.prevHolders.count) / d.prevHolders.count) * 100 / hrs; } }
  // Bundled buy (opsional, berat)
  if (d.deepBundleScan && market?.pairAddress) {
    await safe('bundle', async () => {
      const sigs = (await d.rpc.getSignatures(market.pairAddress, 60)).reverse().slice(0, 40); const buys: EarlyBuy[] = []; let firstSlot = sigs[0]?.slot ?? 0;
      for (const s of sigs) { const tx: any = await d.rpc.getTransaction(s.signature); const post = tx?.meta?.postTokenBalances ?? [], pre = tx?.meta?.preTokenBalances ?? [];
        for (const p of post) { if (p.mint !== mint || !p.owner) continue; const b = pre.find((x: any) => x.accountIndex === p.accountIndex); const delta = Number(p.uiTokenAmount.uiAmount ?? 0) - Number(b?.uiTokenAmount?.uiAmount ?? 0);
          if (delta > 0 && supplyUi > 0) buys.push({ wallet: p.owner, slot: s.slot, pctSupply: (delta / supplyUi) * 100 }); } }
      sec.bundledPct = detectBundledBuys(buys, firstSlot, 2).earlyPct; notes.push('bundled: proksi (slot awal), tanpa pelacakan funder');
    });
  }
  const social = await xMentions1h(d.xBearer, `${mint} OR $${market ? '' : ''}${mint.slice(0, 6)}`);
  const smart = d.smartBuys ? await safe('smartBuys', () => d.smartBuys!(mint)) : null;
  let candles: Candle[] = [];
  if (market?.pairAddress) candles = (await safe('ohlcv', () => fetchOhlcv(market.pairAddress, 'minute', 1, 80))) ?? [];
  return { ctx: { mint, source, market, candles, security: sec, holders, holdersGrowth1hPct: growth, smartWalletBuys: smart ?? U, socialMentions1h: social }, notes };
}
export { WSOL };
