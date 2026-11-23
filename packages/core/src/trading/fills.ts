/** Estimasi price impact kasar (constant-product): impact ≈ size / (liquidity/2). Hanya perkiraan. */
export function estimateSlippagePct(sizeUsd: number, liquidityUsd: number): number {
  if (liquidityUsd <= 0) return 100;
  return Math.min(100, (sizeUsd / (liquidityUsd / 2)) * 100);
}
export interface FillCosts { feeBps: number; networkFeeUsd: number; priorityFeeUsd: number }
export const DEFAULT_COSTS: FillCosts = { feeBps: 100, networkFeeUsd: 0.002, priorityFeeUsd: 0.05 };
export interface Fill { price: number; qty: number; grossUsd: number; feeUsd: number; networkFeeUsd: number; slippagePct: number }

export function simulateFill(side: 'BUY' | 'SELL', sizeUsd: number, midPrice: number, liquidityUsd: number, c: FillCosts = DEFAULT_COSTS): Fill {
  const slippagePct = estimateSlippagePct(sizeUsd, liquidityUsd);
  const px = side === 'BUY' ? midPrice * (1 + slippagePct / 100) : midPrice * (1 - slippagePct / 100);
  const feeUsd = sizeUsd * (c.feeBps / 1e4);
  const net = c.networkFeeUsd + c.priorityFeeUsd;
  const qty = side === 'BUY' ? (sizeUsd - feeUsd) / px : sizeUsd / px;
  return { price: px, qty, grossUsd: sizeUsd, feeUsd, networkFeeUsd: net, slippagePct };
}

export interface SellFill { price: number; grossUsd: number; feeUsd: number; proceedsUsd: number; networkFeeUsd: number; slippagePct: number }
/** Jual sejumlah qty token pada harga mid. proceedsUsd = bersih setelah fee DEX. */
export function simulateSellQty(qty: number, midPrice: number, liquidityUsd: number, c: FillCosts = DEFAULT_COSTS): SellFill {
  const slippagePct = estimateSlippagePct(qty * midPrice, liquidityUsd);
  const price = midPrice * (1 - slippagePct / 100); const grossUsd = qty * price; const feeUsd = grossUsd * (c.feeBps / 1e4);
  return { price, grossUsd, feeUsd, proceedsUsd: grossUsd - feeUsd, networkFeeUsd: c.networkFeeUsd + c.priorityFeeUsd, slippagePct };
}
