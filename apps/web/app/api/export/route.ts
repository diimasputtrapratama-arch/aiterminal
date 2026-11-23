import { tradesToCsv } from '@att/core';
import { closedTrades, dayRange } from '@att/server';
import { handle, requireUser, HttpError } from '@/lib/auth';
export const GET = handle(async (req) => {
  const u = await requireUser(); const q = new URL(req.url).searchParams; const from = q.get('from'), to = q.get('to');
  if (!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) throw new HttpError(400, 'from/to wajib YYYY-MM-DD');
  const csv = tradesToCsv(await closedTrades(u.userId, dayRange(from, u.tz)[0], dayRange(to, u.tz)[1]));
  return new Response(csv, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="trades_${from}_${to}.csv"` } });
});
