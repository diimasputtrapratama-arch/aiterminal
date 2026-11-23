'use client';
import { useCallback, useEffect, useState } from 'react';
export async function api<T = any>(path: string, opts?: { method?: string; body?: unknown }): Promise<T> {
  const r = await fetch(path, { method: opts?.method ?? (opts?.body ? 'POST' : 'GET'), headers: { 'content-type': 'application/json' }, body: opts?.body ? JSON.stringify(opts.body) : undefined });
  if (r.status === 401 && typeof window !== 'undefined' && location.pathname !== '/login') { location.href = '/login'; throw new Error('Belum login'); }
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`); return j as T;
}
export function useApi<T = any>(path: string | null, every = 0) {
  const [data, setData] = useState<T | null>(null); const [err, setErr] = useState(''); const [loading, setL] = useState(!!path);
  const load = useCallback(async () => { if (!path) return; try { setData(await api<T>(path)); setErr(''); } catch (e: any) { setErr(e.message); } finally { setL(false); } }, [path]);
  useEffect(() => { load(); if (!every) return; const t = setInterval(load, every); return () => clearInterval(t); }, [load, every]);
  return { data, err, loading, reload: load };
}
export const usd = (v: unknown, d = 2) => (typeof v === 'number' && isFinite(v) ? '$' + v.toLocaleString('en-US', { maximumFractionDigits: d }) : 'UNKNOWN');
export const pct = (v: unknown, d = 1) => (typeof v === 'number' && isFinite(v) ? v.toFixed(d) + '%' : 'UNKNOWN');
export const cls = (v: unknown) => (typeof v === 'number' ? (v > 0 ? 'g' : v < 0 ? 'r' : '') : 'm');
export const short = (s: string) => s.slice(0, 4) + '…' + s.slice(-4);
