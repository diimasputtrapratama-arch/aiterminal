/** Nilai yang tidak tersedia HARUS 'UNKNOWN', bukan ditebak. */
export type Maybe<T> = T | 'UNKNOWN';

export interface TokenSnapshot {
  mint: string;
  liquidityUsd: Maybe<number>;
  top10HolderPct: Maybe<number>;
  mintAuthorityRevoked: Maybe<boolean>;
  freezeAuthorityRevoked: Maybe<boolean>;
  lpLockedOrBurned: Maybe<boolean>;
  honeypotSuspected: Maybe<boolean>;
  estSlippagePct: Maybe<number>;
}

export interface OrderProposal {
  side: 'BUY' | 'SELL';
  sizeUsd: number;
  stopLossPct: number | null;
  token: TokenSnapshot;
}

export interface PortfolioState {
  equityUsd: number;
  openPositions: number;
  dailyRealizedPnlUsd: number;
}

export type Mode = 'CONSERVATIVE' | 'BALANCED' | 'AGGRESSIVE';

/** Batas keras: tidak bisa dimatikan oleh instruksi AI Command Center. */
export interface HardLimits {
  maxPositionPctOfEquity: number;
  maxOpenPositions: number;
  maxDailyLossPct: number;
  maxSlippagePct: number;
  minLiquidityUsd: number;
  maxTop10HolderPct: number;
  requireStopLoss: true;
  requireMintAuthorityRevoked: true;
  requireFreezeAuthorityRevoked: true;
}

export interface RiskDecision {
  approved: boolean;
  reasons: string[];
}
