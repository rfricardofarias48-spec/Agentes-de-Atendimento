/**
 * POST /api/webhooks/chatwoot
 * Recebe eventos do Chatwoot para todas as contas (shared instance).
 *
 * IMPORTANTE: o payload do Chatwoot é FLAT — message_type, content, sender
 * ficam no nível raiz, NÃO dentro de um objeto "message".
 *
 * Eventos tratados:
 *  - message_created (incoming, contact)
 *      → texto  → processBentoMessage
 *      → PDF    → handleCvMessage (baixa de attachments[].data_url)
 *  - conversation_status_changed (resolved) → reseta escalated_to_human
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from '../_lib/supabaseAdmin.js';
import { processBentoMessage, handleCvMessage } from '../_services/recruitmentService.js';
import { sendText } from '../_services/evolutionService.js';

type ChatwootAttachment = {
  data_url?: string;
  file_type?: string;
  extension?: string;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const payload = req.body as Record<string, unknown>;

    const event       = String(payload.event || '');
    const rawMsgType  = payload.message_type;
    const isIncoming  = rawMsgType === 0 || rawMsgType === 'incoming';
    const msgContent  = String(payload.content || '').trim();
    const isPrivate   = payload.private as boolean | undefined;
    const sender      = payload.sender as { id?: number; name?: string; phone_number?: string; type?: string } | undefined;
    const sourceId    = String(payload.source_id || '');
    const account     = payload.account as { id?: number } | undefined;
    const conversation = payload.conversation as {
      id?: number;
      status?: string;
      meta?: { sender?: { phone_number?: string; name?: string } };
      contact_inbox?: { source_id?: string };
    } | undefined;
    const attachments = (payload.attachments as ChatwootAttachment[] | undefined) ?? [];

    // Detecta PDF nos anexos
    const pdfAttachment = attachments.find(
      a => a.extension === 'pdf' || (a.data_url ?? '').toLowerCase().includes('.pdf'),
    );
    const hasPdf  = !!pdfAttachment?.data_url;
    const hasText = !!msgContent;

    console.log(`[Webhook/Chatwoot] event="${event}" account=${account?.id} conv=${conversation?.id} msg_type=${rawMsgType} isIncoming=${isIncoming} sender_type=${sender?.type} hasPdf=${hasPdf} content="${msgContent.substring(0, 40)}"`);

    // ── Mensagem recebida do candidato ───────────────────────────────────────
    if (event === 'message_created') {
      const senderType       = sender?.type ?? '';
      const isContactMessage = !senderType || senderType === 'contact';

      // Ignora: saída, privada, bot/agente, sem texto nem PDF
      if (!isIncoming || isPrivate || !isContactMessage || (!hasText && !hasPdf)) {
        return res.status(200).json({ ok: true, skipped: true });
      }

      const accountId = account?.id;
      if (!accountId) return res.status(200).json({ ok: true, skipped: 'no accountId' });

      // Extrai telefone: sender.phone_number → source_id (JID) → conversation.meta
      const rawPhone =
        sender?.phone_number ||
        (sourceId ? sourceId.replace(/@.*$/, '') : undefined) ||
        conversation?.meta?.sender?.phone_number ||
        conversation?.contact_inbox?.source_id?.replace(/@.*$/, '');

      console.log(`[Webhook/Chatwoot] sender.phone=${sender?.phone_number} source_id=${sourceId} rawPhone=${rawPhone}`);

      if (!rawPhone) {
        console.warn('[Webhook/Chatwoot] Telefone não encontrado no payload');
        return res.status(200).json({ ok: true, skipped: 'no phone' });
      }

      const phone = rawPhone.replace(/^\+/, '').replace(/\D/g, '');

      // Rejeita números inválidos — telefones reais têm ≥ 10 dígitos
      if (phone.length < 10) {
        console.warn(`[Webhook/Chatwoot] Telefone inválido ignorado: "${phone}" (sender.type=${sender?.type})`);
        return res.status(200).json({ ok: true, skipped: 'invalid phone' });
      }

      const pushName = sender?.name || conversation?.meta?.sender?.name || '';

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

      // ── PDF recebido → pipeline de recrutamento ────────────────────────────
      if (hasPdf) {
        const dataUrl = pdfAttachment!.data_url!;
        console.log(`[Webhook/Chatwoot] PDF recebido → phone=${phone} org="${org.name}" url="${dataUrl.substring(0, 60)}"`);

        try {
          const pdfRes = await fetch(dataUrl);
          if (!pdfRes.ok) {
            console.error(`[Webhook/Chatwoot] Falha ao baixar PDF: HTTP ${pdfRes.status}`);
            await sendText(org.evolution_instance, phone,
              '❌ Não consegui abrir o arquivo. Por favor, envie novamente em formato *PDF*.',
              org.evolution_token,
            );
            return res.status(200).json({ ok: true });
          }

          const buffer     = Buffer.from(await pdfRes.arrayBuffer());
          const base64     = buffer.toString('base64');

          console.log(`[Webhook/Chatwoot] PDF baixado, ${buffer.length} bytes → chamando handleCvMessage`);

          const cvReply = await handleCvMessage({
            phone,
            orgId:          org.id,
            instanceName:   org.evolution_instance,
            instanceToken:  org.evolution_token,
            messageKey:     {},
            message:        {},
            mimeType:       'application/pdf',
            embeddedBase64: base64,
          });

          console.log(`[Webhook/Chatwoot] CV reply="${cvReply.substring(0, 80)}"`);
          await sendText(org.evolution_instance, phone, cvReply, org.evolution_token);
        } catch (pdfErr) {
          console.error('[Webhook/Chatwoot] Erro ao processar PDF:', pdfErr);
          await sendText(org.evolution_instance, phone,
            '⚠️ Erro ao processar currículo. Tente enviar novamente em alguns instantes.',
            org.evolution_token,
          );
        }

        return res.status(200).json({ ok: true });
      }

      // ── Texto → agente Bento ───────────────────────────────────────────────
      console.log(`[Webhook/Chatwoot] Bento → phone=${phone} org="${org.name}" text="${msgContent.substring(0, 40)}"`);

      const reply = await processBentoMessage({ phone, orgId: org.id, pushName, text: msgContent });
      console.log(`[Webhook/Chatwoot] reply="${reply.substring(0, 80)}"`);
      await sendText(org.evolution_instance, phone, reply, org.evolution_token);

      return res.status(200).json({ ok: true });
    }

    // ── Conversa resolvida → reseta escalated_to_human ───────────────────────
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

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[Webhook/Chatwoot] Erro ao processar evento:', err);
    return res.status(200).json({ ok: true });
  }
}
