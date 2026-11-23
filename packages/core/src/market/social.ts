import type { Maybe } from '../risk/types';
/** Opsional: butuh X API Bearer Token milik pengguna (berbayar). Tanpa token => UNKNOWN. */
export async function xMentions1h(bearer: string | undefined, query: string): Promise<Maybe<number>> {
  if (!bearer) return 'UNKNOWN';
  try {
    const r = await fetch(`https://api.x.com/2/tweets/counts/recent?granularity=hour&query=${encodeURIComponent(query)}`, { headers: { authorization: `Bearer ${bearer}` } });
    if (!r.ok) return 'UNKNOWN';
    const j: any = await r.json(); const last = j.data?.[j.data.length - 1]; return typeof last?.tweet_count === 'number' ? last.tweet_count : 'UNKNOWN';
  } catch { return 'UNKNOWN'; }
}
