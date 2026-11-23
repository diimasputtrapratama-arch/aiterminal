import { hashPassword } from '@att/core';
import { prisma } from '@att/server';
import { handle, setSession, HttpError } from '@/lib/auth';
export const POST = handle(async (req) => {
  if (process.env.ALLOW_REGISTER === 'false') throw new HttpError(403, 'Pendaftaran ditutup');
  const { email, password, timezone } = await req.json();
  if (typeof email !== 'string' || !/^\S+@\S+\.\S+$/.test(email)) throw new HttpError(400, 'Email tidak valid');
  if (typeof password !== 'string' || password.length < 10) throw new HttpError(400, 'Password minimal 10 karakter');
  try { new Intl.DateTimeFormat('en', { timeZone: timezone }); } catch { throw new HttpError(400, 'Zona waktu tidak valid'); }
  if (await prisma.user.findUnique({ where: { email: email.toLowerCase() } })) throw new HttpError(409, 'Email sudah terdaftar');
  const u = await prisma.user.create({ data: { email: email.toLowerCase(), passwordHash: hashPassword(password), timezone } });
  setSession(u.id); return { ok: true };
});
