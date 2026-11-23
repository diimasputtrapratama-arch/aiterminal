import { loadAllUsers, equityUsd, generateDaily, generateMonthly, prisma } from '@att/server';
import { dayKey } from '@att/core';
import { alert } from './notify';
/** Tiap menit: snapshot equity (5 menit), laporan harian (00:05 lokal), bulanan (tgl 1). Idempoten. */
let lastSnap = 0;
export async function scheduleTick() {
  const users = await loadAllUsers(); const now = new Date();
  if (Date.now() - lastSnap > 300000) { lastSnap = Date.now(); for (const u of users) await prisma.equitySnapshots.create({ data: { userId: u.userId, equityUsd: await equityUsd(u.userId) } }); }
  for (const u of users) {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: u.tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(now).split(':').map(Number);
    if (parts[0] !== 0 || parts[1] < 5) continue;
    const todayK = dayKey(now, u.tz); const yest = dayKey(new Date(+now - 24 * 3.6e6), u.tz);
    const date = new Date(yest + 'T00:00:00.000Z');
    if (!(await prisma.dailyReports.findUnique({ where: { userId_date: { userId: u.userId, date } } }))) {
      await generateDaily(u, yest, (t) => alert(u, 'DAILY_REPORT', t));
    }
    if (todayK.endsWith('-01')) { const month = yest.slice(0, 7);
      if (!(await prisma.monthlyReports.findUnique({ where: { userId_month: { userId: u.userId, month } } }))) await generateMonthly(u, month, (t) => alert(u, 'MONTHLY_REPORT', t)); }
  }
}
