import { handle, clearSession } from '@/lib/auth';
export const POST = handle(async () => { clearSession(); return { ok: true }; });
