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

  try {
    const payload = req.body as Record<string, unknown>;
    const event = String(payload.event || '');
    const account = payload.account as { id?: number } | undefined;
    const conversation = payload.conversation as Record<string, unknown> | undefined;
    const message = payload.message as {
      id?: number;
      content?: string;
      message_type?: number; // 0=incoming 1=outgoing 2=activity
      private?: boolean;
    } | undefined;

    console.log(`[Webhook/Chatwoot] event="${event}" account=${account?.id} conv=${(conversation?.id as number | undefined)}`);

    // ── Mensagem recebida do candidato → acionar agente ──────────────────
    if (event === 'message_created') {
      const msgType = message?.message_type;
      const msgContent = (message?.content || '').trim();
      // Log completo para diagnóstico
      console.log(`[Webhook/Chatwoot] payload_keys=${Object.keys(payload).join(',')}`);
      console.log(`[Webhook/Chatwoot] message_raw=${JSON.stringify(message ?? null).substring(0, 300)}`);
      console.log(`[Webhook/Chatwoot] message_type=${msgType} private=${message?.private} content="${msgContent.substring(0, 50)}"`);

      // Ignora mensagens de saída (agente), privadas e sem conteúdo
      if (!message || msgType !== 0 || message.private || !msgContent) {
        return res.status(200).json({ ok: true, skipped: true });
      }

      const accountId = account?.id;
      if (!accountId) return res.status(200).json({ ok: true, skipped: 'no accountId' });

      // Extrai telefone: tenta meta.sender.phone_number, depois contact_inbox.source_id
      const meta = conversation?.meta as { sender?: { phone_number?: string; name?: string } } | undefined;
      const contactInbox = conversation?.contact_inbox as { source_id?: string } | undefined;

      console.log(`[Webhook/Chatwoot] meta.sender.phone=${meta?.sender?.phone_number} contact_inbox.source=${contactInbox?.source_id}`);

      const rawPhone =
        meta?.sender?.phone_number ||
        contactInbox?.source_id?.replace(/@.*$/, '');

      if (!rawPhone) {
        console.warn('[Webhook/Chatwoot] Telefone não encontrado no payload');
        return res.status(200).json({ ok: true, skipped: 'no phone' });
      }

      const phone = rawPhone.replace(/^\+/, '').replace(/\D/g, '');
      const pushName = meta?.sender?.name || '';

      // Busca org pela conta Chatwoot
      const { data: org } = await supabaseAdmin
        .from('organizations')
        .select('id, name, evolution_instance, evolution_token')
        .eq('chatwoot_account_id', accountId)
        .in('status', ['active', 'trial'])
        .maybeSingle();

      if (!org?.evolution_instance) {
        console.warn(`[Webhook/Chatwoot] Org não encontrada para account_id=${accountId}`);
        return res.status(200).json({ ok: true, skipped: 'no org' });
      }

      console.log(`[Webhook/Chatwoot] Bento processando: phone=${phone} org="${org.name}"`);

      const reply = await processBentoMessage({ phone, orgId: org.id, pushName, text: msgContent });
      console.log(`[Webhook/Chatwoot] Bento reply="${reply.substring(0, 80)}"`);
      await sendText(org.evolution_instance, phone, reply, org.evolution_token);

      return res.status(200).json({ ok: true });
    }

    // ── Conversa resolvida → reseta escalated_to_human ───────────────────
    if (
      event === 'conversation_status_changed' &&
      (conversation?.status as string | undefined) === 'resolved' &&
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

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[Webhook/Chatwoot] Erro ao processar evento:', err);
    return res.status(200).json({ ok: true });
  }
}
