import { prisma } from '@att/server';
import { handle, requireUser, HttpError } from '@/lib/auth';
import { translate, applyInstructions } from '@/lib/instructions';
const KINDS = ['ANALYSIS', 'STRATEGY', 'RISK', 'EXECUTION_PERMISSION'];
export const GET = handle(async () => { const u = await requireUser(); return { items: await prisma.aIInstructions.findMany({ where: { userId: u.userId }, orderBy: { updatedAt: 'desc' } }) }; });
export const POST = handle(async (req) => {
  const u = await requireUser(); const b = await req.json();
  if (b.action === 'apply') return { applied: await applyInstructions(u) };
  if (!KINDS.includes(b.kind) || typeof b.text !== 'string' || b.text.trim().length < 3 || b.text.length > 2000) throw new HttpError(400, 'Instruksi tidak valid');
  const parsed = await translate(b.text, b.kind, u.llm);
  const row = await prisma.aIInstructions.create({ data: { userId: u.userId, kind: b.kind, text: b.text.trim(), parsedParams: parsed as any } }); return { item: row, parsed };
});
export const PUT = handle(async (req) => {
  const u = await requireUser(); const b = await req.json(); const cur = await prisma.aIInstructions.findFirst({ where: { id: b.id, userId: u.userId } }); if (!cur) throw new HttpError(404, 'Tidak ditemukan');
  const text = typeof b.text === 'string' ? b.text.trim() : cur.text; const parsed = b.text ? await translate(text, cur.kind as any, u.llm) : cur.parsedParams;
  return { item: await prisma.aIInstructions.update({ where: { id: cur.id }, data: { text, parsedParams: parsed as any, active: b.active ?? cur.active } }) };
});
export const DELETE = handle(async (req) => { const u = await requireUser(); const { id } = await req.json(); await prisma.aIInstructions.deleteMany({ where: { id, userId: u.userId } }); return { ok: true }; });
