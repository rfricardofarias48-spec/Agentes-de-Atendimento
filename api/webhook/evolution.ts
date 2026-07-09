/**
 * Webhook Evolution — AgenteClin
 * POST /api/webhook/evolution
 *
 * Recebe eventos da Evolution API v2, identifica a organização
 * pelo instanceName e processa via agente GPT.
 *
 * Tipos de mensagem tratados:
 *  - Texto (conversation/extendedTextMessage/listResponseMessage) → processa direto
 *  - Áudio (audioMessage, inclui voz/PTT)                          → transcreve (Whisper) e processa como texto
 *  - Imagem com legenda                                            → processa a legenda como texto, ignora a imagem
 *  - Imagem sem legenda / documento / vídeo                        → resposta educada de incapacidade (nunca silêncio)
 *  - Sticker                                                       → ignora em silêncio (não é uma pergunta)
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { cleanPhone, sendText, getMediaBase64 } from '../_services/evolutionService.js';
import { getOrgByInstance, processMessage, processProMessage } from '../_services/agentService.js';
import { transcribeAudio } from '../_services/transcriptionService.js';

const MAX_AUDIO_BYTES = 20 * 1024 * 1024;   // 20 MB — áudios de WhatsApp (até ~5min) ficam bem abaixo disso
const MAX_TRANSCRIPT_CHARS = 1500;          // evita que um áudio longo vire um prompt gigante

const AUDIO_FAILURE_MSG   = 'Recebi seu áudio, mas não consegui ouvi-lo direitinho 😕 Pode me mandar por escrito, por favor?';
const AUDIO_TOO_LONG_MSG  = 'Recebi seu áudio, mas ele é longo demais pra eu processar 😕 Pode resumir por escrito, por favor?';
const INCAPACITY_MEDIA_MSG = 'Recebi seu arquivo! 📎 Por aqui eu consigo te ajudar por mensagem de texto ou áudio — me conta como posso ajudar?';

const MEDIA_NO_TEXT_TYPES = ['imageMessage', 'documentMessage', 'videoMessage', 'stickerMessage'];

type OrgContext = NonNullable<Awaited<ReturnType<typeof getOrgByInstance>>>;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // Responde 200 imediatamente para o Evolution não re-tentar
  res.status(200).json({ received: true });

  try {
    const payload = req.body as Record<string, unknown>;

    const eventName = String(payload.event || '').toLowerCase().replace(/_/g, '.');
    const instanceName = String(payload.instanceName || payload.instance || '');
    const data = payload.data as Record<string, unknown> | undefined;

    console.log(`[Webhook/Evolution] event="${eventName}" instance="${instanceName}"`);

    // Só processa eventos de mensagem
    const isMessage = eventName === 'message' || eventName.includes('messages.upsert');
    if (!isMessage || !data || !instanceName) return;

    // ── Normaliza payload ──
    const key = data.key as Record<string, unknown> | undefined;
    const remoteJid = String(key?.remoteJid || data.remoteJid || '');
    const fromMe = key?.fromMe === true || data.fromMe === true;
    const pushName = String(data.pushName || '');
    const messageType = String(data.messageType || '');
    const message = (data.message as Record<string, unknown>) || {};

    // Ignora: próprias mensagens, grupos, status
    if (!remoteJid || fromMe || remoteJid.endsWith('@g.us') || remoteJid.includes('status')) return;

    const phone = cleanPhone(remoteJid);

    // Busca organização pelo nome da instância — precisa vir cedo, porque
    // tanto o fluxo de texto quanto os de áudio/mídia dependem dela pra
    // responder (instância/token do Evolution, notification_phone etc.)
    const ctx = await getOrgByInstance(instanceName);
    if (!ctx) {
      console.warn(`[Webhook/Evolution] No active org found for instance="${instanceName}"`);
      return;
    }
    const instanceToken = ctx.org.evolution_token;

    // ── Áudio (mensagem de voz/PTT chega igual — Evolution v2 trata os dois como audioMessage) ──
    const audioMsg = message.audioMessage as Record<string, unknown> | undefined;
    if (messageType === 'audioMessage' || audioMsg) {
      console.log(`[Webhook/Evolution] Áudio recebido de ${phone}, org="${ctx.org.name}"`);

      const mimetype = String(audioMsg?.mimetype || 'audio/ogg; codecs=opus');

      // Extrai o base64: data.message.base64 → data.base64 → message.audioMessage.base64
      let base64 =
        (message.base64 as string | undefined) ||
        (data.base64 as string | undefined) ||
        (audioMsg?.base64 as string | undefined) ||
        '';

      // Fallback: instância antiga sem webhookBase64 habilitado — busca a mídia na Evolution
      if (!base64 && key) {
        const media = await getMediaBase64(instanceName, key, instanceToken);
        if (media?.base64) base64 = media.base64;
      }

      if (!base64) {
        console.warn(`[Webhook/Evolution] Áudio sem base64 disponível (org="${ctx.org.name}", phone=${phone})`);
        await sendText(instanceName, phone, AUDIO_FAILURE_MSG, instanceToken);
        return;
      }

      // Guarda de tamanho — estima o tamanho decodificado sem alocar o buffer inteiro
      const approxBytes = Math.floor((base64.length * 3) / 4);
      if (approxBytes > MAX_AUDIO_BYTES) {
        console.warn(`[Webhook/Evolution] Áudio muito grande (~${approxBytes} bytes) de ${phone}, org="${ctx.org.name}"`);
        await sendText(instanceName, phone, AUDIO_TOO_LONG_MSG, instanceToken);
        return;
      }

      const transcript = await transcribeAudio(base64, mimetype);
      if (!transcript) {
        console.warn(`[Webhook/Evolution] Falha ao transcrever áudio de ${phone}, org="${ctx.org.name}"`);
        await sendText(instanceName, phone, AUDIO_FAILURE_MSG, instanceToken);
        return;
      }

      const truncated = transcript.length > MAX_TRANSCRIPT_CHARS
        ? transcript.slice(0, MAX_TRANSCRIPT_CHARS) + '…'
        : transcript;

      console.log(`[Webhook/Evolution] Áudio transcrito de ${phone}: "${truncated.slice(0, 80)}"`);
      await routeText(ctx, phone, truncated, pushName);
      return;
    }

    // ── Imagem / documento / vídeo / sticker — nunca termina em silêncio (exceto sticker) ──
    if (MEDIA_NO_TEXT_TYPES.includes(messageType)) {
      if (messageType === 'stickerMessage') return; // sticker não é uma pergunta, ignora

      // Imagem COM legenda: processa a legenda como texto normal, ignora a imagem em si
      if (messageType === 'imageMessage') {
        const imgMsg = message.imageMessage as Record<string, unknown> | undefined;
        const caption = String(imgMsg?.caption || '').trim();
        if (caption) {
          await routeText(ctx, phone, caption, pushName);
          return;
        }
      }

      console.log(`[Webhook/Evolution] Mídia não processável (${messageType}) de ${phone}, org="${ctx.org.name}"`);
      await sendText(instanceName, phone, INCAPACITY_MEDIA_MSG, instanceToken);
      return;
    }

    // ── Extrai texto ──
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

    if (!text.trim()) {
      console.log(`[Webhook/Evolution] Skipped: no text, type="${messageType}"`);
      return;
    }

    console.log(`[Webhook/Evolution] Processing org="${ctx.org.name}" phone="${phone}"`);
    await routeText(ctx, phone, text.trim(), pushName);
  } catch (err) {
    console.error('[Webhook/Evolution] Error:', err);
  }
}

/**
 * Encaminha um texto (digitado, transcrito de áudio, ou legenda de
 * imagem) pro fluxo normal do agente — modo profissional se quem
 * mandou for o número de notificação, senão o agente Bento.
 */
async function routeText(ctx: OrgContext, phone: string, text: string, pushName: string): Promise<void> {
  const notifPhone = ctx.settings.notification_phone?.replace(/\D/g, '') || '';
  if (notifPhone && phone === notifPhone) {
    await processProMessage(ctx.org, ctx.settings, phone, text);
    return;
  }
  await processMessage(ctx.org, ctx.settings, phone, text, pushName, ctx.professionals);
}
