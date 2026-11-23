import { CREATE_LOG_PATTERNS, PROGRAMS, WSOL, USDC } from './programs';
import { SolanaRpc, extractMintFromTx } from './rpc';

export interface Candidate { mint: string; program: string; signature: string; slot: number; creator?: string; source: 'pumpfun' | 'pumpswap' | 'raydium' | 'other' }
const srcOf = (p: string): Candidate['source'] => p === PROGRAMS.PUMPFUN ? 'pumpfun' : p === PROGRAMS.PUMPSWAP ? 'pumpswap' : p.startsWith('675k') || p.startsWith('CPMM') ? 'raydium' : 'other';

/** Pemantau WebSocket (logsSubscribe) dengan reconnect otomatis + dedup. */
export class ProgramScanner {
  private ws?: WebSocket; private stopped = false; private backoff = 1000; private seen = new Set<string>();
  private lastMsg = Date.now(); private hb?: ReturnType<typeof setInterval>;
  constructor(private wsUrl: string, private rpc: SolanaRpc, private programs: string[], private onCandidate: (c: Candidate) => void | Promise<void>, private onLog: (m: string) => void = () => {}) {}
  start() { this.stopped = false; this.connect(); this.hb = setInterval(() => { if (Date.now() - this.lastMsg > 60000) { this.onLog('WS senyap >60s, reconnect'); this.ws?.close(); } }, 15000); }
  stop() { this.stopped = true; clearInterval(this.hb); this.ws?.close(); }
  private connect() {
    const ws = new WebSocket(this.wsUrl); this.ws = ws; const subs = new Map<number, string>();
    ws.onopen = () => { this.backoff = 1000; this.lastMsg = Date.now(); this.programs.forEach((p, i) => ws.send(JSON.stringify({ jsonrpc: '2.0', id: i + 1, method: 'logsSubscribe', params: [{ mentions: [p] }, { commitment: 'confirmed' }] }))); this.onLog('WS terhubung'); };
    ws.onmessage = (ev) => {
      this.lastMsg = Date.now();
      let m: any; try { m = JSON.parse(String(ev.data)); } catch { return; }
      if (m.id && typeof m.result === 'number') { subs.set(m.result, this.programs[m.id - 1]); return; }
      const v = m.params?.result?.value; if (!v || v.err) return;
      const program = subs.get(m.params.subscription); if (!program) return;
      const re = CREATE_LOG_PATTERNS[program]; if (!re || !(v.logs as string[]).some((l) => re.test(l))) return;
      if (this.seen.has(v.signature)) return; this.seen.add(v.signature); if (this.seen.size > 5000) this.seen.clear();
      void this.handle(program, v.signature, m.params.result.context?.slot ?? 0);
    };
    ws.onclose = () => { if (this.stopped) return; setTimeout(() => this.connect(), this.backoff); this.backoff = Math.min(this.backoff * 2, 30000); };
    ws.onerror = () => { this.onLog('WS error'); };
  }
  private async handle(program: string, signature: string, slot: number) {
    for (let a = 0; a < 4; a++) {           // tx mungkin belum terindeks
      try {
        const tx = await this.rpc.getTransaction(signature);
        if (tx) { const mint = extractMintFromTx(tx, [WSOL, USDC]); if (mint) await this.onCandidate({ mint, program, signature, slot, creator: tx?.transaction?.message?.accountKeys?.[0]?.pubkey, source: srcOf(program) }); return; }
      } catch (e) { this.onLog(`getTransaction gagal: ${(e as Error).message}`); }
      await new Promise((r) => setTimeout(r, 800 * (a + 1)));
    }
  }
}
