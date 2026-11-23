import { sendTelegram } from '@att/core';
import { handle, requireUser, HttpError } from '@/lib/auth';
export const POST = handle(async () => {
  const u = await requireUser(); const t = u.secrets.telegramBotToken, c = u.telegramChatId;
  if (!t || !c) throw new HttpError(400, 'Isi Telegram Bot Token dan Chat ID di Pengaturan dulu');
  const ok = await sendTelegram(t, c, 'AI_ENTRY', 'Tes notifikasi AI Trading Terminal berhasil.'); if (!ok) throw new HttpError(400, 'Telegram menolak (token/chat id salah?)'); return { ok: true };
});
