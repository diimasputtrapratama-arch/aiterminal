export interface LlmConfig { apiKey: string; model: string }
export async function askClaude(cfg: LlmConfig, system: string, user: string, maxTokens = 900): Promise<string> {
  const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': cfg.apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: cfg.model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }) });
  if (!r.ok) throw new Error(`Anthropic HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j: any = await r.json();
  return (j.content ?? []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n');
}
export async function askClaudeJson<T>(cfg: LlmConfig, system: string, user: string): Promise<T> {
  const t = await askClaude(cfg, system + '\nBalas HANYA JSON valid tanpa markdown.', user, 1200);
  return JSON.parse(t.replace(/```json|```/g, '').trim()) as T;
}
