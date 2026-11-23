import { buildCalendar, tradeNet, dayKey } from '@att/core';
import { closedTrades } from '@att/server';
import { dayRange } from '@att/server';
import { handle, requireUser, HttpError } from '@/lib/auth';
export const GET = handle(async (req) => {
  const u = await requireUser(); const q = new URL(req.url).searchParams; const date = q.get('date'); const month = q.get('month'); const year = q.get('year');
  if (date) { if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new HttpError(400, 'date tidak valid'); const [a, b] = dayRange(date, u.tz); const ts = await closedTrades(u.userId, a, b); return { trades: ts.map((t) => ({ ...t, net: tradeNet(t) })) }; }
  let from: Date, to: Date;
  if (year && /^\d{4}$/.test(year)) { from = dayRange(`${year}-01-01`, u.tz)[0]; to = dayRange(`${Number(year) + 1}-01-01`, u.tz)[0]; }
  else if (month && /^\d{4}-\d{2}$/.test(month)) { const [y, m] = month.split('-').map(Number); from = dayRange(`${month}-01`, u.tz)[0]; to = dayRange(m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`, u.tz)[0]; }
  else throw new HttpError(400, 'Berikan month=YYYY-MM atau year=YYYY');
  const days = buildCalendar(await closedTrades(u.userId, from, to), u.tz); return { tz: u.tz, today: dayKey(new Date(), u.tz), days };
});
