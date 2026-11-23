import type { Maybe, Mode } from '../risk/types';

export interface TokenFeatures {
  ageMinutes: Maybe<number>;
  priceChange5mPct: Maybe<number>;
  priceChange1hPct: Maybe<number>;
  volume5mUsd: Maybe<number>;
  volume1hUsd: Maybe<number>;
  liquidityUsd: Maybe<number>;
  marketCapUsd: Maybe<number>;
  buys5m: Maybe<number>;
  sells5m: Maybe<number>;
  holders: Maybe<number>;
  holdersGrowth1hPct: Maybe<number>;
  smartWalletBuys: Maybe<number>;
  socialMentions1h: Maybe<number>;
  hasTwitter: Maybe<boolean>;
  hasTelegram: Maybe<boolean>;
  securityRiskScore: Maybe<number>; // 0 aman .. 100 berbahaya
  rugRiskScore: Maybe<number>;
}

export type Score = number | 'UNKNOWN';
export interface ScoreCard {
  momentum: Score; liquidity: Score; volume: Score; holderGrowth: Score;
  smartMoney: Score; social: Score; contractRisk: Score; rugRisk: Score;
  opportunity: Score;
  coverage: number; // 0..1 porsi komponen yang datanya tersedia
}

const known = <T>(v: Maybe<T>): v is T => v !== 'UNKNOWN';
const clamp = (x: number, a = 0, b = 100) => Math.max(a, Math.min(b, x));
const lin = (x: number, lo: number, hi: number) => clamp(((x - lo) / (hi - lo)) * 100);

export function scoreToken(f: TokenFeatures): ScoreCard {
  const momentum: Score = known(f.priceChange5mPct) && known(f.priceChange1hPct)
    ? clamp(0.6 * lin(f.priceChange5mPct, -5, 25) + 0.4 * lin(f.priceChange1hPct, -10, 80))
    : 'UNKNOWN';
  const liquidity: Score = known(f.liquidityUsd) ? lin(Math.log10(Math.max(f.liquidityUsd, 1)), 3.3, 5.3) : 'UNKNOWN';
  let volume: Score = 'UNKNOWN';
  if (known(f.volume5mUsd) && known(f.liquidityUsd) && f.liquidityUsd > 0) {
    volume = lin(f.volume5mUsd / f.liquidityUsd, 0.02, 0.6);
  }
  const holderGrowth: Score = known(f.holdersGrowth1hPct) ? lin(f.holdersGrowth1hPct, 0, 60) : 'UNKNOWN';
  const smartMoney: Score = known(f.smartWalletBuys) ? lin(f.smartWalletBuys, 0, 3) : 'UNKNOWN';
  let social: Score = 'UNKNOWN';
  if (known(f.socialMentions1h)) social = lin(f.socialMentions1h, 0, 50);
  else if (known(f.hasTwitter) && known(f.hasTelegram)) social = (f.hasTwitter ? 40 : 0) + (f.hasTelegram ? 30 : 0);
  const contractRisk: Score = known(f.securityRiskScore) ? clamp(f.securityRiskScore) : 'UNKNOWN';
  const rugRisk: Score = known(f.rugRiskScore) ? clamp(f.rugRiskScore) : 'UNKNOWN';

  const comps: [Score, number][] = [
    [momentum, 0.22], [liquidity, 0.16], [volume, 0.16], [holderGrowth, 0.12], [smartMoney, 0.12], [social, 0.08],
  ];
  const kn = comps.filter(([s]) => s !== 'UNKNOWN') as [number, number][];
  const wsum = kn.reduce((a, [, w]) => a + w, 0);
  const coverage = comps.reduce((a, [s, w]) => a + (s !== 'UNKNOWN' ? w : 0), 0) / comps.reduce((a, [, w]) => a + w, 0);
  let opportunity: Score = 'UNKNOWN';
  if (wsum > 0 && contractRisk !== 'UNKNOWN') {
    const base = kn.reduce((a, [s, w]) => a + s * w, 0) / wsum;
    const risk = Math.max(contractRisk, rugRisk === 'UNKNOWN' ? 50 : rugRisk);
    opportunity = clamp(base * (1 - risk / 140));
  }
  return { momentum, liquidity, volume, holderGrowth, smartMoney, social, contractRisk, rugRisk, opportunity, coverage };
}

export interface EntryThresholds { minOpportunity: number; minCoverage: number; maxRisk: number; minMomentum: number }
export const ENTRY_THRESHOLDS: Record<Mode, EntryThresholds> = {
  CONSERVATIVE: { minOpportunity: 62, minCoverage: 0.8, maxRisk: 30, minMomentum: 45 },
  BALANCED:     { minOpportunity: 52, minCoverage: 0.65, maxRisk: 45, minMomentum: 35 },
  AGGRESSIVE:   { minOpportunity: 42, minCoverage: 0.5, maxRisk: 60, minMomentum: 25 },
};

export interface EntryVerdict { action: 'BUY' | 'WATCH' | 'SKIP'; reasons: string[] }
/** Token baru TIDAK otomatis dibeli: harus lolos ambang skor, cakupan data, dan risiko. */
export function entryVerdict(card: ScoreCard, mode: Mode): EntryVerdict {
  const t = ENTRY_THRESHOLDS[mode];
  const reasons: string[] = [];
  if (card.opportunity === 'UNKNOWN') return { action: 'SKIP', reasons: ['Skor peluang UNKNOWN (data tidak cukup)'] };
  if (card.coverage < t.minCoverage) reasons.push(`Cakupan data ${(card.coverage * 100).toFixed(0)}% < ${(t.minCoverage * 100).toFixed(0)}%`);
  if (card.contractRisk === 'UNKNOWN' || card.contractRisk > t.maxRisk) reasons.push('Risiko kontrak tinggi/UNKNOWN');
  if (card.rugRisk !== 'UNKNOWN' && card.rugRisk > t.maxRisk + 15) reasons.push('Risiko rug tinggi');
  if (card.momentum === 'UNKNOWN' || card.momentum < t.minMomentum) reasons.push('Momentum belum terkonfirmasi');
  if (card.opportunity < t.minOpportunity) reasons.push(`Skor peluang ${card.opportunity.toFixed(0)} < ${t.minOpportunity}`);
  if (reasons.length === 0) return { action: 'BUY', reasons: ['Lolos semua ambang mode ' + mode] };
  return { action: card.opportunity >= t.minOpportunity - 10 ? 'WATCH' : 'SKIP', reasons };
}
