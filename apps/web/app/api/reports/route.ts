import { prisma, generateDaily, generateMonthly, closedTrades, dayRange } from '@att/server';
import { tradeStats, buildCalendar } from '@att/core';
import { sendTelegram } from '@att/core';
import { handle, requireUser, HttpError } from '@/lib/auth';
export const GET = handle(async (req) => {
  const u = await requireUser(); const t = new URL(req.url).searchParams.get('type');
  if (t === 'monthly') return { items: await prisma.monthlyReports.findMany({ where: { userId: u.userId }, orderBy: { month: 'desc' }, take: 24 }) };
  return { items: await prisma.dailyReports.findMany({ where: { userId: u.userId }, orderBy: { date: 'desc' }, take: 60 }) };
});
export const POST = handle(async (req) => {
  const u = await requireUser(); const b = await req.json();
  const notify = async (text: string) => { if (u.secrets.telegramBotToken && u.telegramChatId) await sendTelegram(u.secrets.telegramBotToken, u.telegramChatId, b.type === 'monthly' ? 'MONTHLY_REPORT' : 'DAILY_REPORT', text).catch(() => {}); };
  if (b.type === 'daily' && /^\d{4}-\d{2}-\d{2}$/.test(b.date)) return generateDaily(u, b.date, notify);
  if (b.type === 'monthly' && /^\d{4}-\d{2}$/.test(b.month)) return generateMonthly(u, b.month, notify);
  if (b.type === 'range' && /^\d{4}-\d{2}-\d{2}$/.test(b.from) && /^\d{4}-\d{2}-\d{2}$/.test(b.to)) {
    const ts = await closedTrades(u.userId, dayRange(b.from, u.tz)[0], dayRange(b.to, u.tz)[1]); const s = tradeStats(ts); return { stats: { ...s, best: undefined, worst: undefined }, days: buildCalendar(ts, u.tz) };
  }
  throw new HttpError(400, 'Permintaan tidak valid');
});
