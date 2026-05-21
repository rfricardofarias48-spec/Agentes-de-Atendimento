/**
 * POST /api/webhooks/chatwoot
 * Recebe eventos do Chatwoot para todas as contas (shared instance).
 *
 * Eventos tratados:
 *  - message_created (message_type=0, incoming) → chama agente Bento
 *  - conversation_status_changed (resolved)     → reseta escalated_to_human
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from '../_lib/supabaseAdmin.js';
import { processBentoMessage } from '../_services/recruitmentService.js';
import { sendText } from '../_services/evolutionService.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Responde 200 imediatamente para o Chatwoot não re-tentar
  res.status(200).json({ received: true });

  try {
    const payload = req.body as Record<string, unknown>;
    const event = String(payload.event || '');
    const account = payload.account as { id?: number } | undefined;
    const conversation = payload.conversation as {
      id?: number;
      status?: string;
      meta?: { sender?: { phone_number?: string; name?: string } };
      contact_inbox?: { source_id?: string };
    } | undefined;
    const message = payload.message as {
      id?: number;
      content?: string;
      message_type?: number; // 0=incoming 1=outgoing 2=activity
      private?: boolean;
    } | undefined;

    console.log(`[Webhook/Chatwoot] event="${event}" account=${account?.id} conv=${conversation?.id}`);

    // ── Mensagem recebida do candidato → acionar agente ──────────────────
    if (event === 'message_created') {
      // Ignora mensagens de saída (agente), privadas e sem conteúdo
      if (!message || message.message_type !== 0 || message.private) return;

      const text = (message.content || '').trim();
      if (!text) return;

      const accountId = account?.id;
      if (!accountId) return;

      // Extrai telefone do contato
      const rawPhone =
        conversation?.meta?.sender?.phone_number ||
        conversation?.contact_inbox?.source_id?.replace(/@.*$/, '');

      if (!rawPhone) {
        console.warn('[Webhook/Chatwoot] Telefone não encontrado no payload');
        return;
      }

      const phone = rawPhone.replace(/^\+/, '').replace(/\D/g, '');
      const pushName = conversation?.meta?.sender?.name || '';

      // Busca org pela conta Chatwoot
      const { data: org } = await supabaseAdmin
        .from('organizations')
        .select('id, name, evolution_instance, evolution_token')
        .eq('chatwoot_account_id', accountId)
        .in('status', ['active', 'trial'])
        .maybeSingle();

      if (!org?.evolution_instance) {
        console.warn(`[Webhook/Chatwoot] Org não encontrada para account_id=${accountId}`);
        return;
      }

      console.log(`[Webhook/Chatwoot] Bento processando: phone=${phone} org="${org.name}"`);

      const reply = await processBentoMessage({ phone, orgId: org.id, pushName, text });
      await sendText(org.evolution_instance, phone, reply, org.evolution_token);
      return;
    }

    // ── Conversa resolvida → reseta escalated_to_human ───────────────────
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
