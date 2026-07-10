/**
 * Webhook WhatsApp — API oficial da Meta (Cloud API)
 * GET  /api/webhook/whatsapp-official   Handshake de verificação da Meta
 * POST /api/webhook/whatsapp-official   Mensagens recebidas
 *
 * Espelha api/webhook/evolution.ts (mesma árvore de decisão: áudio →
 * transcreve e processa como texto; imagem com/sem legenda; documento/
 * vídeo/sticker), só adaptando o parsing pro formato de payload da Meta.
 *
 * Diferença estrutural importante: aqui não existe "instância por
 * cliente" — um único webhook recebe mensagens de TODOS os números
 * migrados pra API oficial, cada uma identificada por
 * value.metadata.phone_number_id. É por isso que a organização é
 * resolvida via getOrgByPhoneNumberId em vez de getOrgByInstance.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyWebhookToken, downloadMediaBase64 } from '../_services/metaWhatsappService.js';
import { sendWhatsAppText } from '../_services/whatsappService.js';
import { getOrgByPhoneNumberId, processMessage, processProMessage } from '../_services/agentService.js';
import { transcribeAudio } from '../_services/transcriptionService.js';

const MAX_AUDIO_BYTES = 20 * 1024 * 1024;
const MAX_TRANSCRIPT_CHARS = 1500;

const AUDIO_FAILURE_MSG    = 'Recebi seu áudio, mas não consegui ouvi-lo direitinho 😕 Pode me mandar por escrito, por favor?';
const AUDIO_TOO_LONG_MSG   = 'Recebi seu áudio, mas ele é longo demais pra eu processar 😕 Pode resumir por escrito, por favor?';
const INCAPACITY_MEDIA_MSG = 'Recebi seu arquivo! 📎 Por aqui eu consigo te ajudar por mensagem de texto ou áudio — me conta como posso ajudar?';

const MEDIA_NO_TEXT_TYPES = ['image', 'document', 'video', 'sticker'];

type OrgContext = NonNullable<Awaited<ReturnType<typeof getOrgByPhoneNumberId>>>;

interface MetaMessage {
  from: string;
  id: string;
  type: string;
  text?: { body?: string };
  audio?: { id: string; mime_type?: string };
  image?: { id: string; mime_type?: string; caption?: string };
  document?: { id: string; mime_type?: string; caption?: string };
  video?: { id: string; mime_type?: string };
  sticker?: { id: string; mime_type?: string };
}

interface MetaChangeValue {
  metadata?: { phone_number_id?: string };
  contacts?: { profile?: { name?: string } }[];
  messages?: MetaMessage[];
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // ── Handshake de verificação (configurado 1x no App da Meta) ──
  if (req.method === 'GET') {
    const mode      = req.query['hub.mode'] as string | undefined;
    const token     = req.query['hub.verify_token'] as string | undefined;
    const challenge = req.query['hub.challenge'] as string | undefined;

    if (verifyWebhookToken(mode, token)) {
      console.log('[Webhook/WhatsApp Oficial] Handshake de verificação OK');
      return res.status(200).send(challenge || '');
    }
    console.warn('[Webhook/WhatsApp Oficial] Handshake de verificação falhou');
    return res.status(403).json({ error: 'Verification failed' });
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // Responde 200 imediatamente para a Meta não re-tentar
  res.status(200).json({ received: true });

  try {
    const payload = req.body as { entry?: { changes?: { value?: MetaChangeValue; field?: string }[] }[] };
    const changes = payload.entry?.flatMap(e => e.changes ?? []) ?? [];

    for (const change of changes) {
      const value = change.value;
      const messages = value?.messages;
      if (!value || !messages?.length) continue; // ex.: evento de "statuses" (entregue/lido) — ignora

      const phoneNumberId = value.metadata?.phone_number_id;
      if (!phoneNumberId) continue;

      const ctx = await getOrgByPhoneNumberId(phoneNumberId);
      if (!ctx) {
        console.warn(`[Webhook/WhatsApp Oficial] Nenhuma org ativa pra phone_number_id="${phoneNumberId}"`);
        continue;
      }

      const pushName = value.contacts?.[0]?.profile?.name || '';

      for (const message of messages) {
        await handleMessage(ctx, message, pushName);
      }
    }
  } catch (err) {
    console.error('[Webhook/WhatsApp Oficial] Error:', err);
  }
}

async function handleMessage(ctx: OrgContext, message: MetaMessage, pushName: string): Promise<void> {
  const phone = message.from;

  // ── Áudio ──────────────────────────────────────────────────────────────
  if (message.type === 'audio' && message.audio) {
    console.log(`[Webhook/WhatsApp Oficial] Áudio recebido de ${phone}, org="${ctx.org.name}"`);

    const media = await downloadMediaBase64(message.audio.id);
    if (!media) {
      console.warn(`[Webhook/WhatsApp Oficial] Falha ao baixar áudio (org="${ctx.org.name}", phone=${phone})`);
      await sendWhatsAppText(ctx.org, phone, AUDIO_FAILURE_MSG);
      return;
    }

    const approxBytes = Math.floor((media.base64.length * 3) / 4);
    if (approxBytes > MAX_AUDIO_BYTES) {
      console.warn(`[Webhook/WhatsApp Oficial] Áudio muito grande (~${approxBytes} bytes) de ${phone}, org="${ctx.org.name}"`);
      await sendWhatsAppText(ctx.org, phone, AUDIO_TOO_LONG_MSG);
      return;
    }

    const transcript = await transcribeAudio(media.base64, media.mimetype || message.audio.mime_type || 'audio/ogg');
    if (!transcript) {
      console.warn(`[Webhook/WhatsApp Oficial] Falha ao transcrever áudio de ${phone}, org="${ctx.org.name}"`);
      await sendWhatsAppText(ctx.org, phone, AUDIO_FAILURE_MSG);
      return;
    }

    const truncated = transcript.length > MAX_TRANSCRIPT_CHARS
      ? transcript.slice(0, MAX_TRANSCRIPT_CHARS) + '…'
      : transcript;

    console.log(`[Webhook/WhatsApp Oficial] Áudio transcrito de ${phone}: "${truncated.slice(0, 80)}"`);
    await routeText(ctx, phone, truncated, pushName);
    return;
  }

  // ── Imagem / documento / vídeo / sticker — nunca termina em silêncio (exceto sticker) ──
  if (MEDIA_NO_TEXT_TYPES.includes(message.type)) {
    if (message.type === 'sticker') return; // sticker não é uma pergunta, ignora

    if (message.type === 'image') {
      const caption = (message.image?.caption || '').trim();
      if (caption) {
        await routeText(ctx, phone, caption, pushName);
        return;
      }
    }

    console.log(`[Webhook/WhatsApp Oficial] Mídia não processável (${message.type}) de ${phone}, org="${ctx.org.name}"`);
    await sendWhatsAppText(ctx.org, phone, INCAPACITY_MEDIA_MSG);
    return;
  }

  // ── Texto ──────────────────────────────────────────────────────────────
  const text = message.type === 'text' ? (message.text?.body || '').trim() : '';
  if (!text) {
    console.log(`[Webhook/WhatsApp Oficial] Skipped: sem texto, type="${message.type}"`);
    return;
  }

  console.log(`[Webhook/WhatsApp Oficial] Processing org="${ctx.org.name}" phone="${phone}"`);
  await routeText(ctx, phone, text, pushName);
}

/**
 * Encaminha um texto (digitado, transcrito de áudio, ou legenda de
 * imagem) pro fluxo normal do agente — mesma função que
 * api/webhook/evolution.ts usa, mantendo o comportamento idêntico
 * entre os dois canais (inclusive modo profissional).
 */
async function routeText(ctx: OrgContext, phone: string, text: string, pushName: string): Promise<void> {
  const notifPhone = ctx.settings.notification_phone?.replace(/\D/g, '') || '';
  if (notifPhone && phone === notifPhone) {
    await processProMessage(ctx.org, ctx.settings, phone, text);
    return;
  }
  await processMessage(ctx.org, ctx.settings, phone, text, pushName, ctx.professionals);
}
