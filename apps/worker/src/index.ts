import { ProgramScanner, PROGRAMS } from '@att/core';
import { loadAllUsers } from '@att/server';
import { onCandidate, systemRpc } from './pipeline';
import { monitorTick } from './monitor';
import { walletTick, walletPerfTick } from './wallets';
import { scheduleTick } from './schedulers';
import { ENV } from './env';

const guard = (name: string, fn: () => Promise<void>) => async () => { try { await fn(); } catch (e) { console.error(`[${name}]`, (e as Error).message); } };
async function main() {
  console.log(`Worker mulai | ALLOW_LIVE=${ENV.ALLOW_LIVE}`);
  let scanner: ProgramScanner | null = null; let scannerKey = '';
  // Scanner dibuat/dimuat ulang saat RPC/WS di dashboard berubah.
  setInterval(guard('scanner', async () => {
    const users = await loadAllUsers(); const sys = systemRpc(users);
    if (!sys || !sys.ws) { if (scanner) { scanner.stop(); scanner = null; scannerKey = ''; } return; }
    if (!users.some((u) => u.cfg.scannerEnabled)) { scanner?.stop(); scanner = null; scannerKey = ''; return; }
    if (scannerKey === sys.ws) return; scanner?.stop(); scannerKey = sys.ws;
    scanner = new ProgramScanner(sys.ws, sys.rpc, [PROGRAMS.PUMPFUN, PROGRAMS.PUMPSWAP, PROGRAMS.RAYDIUM_AMM_V4, PROGRAMS.RAYDIUM_CPMM], (c) => onCandidate(c), (m) => console.log('[scanner]', m));
    scanner.start(); console.log('Scanner aktif');
  }), 10000);
  setInterval(guard('monitor', monitorTick), 5000);
  setInterval(guard('wallets', walletTick), 20000);
  setInterval(guard('walletPerf', walletPerfTick), 6 * 3600e3);
  setInterval(guard('schedule', scheduleTick), 60000);
}
main().catch((e) => { console.error(e); process.exit(1); });
process.on('unhandledRejection', (e) => console.error('unhandledRejection', e));
