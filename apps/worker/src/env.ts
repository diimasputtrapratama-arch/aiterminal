const need = (k: string) => { const v = process.env[k]; if (!v) throw new Error(`Env ${k} wajib diisi`); return v; };
export const ENV = {
  MASTER_KEY: need('MASTER_KEY'),                       // kunci enkripsi rahasia (>=32 karakter acak)
  RPC_URL: process.env.SOLANA_RPC_URL ?? '',            // fallback jika pengguna belum mengisi di dashboard
  WS_URL: process.env.SOLANA_WS_URL ?? '',
  ALLOW_LIVE: process.env.ALLOW_LIVE === 'true',        // saklar global; default mati
};
