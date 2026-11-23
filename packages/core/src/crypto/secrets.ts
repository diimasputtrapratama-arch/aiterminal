import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const key = (master: string) => createHash('sha256').update(master).digest();

/** AES-256-GCM. Format: v1.iv.tag.cipher (base64url). */
export function encryptSecret(plain: string, master: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(master), iv);
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return ['v1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), enc.toString('base64url')].join('.');
}
export function decryptSecret(token: string, master: string): string {
  const [v, iv, tag, enc] = token.split('.');
  if (v !== 'v1') throw new Error('Format rahasia tidak dikenal');
  const d = createDecipheriv('aes-256-gcm', key(master), Buffer.from(iv, 'base64url'));
  d.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([d.update(Buffer.from(enc, 'base64url')), d.final()]).toString('utf8');
}
export function hashPassword(pw: string): string {
  const salt = randomBytes(16);
  return `s1.${salt.toString('base64url')}.${scryptSync(pw, salt, 64).toString('base64url')}`;
}
export function verifyPassword(pw: string, stored: string): boolean {
  const [v, salt, hash] = stored.split('.');
  if (v !== 's1') return false;
  const a = scryptSync(pw, Buffer.from(salt, 'base64url'), 64);
  const b = Buffer.from(hash, 'base64url');
  return a.length === b.length && timingSafeEqual(a, b);
}
export function signSession(userId: string, secret: string, ttlMs = 7 * 864e5): string {
  const body = `${userId}.${Date.now() + ttlMs}`;
  return `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`;
}
export function verifySession(tok: string | undefined, secret: string): string | null {
  if (!tok) return null;
  const p = tok.split('.');
  if (p.length !== 3) return null;
  const body = `${p[0]}.${p[1]}`;
  const exp = createHmac('sha256', secret).update(body).digest('base64url');
  if (exp.length !== p[2].length || !timingSafeEqual(Buffer.from(exp), Buffer.from(p[2]))) return null;
  return Number(p[1]) > Date.now() ? p[0] : null;
}
