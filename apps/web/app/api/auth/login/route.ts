import { verifyPassword } from '@att/core';
import { prisma } from '@att/server';
import { handle, setSession, HttpError } from '@/lib/auth';
const fails = new Map<string, { n: number; at: number }>();
export const POST = handle(async (req) => {
  const { email, password } = await req.json(); const k = String(email).toLowerCase();
  const f = fails.get(k); if (f && f.n >= 5 && Date.now() - f.at < 15 * 60000) throw new HttpError(429, 'Terlalu banyak percobaan, coba lagi 15 menit');
  const u = await prisma.user.findUnique({ where: { email: k } });
  if (!u || !verifyPassword(String(password), u.passwordHash)) { fails.set(k, { n: (f?.n ?? 0) + 1, at: Date.now() }); throw new HttpError(401, 'Email atau password salah'); }
  fails.delete(k); setSession(u.id); return { ok: true };
});
