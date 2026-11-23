'use client';
import { useEffect, useState } from 'react'; import { api, useApi, usd } from '@/lib/client';
const FIELDS: [string, string, string][] = [
  ['rpcUrl', 'Solana RPC URL (HTTP)', 'Wajib. Contoh dari Helius/QuickNode'], ['wsUrl', 'Solana RPC WebSocket (wss://)', 'Wajib untuk scanner token baru'],
  ['heliusApiKey', 'Helius API Key (opsional)', ''], ['jupiterApiKey', 'Jupiter API Key (opsional)', 'Untuk rate limit lebih tinggi'],
  ['anthropicKey', 'Anthropic API Key (opsional)', 'Mengaktifkan ringkasan & penerjemah instruksi AI'], ['telegramBotToken', 'Telegram Bot Token', 'Dari @BotFather'],
  ['telegramChatId', 'Telegram Chat ID', 'ID chat tujuan notifikasi'], ['xBearerToken', 'X (Twitter) Bearer Token (opsional)', 'Untuk skor sosial'],
  ['walletPrivateKey', 'Private key wallet eksekusi (LIVE saja)', 'Gunakan wallet KHUSUS bermodal kecil. Disimpan terenkripsi, tidak pernah ditampilkan.'],
];
const ALERTS = ['NEW_TOKEN', 'HIGH_POTENTIAL', 'SUSPICIOUS', 'WHALE_BUY', 'WHALE_SELL', 'LIQUIDITY_REMOVED', 'ABNORMAL_VOLUME', 'AI_ENTRY', 'AUTO_BUY', 'TP_HIT', 'SL_HIT', 'DAILY_REPORT', 'MONTHLY_REPORT', 'MAX_DAILY_LOSS'];
export default function Settings() {
  const { data, reload } = useApi('/api/settings'); const led = useApi('/api/ledger');
  const [sec, setSec] = useState<Record<string, string>>({}); const [cfg, setCfg] = useState<any>(null); const [tpText, setTp] = useState(''); const [msg, setMsg] = useState(''); const [amt, setAmt] = useState('1000');
  useEffect(() => { if (data) { setCfg(data.config); setTp(data.config.tpsl.tpLevels.map((l: any) => `${l.gainPct}:${l.sellPct}`).join(', ')); } }, [data]);
  if (!data || !cfg) return <p className="m">Memuat…</p>;
  const set = (k: string, v: any) => setCfg({ ...cfg, [k]: v }); const setT = (k: string, v: any) => setCfg({ ...cfg, tpsl: { ...cfg.tpsl, [k]: v } });
  async function save() { try {
    const tpLevels = tpText.split(',').map((x) => x.trim()).filter(Boolean).map((x) => { const [g, s] = x.split(':').map(Number); return { gainPct: g, sellPct: s }; });
    await api('/api/settings', { method: 'PUT', body: { secrets: sec, config: { ...cfg, tpsl: { ...cfg.tpsl, tpLevels } } } }); setSec({}); setMsg('Tersimpan ✓'); reload(); } catch (e: any) { setMsg('Gagal: ' + e.message); } }
  const money = async (type: string) => { try { await api('/api/ledger', { body: { type, amountUsd: Number(amt) } }); led.reload(); setMsg('Tercatat ✓'); } catch (e: any) { setMsg(e.message); } };
  return <>
    <div className="card"><h2>API & kredensial</h2><p className="m">Disimpan terenkripsi (AES-256-GCM). Kolom kosong = tidak diubah. Ketik <code>__DELETE__</code> untuk menghapus.</p>
      {FIELDS.map(([k, label, hint]) => <div key={k} style={{ margin: '8px 0' }}><div>{label} {data.secretsSet[k] ? <span className="ok">● terisi</span> : <span className="m">○ kosong</span>}</div><input type={/Key|Token|private/i.test(label) ? 'password' : 'text'} style={{ width: '100%' }} placeholder={hint} value={sec[k] ?? ''} onChange={(e) => setSec({ ...sec, [k]: e.target.value })} autoComplete="off" /></div>)}
      <div className="row"><button className="sec" onClick={async () => { try { await api('/api/telegram-test', { method: 'POST', body: {} }); setMsg('Tes Telegram terkirim ✓'); } catch (e: any) { setMsg(e.message); } }}>Tes Telegram</button></div></div>
    <div className="card"><h2>Mode & eksekusi</h2><div className="row">
      <label>Mode <select value={cfg.mode} onChange={(e) => set('mode', e.target.value)}><option>CONSERVATIVE</option><option>BALANCED</option><option>AGGRESSIVE</option></select></label>
      <label>Trading <select value={cfg.tradingMode} onChange={(e) => set('tradingMode', e.target.value)}><option value="paper">paper (simulasi)</option><option value="live">LIVE (uang nyata)</option></select></label>
      <label><input type="checkbox" checked={cfg.autoTrade} onChange={(e) => set('autoTrade', e.target.checked)} /> Izinkan auto-trade</label>
      <label><input type="checkbox" checked={cfg.scannerEnabled} onChange={(e) => set('scannerEnabled', e.target.checked)} /> Scanner aktif</label></div>
      {cfg.tradingMode === 'live' && <p className="r">LIVE hanya berjalan jika worker diberi ALLOW_LIVE=true. Selesaikan paper trading dulu. Kerugian modal sangat mungkin terjadi.</p>}
      <div className="row" style={{ marginTop: 8 }}><label>Ukuran posisi % equity <input type="number" step="0.1" value={cfg.sizePctOfEquity} onChange={(e) => set('sizePctOfEquity', Number(e.target.value))} style={{ width: 80 }} /></label><label>Maks trade/hari <input type="number" value={cfg.maxTradesPerDay} onChange={(e) => set('maxTradesPerDay', Number(e.target.value))} style={{ width: 80 }} /></label>
      <label><input type="checkbox" checked={cfg.useDas} onChange={(e) => set('useDas', e.target.checked)} /> Hitung holder (butuh Helius DAS)</label><label><input type="checkbox" checked={cfg.deepBundleScan} onChange={(e) => set('deepBundleScan', e.target.checked)} /> Scan bundled buy (boros kredit RPC)</label></div></div>
    <div className="card"><h2>Take profit & stop loss</h2><div className="row"><label>SL % <input type="number" value={cfg.tpsl.stopLossPct} onChange={(e) => setT('stopLossPct', Number(e.target.value))} style={{ width: 70 }} /></label></div>
      <div style={{ margin: '8px 0' }}>Level TP (format <code>gain%:jual%</code>, pisah koma)<input style={{ width: '100%' }} value={tpText} onChange={(e) => setTp(e.target.value)} /></div>
      <div className="row"><label>Trailing aktif di +% <input type="number" value={cfg.tpsl.trailing?.activateGainPct ?? 0} onChange={(e) => setT('trailing', { activateGainPct: Number(e.target.value), trailPct: cfg.tpsl.trailing?.trailPct ?? 12 })} style={{ width: 70 }} /></label><label>jarak % <input type="number" value={cfg.tpsl.trailing?.trailPct ?? 12} onChange={(e) => setT('trailing', { activateGainPct: cfg.tpsl.trailing?.activateGainPct ?? 30, trailPct: Number(e.target.value) })} style={{ width: 70 }} /></label>
      <label>Break-even di +% <input type="number" value={cfg.tpsl.breakEven?.atGainPct ?? 0} onChange={(e) => setT('breakEven', { atGainPct: Number(e.target.value), offsetPct: 1 })} style={{ width: 70 }} /></label><label>Maks hold (menit) <input type="number" value={cfg.tpsl.maxHoldMinutes ?? ''} onChange={(e) => setT('maxHoldMinutes', e.target.value ? Number(e.target.value) : undefined)} style={{ width: 80 }} /></label></div></div>
    <div className="card"><h2>Notifikasi Telegram</h2><div className="row">{ALERTS.map((a) => <label key={a} style={{ width: 200 }}><input type="checkbox" checked={cfg.alerts[a] ?? a !== 'NEW_TOKEN'} onChange={(e) => set('alerts', { ...cfg.alerts, [a]: e.target.checked })} /> {a}</label>)}</div></div>
    <div className="card"><h2>Modal (ledger)</h2><p className="m">Saldo kas {usd(led.data?.cash)} • Equity {usd(led.data?.equity)}. Deposit/withdrawal tercatat terpisah dari profit.</p><div className="row"><input type="number" value={amt} onChange={(e) => setAmt(e.target.value)} style={{ width: 120 }} /><button onClick={() => money('DEPOSIT')}>Deposit</button><button className="sec" onClick={() => money('WITHDRAWAL')}>Withdraw</button></div></div>
    <div className="row"><button onClick={save}>Simpan semua</button><button className="sec" onClick={async () => { await api('/api/auth/logout', { method: 'POST', body: {} }); location.href = '/login'; }}>Keluar</button><span>{msg}</span></div></>;
}
