/**
 * Webhook Evolution — AgenteClin + Recrutamento
 * POST /api/webhook/evolution
 *
 * Recebe eventos da Evolution API v2, identifica a organização
 * pelo instanceName e processa via agente GPT.
 *
 * Fluxo de recrutamento:
 *  - Texto com 6 dígitos → handleJobCode (candidato informando código da vaga)
 *  - Documento PDF       → handleCvMessage (candidato enviando currículo)
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { cleanPhone } from '../_services/evolutionService.js';
import { getOrgByInstance, processMessage, processProMessage } from '../_services/agentService.js';
import { handleJobCode, handleCvMessage, getSession, processBentoMessage } from '../_services/recruitmentService.js';
import { sendText } from '../_services/evolutionService.js';

const DOCUMENT_TYPES = ['documentMessage', 'documentWithCaptionMessage'];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // Responde 200 imediatamente para o Evolution não re-tentar
  res.status(200).json({ received: true });

  try {
    const payload = req.body as Record<string, unknown>;

    const eventName    = String(payload.event || '').toLowerCase().replace(/_/g, '.');
    const instanceName = String(payload.instanceName || payload.instance || '');
    const data         = payload.data as Record<string, unknown> | undefined;

    console.log(`[Webhook/Evolution] event="${eventName}" instance="${instanceName}"`);

    // Só processa eventos de mensagem
    const isMessage = eventName === 'message' || eventName.includes('messages.upsert');
    if (!isMessage || !data || !instanceName) return;

    // ── Normaliza payload ──
    const key        = data.key as Record<string, unknown> | undefined;
    const remoteJid  = String(key?.remoteJid || data.remoteJid || '');
    const fromMe     = key?.fromMe === true || data.fromMe === true;
    const pushName   = String(data.pushName || '');
    const messageType = String(data.messageType || '');
    const message    = (data.message as Record<string, unknown>) || {};

    // Ignora: próprias mensagens, grupos, status
    if (!remoteJid || fromMe || remoteJid.endsWith('@g.us') || remoteJid.includes('status')) return;

    const phone = cleanPhone(remoteJid);

    // Busca organização pelo nome da instância
    const ctx = await getOrgByInstance(instanceName);
    if (!ctx) {
      console.warn(`[Webhook/Evolution] No active org found for instance="${instanceName}"`);
      return;
    }

    const orgId = ctx.org.id;
    const instanceToken = ctx.org.evolution_token || undefined;

    // ── Documento → pipeline de recrutamento ──────────────────────────────────
    if (DOCUMENT_TYPES.includes(messageType)) {
      console.log(`[Webhook/Evolution] Documento recebido de ${phone}, org="${ctx.org.name}"`);

      // Detecta mimetype e base64 embutido
      let mimeType = 'application/pdf';
      let embeddedBase64: string | undefined;

      const docMsg = message.documentMessage as Record<string, unknown> | undefined;
      const dwcMsg = message.documentWithCaptionMessage as Record<string, unknown> | undefined;

      if (docMsg) {
        mimeType = String(docMsg.mimetype || mimeType);
        if (docMsg.base64) embeddedBase64 = String(docMsg.base64);
      } else if (dwcMsg) {
        const inner = (dwcMsg.message as Record<string, unknown> | undefined)
          ?.documentMessage as Record<string, unknown> | undefined;
        mimeType = String(inner?.mimetype || dwcMsg.mimetype || mimeType);
        if (inner?.base64) embeddedBase64 = String(inner.base64);
        else if (dwcMsg.base64) embeddedBase64 = String(dwcMsg.base64);
      }

      const reply = await handleCvMessage({
        phone,
        orgId,
        instanceName,
        instanceToken,
        messageKey:     key as Record<string, unknown>,
        message,
        mimeType,
        embeddedBase64,
      });

      await sendText(instanceName, phone, reply, instanceToken);
      return;
    }

    // ── Extrai texto da mensagem ───────────────────────────────────────────────
    let text = '';
    if (messageType === 'conversation') {
      text = String(message.conversation || '');
    } else if (messageType === 'extendedTextMessage') {
      const ext = message.extendedTextMessage as Record<string, unknown> | undefined;
      text = String(ext?.text || '');
    } else if (messageType === 'listResponseMessage') {
      const lr = message.listResponseMessage as Record<string, unknown> | undefined;
      text = String(lr?.title || '');
    }

    const trimmed = text.trim();
    if (!trimmed) {
      console.log(`[Webhook/Evolution] Skipped: no text, type="${messageType}"`);
      return;
    }

    // ── Código de vaga (6 dígitos) → pipeline de recrutamento ─────────────────
    if (/^\d{6}$/.test(trimmed)) {
      console.log(`[Webhook/Evolution] Código de vaga "${trimmed}" de ${phone}, org="${ctx.org.name}"`);
      const reply = await handleJobCode({ phone, orgId, code: trimmed });
      await sendText(instanceName, phone, reply, instanceToken);
      return;
    }

    // ── Candidato enviando texto enquanto aguarda PDF ──────────────────────────
    // (sessão ativa) — lembra o candidato de enviar o PDF
    const session = await getSession(phone, orgId);
    if (session?.state === 'awaiting_cv') {
      await sendText(instanceName, phone,
        '📄 Estamos aguardando seu currículo em formato *PDF*. Por favor, envie o arquivo para prosseguir.',
        instanceToken,
      );
      return;
    }

    // ── Mensagem normal → Bento (agente de recrutamento) ─────────────────────
    console.log(`[Webhook/Evolution] Bento processing org="${ctx.org.name}" phone="${phone}"`);

    const reply = await processBentoMessage({ phone, orgId, pushName, text: trimmed });
    await sendText(instanceName, phone, reply, instanceToken);
  } catch (err) {
    console.error('[Webhook/Evolution] Error:', err);
  }
}
