import type { Maybe } from '../risk/types';

export interface HolderBal { owner: string | undefined; pct: number }
/** Top-N konsentrasi, mengabaikan pemilik LP/bonding curve. */
export function topHolderPct(holders: HolderBal[], n = 10, excludeOwners: string[] = []): number {
  return holders.filter((h) => !h.owner || !excludeOwners.includes(h.owner)).sort((a, b) => b.pct - a.pct).slice(0, n).reduce((a, h) => a + h.pct, 0);
}
export interface EarlyBuy { wallet: string; slot: number; pctSupply: number; funder?: string }
/** Bundled buy: banyak wallet beli dalam beberapa slot setelah pembuatan, atau didanai wallet yang sama. */
export function detectBundledBuys(buys: EarlyBuy[], creationSlot: number, windowSlots = 3) {
  const early = buys.filter((b) => b.slot - creationSlot <= windowSlots);
  const byFunder = new Map<string, EarlyBuy[]>();
  for (const b of early) if (b.funder) (byFunder.get(b.funder) ?? byFunder.set(b.funder, []).get(b.funder)!).push(b);
  const clusters = [...byFunder.values()].filter((g) => g.length >= 3);
  const clusterPct = clusters.flat().reduce((a, b) => a + b.pctSupply, 0);
  return { earlyWallets: early.length, earlyPct: early.reduce((a, b) => a + b.pctSupply, 0), clusterCount: clusters.length, clusterPct };
}

export interface SecurityInput {
  mintAuthorityRevoked: Maybe<boolean>; freezeAuthorityRevoked: Maybe<boolean>;
  token2022Risky: Maybe<boolean>;           // transferFee/permanentDelegate/transferHook/nonTransferable
  top10HolderPct: Maybe<number>; topHolderPct: Maybe<number>; creatorHoldPct: Maybe<number>;
  lpLockedOrBurned: Maybe<boolean>; bundledPct: Maybe<number>; metadataMutable: Maybe<boolean>;
  sellRouteOk: Maybe<boolean>; sellImpactPct: Maybe<number>; liquidityUsd: Maybe<number>; liquidityDropPct: Maybe<number>;
  creatorDumped: Maybe<boolean>;
}
export interface SecurityReport { riskScore: number; rugRiskScore: number; flags: string[]; unknown: string[]; honeypotSuspected: Maybe<boolean> }
const isU = (v: unknown) => v === 'UNKNOWN';

export function analyzeSecurity(i: SecurityInput): SecurityReport {
  let risk = 0, rug = 0; const flags: string[] = []; const unknown: string[] = [];
  const add = (cond: boolean, w: number, rw: number, f: string) => { if (cond) { risk += w; rug += rw; flags.push(f); } };
  const unk = (v: unknown, name: string, w: number, rw = w / 2) => { if (isU(v)) { unknown.push(name); risk += w; rug += rw; } };
  add(i.mintAuthorityRevoked === false, 30, 20, 'Mint authority AKTIF'); unk(i.mintAuthorityRevoked, 'mintAuthority', 15);
  add(i.freezeAuthorityRevoked === false, 25, 15, 'Freeze authority AKTIF'); unk(i.freezeAuthorityRevoked, 'freezeAuthority', 12);
  add(i.token2022Risky === true, 20, 10, 'Ekstensi Token-2022 berisiko'); unk(i.token2022Risky, 'token2022', 4, 2);
  if (!isU(i.top10HolderPct)) { const t = i.top10HolderPct as number; add(t > 50, 25, 15, `Top10 holder ${t.toFixed(1)}%`); add(t > 35 && t <= 50, 12, 6, `Top10 holder ${t.toFixed(1)}%`); } else unk(i.top10HolderPct, 'top10', 10);
  if (!isU(i.topHolderPct)) add((i.topHolderPct as number) > 15, 12, 10, `Holder terbesar ${(i.topHolderPct as number).toFixed(1)}%`);
  if (!isU(i.creatorHoldPct)) add((i.creatorHoldPct as number) > 10, 15, 15, `Creator memegang ${(i.creatorHoldPct as number).toFixed(1)}%`);
  add(i.lpLockedOrBurned === false, 15, 25, 'LP tidak dikunci/dibakar'); unk(i.lpLockedOrBurned, 'lpLock', 6, 10);
  if (!isU(i.bundledPct)) add((i.bundledPct as number) > 15, 18, 18, `Bundled/cluster ${(i.bundledPct as number).toFixed(1)}%`); else unk(i.bundledPct, 'bundled', 5, 5);
  add(i.metadataMutable === true, 4, 2, 'Metadata dapat diubah');
  add(i.creatorDumped === true, 20, 30, 'Creator sudah menjual');
  if (!isU(i.liquidityDropPct)) add((i.liquidityDropPct as number) > 30, 25, 40, `Likuiditas turun ${(i.liquidityDropPct as number).toFixed(0)}%`);
  let honey: Maybe<boolean> = 'UNKNOWN';
  if (i.sellRouteOk === false) { honey = true; risk += 40; rug += 40; flags.push('Tidak ada rute jual (indikasi honeypot)'); }
  else if (i.sellRouteOk === true) { honey = false; if (!isU(i.sellImpactPct) && (i.sellImpactPct as number) > 25) { risk += 15; rug += 10; flags.push('Price impact jual sangat tinggi'); } }
  else unknown.push('sellRoute');
  return { riskScore: Math.min(100, risk), rugRiskScore: Math.min(100, rug), flags, unknown, honeypotSuspected: honey };
}
export const TOKEN2022_RISKY = ['transferFeeConfig', 'permanentDelegate', 'transferHook', 'nonTransferable', 'defaultAccountState', 'confidentialTransferMint'];
