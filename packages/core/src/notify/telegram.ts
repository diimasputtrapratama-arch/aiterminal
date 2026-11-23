export type AlertType = 'NEW_TOKEN' | 'HIGH_POTENTIAL' | 'SUSPICIOUS' | 'WHALE_BUY' | 'WHALE_SELL' | 'LIQUIDITY_REMOVED' | 'ABNORMAL_VOLUME' | 'AI_ENTRY' | 'AUTO_BUY' | 'TP_HIT' | 'SL_HIT' | 'DAILY_REPORT' | 'MONTHLY_REPORT' | 'MAX_DAILY_LOSS';
const ICON: Record<AlertType, string> = { NEW_TOKEN: '🆕', HIGH_POTENTIAL: '🚀', SUSPICIOUS: '⚠️', WHALE_BUY: '🐋', WHALE_SELL: '🐋', LIQUIDITY_REMOVED: '🚨', ABNORMAL_VOLUME: '📈', AI_ENTRY: '🤖', AUTO_BUY: '✅', TP_HIT: '🎯', SL_HIT: '🛑', DAILY_REPORT: '📊', MONTHLY_REPORT: '🗓️', MAX_DAILY_LOSS: '⛔' };
export async function sendTelegram(token: string, chatId: string, type: AlertType, text: string): Promise<boolean> {
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, text: `${ICON[type]} ${type}\n${text}`.slice(0, 4000), disable_web_page_preview: true }) });
  return r.ok;
}
