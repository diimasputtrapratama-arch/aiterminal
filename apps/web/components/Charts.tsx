export function Line({ data, h = 70 }: { data: number[]; h?: number }) {
  if (data.length < 2) return <div className="m">Belum ada data</div>; const mn = Math.min(...data), mx = Math.max(...data), W = 300;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * W},${h - 4 - ((v - mn) / (mx - mn || 1)) * (h - 8)}`).join(' ');
  return <svg viewBox={`0 0 ${W} ${h}`} width="100%" height={h}><polyline fill="none" stroke="#3b82f6" strokeWidth="2" points={pts} /></svg>;
}
export function Bars({ data, h = 80 }: { data: { label: string; v: number }[]; h?: number }) {
  if (!data.length) return <div className="m">Belum ada data</div>; const mx = Math.max(...data.map((d) => Math.abs(d.v)), 1e-9), W = 300, bw = W / data.length;
  return <svg viewBox={`0 0 ${W} ${h}`} width="100%" height={h}><line x1="0" x2={W} y1={h / 2} y2={h / 2} stroke="#243044" />{data.map((d, i) => { const bh = (Math.abs(d.v) / mx) * (h / 2 - 3); return <rect key={i} x={i * bw + 1} y={d.v >= 0 ? h / 2 - bh : h / 2} width={Math.max(1, bw - 2)} height={bh} fill={d.v >= 0 ? '#22c55e' : '#ef4444'}><title>{d.label}: {d.v.toFixed(2)}</title></rect>; })}</svg>;
}
