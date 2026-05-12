/**
 * Mem0 Service — AgenteClin
 * Memória persistente por paciente, por organização.
 */

const MEM0_URL = (process.env.MEM0_API_URL || '').replace(/\/$/, '');
const MEM0_KEY = process.env.MEM0_API_KEY || '';

function headers() {
  return {
    'Content-Type': 'application/json',
    ...(MEM0_KEY ? { Authorization: `Bearer ${MEM0_KEY}` } : {}),
  };
}

/** Busca memórias relevantes de um paciente para uma mensagem */
export async function searchMemory(
  userId: string,
  query: string,
  limit = 5,
): Promise<string[]> {
  if (!MEM0_URL) return [];
  try {
    const res = await fetch(`${MEM0_URL}/search`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ query, filters: { user_id: userId }, limit }),
    });
    if (!res.ok) return [];
    const data = await res.json() as { results?: Array<{ memory: string }> };
    return (data.results || []).map(r => r.memory);
  } catch {
    return [];
  }
}

/** Adiciona ou atualiza memórias de um paciente */
export async function addMemory(
  userId: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
): Promise<void> {
  if (!MEM0_URL) return;
  try {
    await fetch(`${MEM0_URL}/memories`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ messages, user_id: userId }),
    });
  } catch { /* best-effort */ }
}

/** Retorna todas as memórias de um paciente */
export async function getMemories(userId: string): Promise<string[]> {
  if (!MEM0_URL) return [];
  try {
    const res = await fetch(`${MEM0_URL}/memories?user_id=${encodeURIComponent(userId)}`, {
      headers: headers(),
    });
    if (!res.ok) return [];
    const data = await res.json() as { results?: Array<{ memory: string }> };
    return (data.results || []).map(r => r.memory);
  } catch {
    return [];
  }
}
