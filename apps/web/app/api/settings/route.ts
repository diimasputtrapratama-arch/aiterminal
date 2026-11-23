import { settingsView, saveSettings, SECRET_KEYS, type UserConfig } from '@att/server';
import { validateTpSl } from '@att/core';
import { handle, requireUser, HttpError } from '@/lib/auth';
export const GET = handle(async () => { const u = await requireUser(); return settingsView(u.userId); });
export const PUT = handle(async (req) => {
  const u = await requireUser(); const b = await req.json();
  const c: Partial<UserConfig> = b.config ?? {};
  if (c.tpsl) { const e = validateTpSl(c.tpsl); if (e.length) throw new HttpError(400, 'TP/SL tidak valid: ' + e.join(', ')); }
  if (c.tradingMode === 'live' && c.autoTrade) { /* diizinkan, tetap dijaga ALLOW_LIVE di worker */ }
  if (c.sizePctOfEquity !== undefined && !(c.sizePctOfEquity > 0 && c.sizePctOfEquity <= 10)) throw new HttpError(400, 'sizePctOfEquity 0-10');
  const secrets: Record<string, string> = {}; for (const k of SECRET_KEYS) if (typeof b.secrets?.[k] === 'string') secrets[k] = b.secrets[k];
  await saveSettings(u.userId, { secrets, config: c, timezone: b.timezone }); return { ok: true };
});
