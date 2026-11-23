'use client';
import { useApi, usd, pct, cls } from '@/lib/client';
const S = (v: unknown) => (typeof v === 'number' ? v.toFixed(0) : 'UNKNOWN');
export default function Token({ params }: { params: { mint: string } }) {
  const { data: d, err, loading } = useApi(`/api/token/${params.mint}`); if (loading) return <p className="m">Menganalisis (RPC + pasar + rute jual)…</p>; if (err) return <p className="err">{err}</p>; if (!d) return null;
  const m = d.market, c = d.card, s = d.security;
  return <>
    <div className="card"><h1>{params.mint}</h1><div className="row"><span className={'pill ' + (d.signal === 'BUY' ? 'g' : d.signal === 'WATCH' ? 'y' : 'r')}>Sinyal: {d.signal}</span><span className="pill">Peluang {S(c?.opportunity)}</span><span className="pill">Risk {s?.riskScore ?? 'UNKNOWN'}</span><span className="pill">Cakupan data {c ? (c.coverage * 100).toFixed(0) : 0}%</span></div>
      {d.reasons?.map((r: string) => <div key={r} className="m">• {r}</div>)}{d.rejected?.map((r: string) => <div key={r} className="r">✖ Risk Engine: {r}</div>)}</div>
    <div className="grid"><div className="card"><h2>Pasar</h2>{m ? <table><tbody>
      <tr><td>Harga</td><td>{m.priceUsd}</td></tr><tr><td>Likuiditas</td><td>{usd(m.liquidityUsd, 0)}</td></tr><tr><td>Market cap</td><td>{usd(m.marketCapUsd, 0)}</td></tr><tr><td>FDV</td><td>{usd(m.fdvUsd, 0)}</td></tr>
      <tr><td>Volume 5m / 1j</td><td>{usd(m.volume5m, 0)} / {usd(m.volume1h, 0)}</td></tr><tr><td>Perubahan 5m / 1j</td><td className={cls(m.change1h)}>{pct(m.change5m)} / {pct(m.change1h)}</td></tr>
      <tr><td>Buy/Sell 5m</td><td>{m.buys5m} / {m.sells5m}</td></tr><tr><td>DEX</td><td>{m.dex}</td></tr></tbody></table> : <span className="m">Belum ada pair di DexScreener (UNKNOWN)</span>}</div>
      <div className="card"><h2>Skor</h2>{c && <table><tbody>{['momentum', 'liquidity', 'volume', 'holderGrowth', 'smartMoney', 'social', 'contractRisk', 'rugRisk', 'opportunity'].map((k) => <tr key={k}><td>{k}</td><td>{S(c[k])}</td></tr>)}</tbody></table>}</div></div>
    <div className="grid"><div className="card"><h2>Keamanan</h2>{s?.flags?.map((f: string) => <div key={f} className="r">⚠ {f}</div>)}{!s?.flags?.length && <div className="g">Tidak ada flag terdeteksi</div>}{d.unknown?.length > 0 && <div className="y">UNKNOWN: {d.unknown.join(', ')}</div>}<div className="m">Honeypot: {String(s?.honeypotSuspected)}</div></div>
      <div className="card"><h2>Teknikal</h2>{d.ta ? <table><tbody><tr><td>Momentum</td><td>{d.ta.momentum}</td></tr><tr><td>RSI</td><td>{d.ta.rsi?.toFixed(0) ?? 'UNKNOWN'}</td></tr><tr><td>ATR%</td><td>{d.ta.atrPct?.toFixed(1) ?? 'UNKNOWN'}</td></tr><tr><td>Breakout</td><td>{String(d.ta.breakout)}</td></tr><tr><td>Dump risk</td><td>{d.ta.dumpRisk}</td></tr></tbody></table> : null}</div></div>
    <div className="card"><h2>Agent</h2>{d.agents.map((a: any) => <div key={a.agent} className="m">{a.ok ? '✓' : '✖'} {a.agent} ({a.ms}ms) {a.notes.join('; ')}</div>)}{d.notes?.length > 0 && <div className="m">Catatan data: {d.notes.join(' | ')}</div>}<p className="m">Analisis ini bukan nasihat keuangan dan tidak menjamin profit.</p></div></>;
}
