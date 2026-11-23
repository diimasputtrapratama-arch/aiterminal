import { decryptSecret, encryptSecret, DEFAULT_TPSL, type TpSlConfig, type Mode, type HardLimits, type LlmConfig } from '@att/core';
import { prisma } from './db';

const master = () => { const m = process.env.MASTER_KEY; if (!m || m.length < 16) throw new Error('MASTER_KEY wajib (>=16 karakter)'); return m; };
/** Semua kredensial yang diisi lewat dashboard (disimpan terenkripsi). */
export const SECRET_KEYS = ['rpcUrl', 'wsUrl', 'heliusApiKey', 'jupiterApiKey', 'anthropicKey', 'telegramBotToken', 'telegramChatId', 'xBearerToken', 'walletPrivateKey'] as const;
export type SecretKey = (typeof SECRET_KEYS)[number];

export interface UserConfig {
  mode: Mode; limits: Partial<HardLimits>; tpsl: TpSlConfig; autoTrade: boolean; tradingMode: 'paper' | 'live';
  sizePctOfEquity: number; maxTradesPerDay: number; filters: Record<string, any>; alerts: Record<string, boolean>; model: string;
  deepBundleScan: boolean; useDas: boolean; jupiterBase?: string; scannerEnabled: boolean; killSwitch?: boolean; activeStrategyId?: string;
}
export const DEFAULT_CONFIG: UserConfig = { mode: 'BALANCED', limits: {}, tpsl: DEFAULT_TPSL, autoTrade: false, tradingMode: 'paper', sizePctOfEquity: 1, maxTradesPerDay: 30, filters: {}, alerts: {}, model: 'claude-sonnet-5-5', deepBundleScan: false, useDas: false, scannerEnabled: true };
export interface UserRuntime { userId: string; tz: string; telegramChatId?: string; secrets: Partial<Record<SecretKey, string>>; cfg: UserConfig; llm?: LlmConfig }

export function toRuntime(u: { id: string; timezone: string; telegramChatId: string | null; settings: { secrets: unknown; config: unknown } | null }): UserRuntime {
  const secrets: UserRuntime['secrets'] = {};
  for (const [k, v] of Object.entries((u.settings?.secrets as Record<string, string>) ?? {})) { try { secrets[k as SecretKey] = decryptSecret(v, master()); } catch { /* rusak: abaikan */ } }
  const cfg = { ...DEFAULT_CONFIG, ...((u.settings?.config as object) ?? {}) } as UserConfig;
  return { userId: u.id, tz: u.timezone, telegramChatId: u.telegramChatId ?? secrets.telegramChatId, secrets, cfg, llm: secrets.anthropicKey ? { apiKey: secrets.anthropicKey, model: cfg.model } : undefined };
}
export async function loadUser(userId: string): Promise<UserRuntime | null> {
  const u = await prisma.user.findUnique({ where: { id: userId }, include: { settings: true } }); return u ? toRuntime(u) : null;
}
export async function loadAllUsers(): Promise<UserRuntime[]> {
  return (await prisma.user.findMany({ include: { settings: true } })).map(toRuntime);
}
/** Simpan: secret kosong = tidak berubah; string '__DELETE__' = hapus. */
export async function saveSettings(userId: string, patch: { secrets?: Partial<Record<SecretKey, string>>; config?: Partial<UserConfig>; timezone?: string }) {
  const cur = await prisma.userSettings.findUnique({ where: { userId } });
  const secrets = { ...((cur?.secrets as Record<string, string>) ?? {}) };
  for (const [k, v] of Object.entries(patch.secrets ?? {})) {
    if (!(SECRET_KEYS as readonly string[]).includes(k) || typeof v !== 'string' || v === '') continue;
    if (v === '__DELETE__') delete secrets[k]; else secrets[k] = encryptSecret(v.trim(), master());
  }
  const config = { ...((cur?.config as object) ?? {}), ...(patch.config ?? {}) };
  await prisma.userSettings.upsert({ where: { userId }, create: { userId, secrets, config }, update: { secrets, config } });
  if (patch.timezone) await prisma.user.update({ where: { id: userId }, data: { timezone: patch.timezone } });
}
/** Kembalikan HANYA status terisi/tidak (tidak pernah nilai rahasia) ke dashboard. */
export async function settingsView(userId: string) {
  const u = await prisma.user.findUnique({ where: { id: userId }, include: { settings: true } }); if (!u) return null;
  const sec = Object.keys((u.settings?.secrets as object) ?? {});
  return { timezone: u.timezone, secretsSet: Object.fromEntries(SECRET_KEYS.map((k) => [k, sec.includes(k)])), config: { ...DEFAULT_CONFIG, ...((u.settings?.config as object) ?? {}) } as UserConfig };
}
