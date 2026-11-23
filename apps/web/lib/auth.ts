import { cookies } from 'next/headers';
import { verifySession, signSession } from '@att/core';
import { loadUser, type UserRuntime } from '@att/server';
const secret = () => { const s = process.env.SESSION_SECRET; if (!s || s.length < 16) throw new Error('SESSION_SECRET wajib (>=16 karakter)'); return s; };
export const COOKIE = 'att_session';
export function setSession(userId: string) { cookies().set(COOKIE, signSession(userId, secret()), { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 7 * 86400 }); }
export function clearSession() { cookies().delete(COOKIE); }
export function currentUserId(): string | null { return verifySession(cookies().get(COOKIE)?.value, secret()); }
export async function requireUser(): Promise<UserRuntime> { const id = currentUserId(); if (!id) throw new HttpError(401, 'Belum login'); const u = await loadUser(id); if (!u) throw new HttpError(401, 'Pengguna tidak ditemukan'); return u; }
export class HttpError extends Error { constructor(public status: number, m: string) { super(m); } }
export function handle(fn: (req: Request, ctx: any) => Promise<Response | unknown>) {
  return async (req: Request, ctx: any) => {
    try { const r = await fn(req, ctx); return r instanceof Response ? r : Response.json(r ?? { ok: true }); }
    catch (e: any) { const status = e instanceof HttpError ? e.status : 500; if (status === 500) console.error(e); return Response.json({ error: status === 500 ? 'Kesalahan server: ' + String(e.message).slice(0, 200) : e.message }, { status }); }
  };
}
