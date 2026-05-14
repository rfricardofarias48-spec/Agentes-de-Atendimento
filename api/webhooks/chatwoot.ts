/**
 * POST /api/webhooks/chatwoot
 * Recebe eventos do Chatwoot para todas as contas (shared instance).
 *
 * Eventos tratados:
 *  - conversation_status_changed (resolved) → reseta escalated_to_human no banco
 *
 * Nota: respostas de agentes do Chatwoot chegam ao WhatsApp via integração
 * nativa Evolution ↔ Chatwoot — não requer processamento aqui.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from '../_lib/supabaseAdmin.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Responde 200 imediatamente para o Chatwoot não re-tentar
  res.status(200).json({ received: true });

  try {
    const payload = req.body as Record<string, unknown>;
    const event = String(payload.event || '');
    const account = payload.account as { id?: number } | undefined;
    const conversation = payload.conversation as { id?: number; status?: string } | undefined;

    console.log(`[Webhook/Chatwoot] event="${event}" account=${account?.id} conv=${conversation?.id}`);

    if (
      event === 'conversation_status_changed' &&
      conversation?.status === 'resolved' &&
      conversation?.id
    ) {
      const chatwootConvId = String(conversation.id);

      const { error } = await supabaseAdmin
        .from('conversations')
        .update({ escalated_to_human: false })
        .eq('chatwoot_conversation_id', chatwootConvId);

      if (error) {
        console.error(`[Webhook/Chatwoot] Erro ao resetar escalation conv=${chatwootConvId}:`, error.message);
      } else {
        console.log(`[Webhook/Chatwoot] Conversa ${chatwootConvId} resolvida — escalated_to_human resetado`);
      }
    }
  } catch (err) {
    console.error('[Webhook/Chatwoot] Erro ao processar evento:', err);
  }
}
