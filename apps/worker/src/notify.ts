import { sendTelegram, type AlertType } from '@att/core';
import { prisma, type UserRuntime } from '@att/server';

export async function alert(u: UserRuntime, type: AlertType, text: string, mint?: string) {
  if (u.cfg.alerts[type] === false) return;
  const row = await prisma.tokenAlerts.create({ data: { userId: u.userId, mint: mint && (await prisma.solanaTokens.findUnique({ where: { mint } })) ? mint : null, type, message: text } });
  const tok = u.secrets.telegramBotToken, chat = u.telegramChatId;
  if (tok && chat) { try { if (await sendTelegram(tok, chat, type, text)) await prisma.tokenAlerts.update({ where: { id: row.id }, data: { sentAt: new Date() } }); } catch (e) { console.error('telegram gagal', (e as Error).message); } }
}
