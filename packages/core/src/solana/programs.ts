// Verifikasi ulang alamat program ini dengan dokumentasi resmi sebelum live.
export const PROGRAMS = {
  PUMPFUN: '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P',
  PUMPSWAP: 'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn53L',
  RAYDIUM_AMM_V4: '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8',
  RAYDIUM_CPMM: 'CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C',
  TOKEN: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
  TOKEN_2022: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',
} as const;
export const WSOL = 'So11111111111111111111111111111111111111112';
export const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export const CREATE_LOG_PATTERNS: Record<string, RegExp> = {
  [PROGRAMS.PUMPFUN]: /Instruction: (Create|CreateV2)\b/,
  [PROGRAMS.PUMPSWAP]: /Instruction: CreatePool\b/,
  [PROGRAMS.RAYDIUM_AMM_V4]: /initialize2/,
  [PROGRAMS.RAYDIUM_CPMM]: /Instruction: Initialize\b/,
};
