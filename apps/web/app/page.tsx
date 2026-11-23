'use client';
import Link from 'next/link'; import { api, useApi, usd, pct, cls, short } from '@/lib/client'; import { Line } from '@/components/Charts';
function Rank({ title, rows, f }: { title: string; rows: any[]; f: (r: any) => React.ReactNode }) {
  return <div className="card"><h2>{title}</h2><div className="sc"><table><tbody>{rows.length ? rows.map((r) => <tr key={r.mint}><td><Link href={`/token/${r.mint}`}>{short(r.mint)}</Link></td><td>{f(r)}</td><td className="m">{r.source}</td></tr>) : <tr><td className="m">Belum ada data (pastikan worker & RPC aktif)</td></tr>}</tbody></table></div></div>;
}
export default function Dashboard() {
  const { data: d, err, reload } = useApi('/api/dashboard', 15000);
  if (err) return <p className="err">{err}</p>; if (!d) return <p className="m">Memuat…</p>; const p = d.portfolio;
  const kill = async () => { if (confirm('Kill switch: hentikan auto-trade & jual semua posisi (emergency). Lanjut?')) { await api('/api/settings', { method: 'PUT', body: { config: { killSwitch: true, autoTrade: false } } }); reload(); } };
  const unkill = async () => { await api('/api/settings', { method: 'PUT', body: { config: { killSwitch: false } } }); reload(); };
  return <>
    <div className="grid">
      <div className="card"><div className="m">Equity ({p.mode.toUpperCase()})</div><div className="big">{usd(p.equity)}</div><div className="m">Kas {usd(p.cash)}</div></div>
      <div className="card"><div className="m">Hari ini</div><div className={'big ' + cls(p.todayNet)}>{usd(p.todayNet)}</div><div className="m">{p.todayTrades} trade selesai</div></div>
      <div className="card"><div className="m">Auto-trade</div><div className="big">{p.killSwitch ? 'KILL' : p.autoTrade ? 'ON' : 'OFF'}</div>{p.killSwitch ? <button className="sec" onClick={unkill}>Lepas kill switch</button> : <button className="dg" onClick={kill}>Kill switch</button>}</div>
    </div>
    <div className="card"><h2>Equity 7 hari</h2><Line data={d.equitySeries.map((x: number[]) => x[1])} /></div>
    <div className="card"><h2>Posisi aktif</h2><div className="sc"><table><thead><tr><th>Token</th><th>Mode</th><th>Gain</th><th>Entry</th><th>Harga</th><th>Stop</th></tr></thead><tbody>
      {d.positions.map((x: any) => <tr key={x.id}><td><Link href={`/token/${x.mint}`}>{x.symbol ?? short(x.mint)}</Link></td><td>{x.mode}</td><td className={cls(x.gainPct)}>{pct(x.gainPct)}</td><td>{x.entry}</td><td>{x.last ?? 'UNKNOWN'}</td><td>{x.stop?.toPrecision(5)}</td></tr>)}
      {!d.positions.length && <tr><td className="m">Tidak ada posisi</td></tr>}</tbody></table></div></div>
    <div className="grid">
      <Rank title="Token baru (feed)" rows={d.newFeed} f={(r) => <>{usd(r.liq, 0)} • risk {r.risk}</>} />
      <Rank title="Ranking peluang AI" rows={d.aiRanking} f={(r) => <b className="g">{typeof r.opp === 'number' ? r.opp.toFixed(0) : 'UNKNOWN'} <span className="m">cov {(r.coverage * 100).toFixed(0)}%</span></b>} />
      <Rank title="Ranking keamanan" rows={d.securityRanking} f={(r) => <span className={r.risk > 50 ? 'r' : 'g'}>risk {r.risk}{r.unknown.length ? ` (${r.unknown.length} UNKNOWN)` : ''}</span>} />
      <Rank title="Trending" rows={d.trending} f={(r) => <>vol5m {usd(r.vol5m, 0)}</>} />
      <Rank title="Top volume 1j" rows={d.topVolume} f={(r) => usd(r.vol1h, 0)} />
      <Rank title="Top likuiditas" rows={d.topLiquidity} f={(r) => usd(r.liq, 0)} />
      <Rank title="Top gainers 1j" rows={d.gainers} f={(r) => <span className="g">{pct(r.ch1h)}</span>} />
      <Rank title="Top losers 1j" rows={d.losers} f={(r) => <span className="r">{pct(r.ch1h)}</span>} />
    </div>
    <div className="grid"><div className="card"><h2>Whale / smart money</h2><div className="sc"><table><tbody>{d.whales.map((w: any) => <tr key={w.id}><td className={w.action === 'BUY' ? 'g' : 'r'}>{w.action}</td><td>{short(w.walletAddress)}</td><td><Link href={`/token/${w.mint}`}>{short(w.mint)}</Link></td></tr>)}{!d.whales.length && <tr><td className="m">Tambahkan wallet di menu Wallet</td></tr>}</tbody></table></div></div>
      <div className="card"><h2>Notifikasi</h2>{d.alerts.map((a: any) => <div key={a.id} className="m" style={{ fontSize: 12 }}><b>{a.type}</b> {a.message.slice(0, 90)}</div>)}{!d.alerts.length && <span className="m">Belum ada</span>}</div></div>
  </>;
}
