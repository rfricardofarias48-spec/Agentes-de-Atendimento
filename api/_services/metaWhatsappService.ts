/**
 * Meta WhatsApp Service — AgenteClin
 * Integração com a API oficial do WhatsApp (Meta Cloud API).
 *
 * Diferente do Evolution: aqui NÃO há credencial por organização — um
 * único App/token de sistema (global, via env) atende todos os clientes
 * migrados, cada um identificado só pelo seu whatsapp_phone_number_id.
 * Isso é o que torna a migração de um cliente rápida (só um campo).
 */

import crypto from 'crypto';

const cleanEnv = (key: string) => (process.env[key] || '').replace(/^﻿+/, '').trim();

const GRAPH_VERSION   = cleanEnv('META_GRAPH_API_VERSION') || 'v21.0';
const GRAPH_BASE_URL  = `https://graph.facebook.com/${GRAPH_VERSION}`;
const ACCESS_TOKEN    = cleanEnv('META_ACCESS_TOKEN');
const VERIFY_TOKEN    = cleanEnv('WHATSAPP_VERIFY_TOKEN');
const APP_SECRET      = cleanEnv('META_APP_SECRET'); // opcional — se configurado, valida assinatura do webhook

async function graphRequest(method: string, path: string, body?: unknown): Promise<{ ok: boolean; data: unknown }> {
  if (!ACCESS_TOKEN) {
    console.warn('[Meta WhatsApp] META_ACCESS_TOKEN não configurado');
    return { ok: false, data: null };
  }
  try {
    const res = await fetch(`${GRAPH_BASE_URL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ACCESS_TOKEN}`,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const text = await res.text();
    let data: unknown = null;
    try { data = JSON.parse(text); } catch { /* resposta não-JSON (ex.: download binário não passa por aqui) */ }
    if (!res.ok) {
      console.error(`[Meta WhatsApp] ${method} ${path} → HTTP ${res.status}: ${text.substring(0, 300)}`);
      return { ok: false, data };
    }
    return { ok: true, data };
  } catch (err) {
    console.error(`[Meta WhatsApp] fetch error on ${method} ${path}:`, err);
    return { ok: false, data: null };
  }
}

/** Valida o handshake de verificação do webhook (GET com hub.mode/hub.verify_token/hub.challenge). */
export function verifyWebhookToken(mode?: string, token?: string): boolean {
  if (!VERIFY_TOKEN) {
    console.warn('[Meta WhatsApp] WHATSAPP_VERIFY_TOKEN não configurado — recusando handshake por segurança');
    return false;
  }
  return mode === 'subscribe' && token === VERIFY_TOKEN;
}

/**
 * Valida a assinatura HMAC do payload do webhook (header x-hub-signature-256).
 * Se META_APP_SECRET não estiver configurado, não valida (aceita tudo — modo dev,
 * mesmo padrão usado em validateWebhookToken do asaasService.ts).
 */
export function verifyWebhookSignature(rawBody: string, signatureHeader?: string): boolean {
  if (!APP_SECRET) return true;
  if (!signatureHeader) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', APP_SECRET).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader));
  } catch {
    return false; // tamanhos diferentes = assinatura inválida
  }
}

/** Envia mensagem de texto via WhatsApp Cloud API. */
export async function sendText(phoneNumberId: string, to: string, text: string): Promise<boolean> {
  const { ok } = await graphRequest('POST', `/${phoneNumberId}/messages`, {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: { body: text, preview_url: false },
  });
  return ok;
}

/** Envia documento (PDF, etc.) por link público via WhatsApp Cloud API. */
export async function sendDocument(
  phoneNumberId: string,
  to: string,
  documentUrl: string,
  fileName: string,
  caption: string,
): Promise<boolean> {
  const { ok } = await graphRequest('POST', `/${phoneNumberId}/messages`, {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'document',
    document: { link: documentUrl, filename: fileName, caption },
  });
  return ok;
}

/**
 * Consulta dados do número (nome verificado, telefone) — usado no botão
 * "Migrar para API Oficial" do admin pra validar o Phone Number ID antes
 * de trocar o provider da org.
 */
export async function getPhoneNumberInfo(phoneNumberId: string): Promise<{
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  qualityRating: string | null;
} | null> {
  const { ok, data } = await graphRequest(
    'GET',
    `/${phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`,
  );
  if (!ok || !data) return null;
  const d = data as { display_phone_number?: string; verified_name?: string; quality_rating?: string };
  return {
    displayPhoneNumber: d.display_phone_number ?? null,
    verifiedName: d.verified_name ?? null,
    qualityRating: d.quality_rating ?? null,
  };
}

/**
 * Baixa mídia recebida (áudio, imagem, documento) a partir do media.id do
 * webhook. Dois passos, como a Cloud API exige: busca a URL assinada,
 * depois baixa o binário com o mesmo token.
 */
export async function downloadMediaBase64(mediaId: string): Promise<{ base64: string; mimetype: string } | null> {
  if (!ACCESS_TOKEN) return null;
  try {
    const { ok, data } = await graphRequest('GET', `/${mediaId}`);
    if (!ok || !data) return null;
    const media = data as { url?: string; mime_type?: string };
    if (!media.url) return null;

    const res = await fetch(media.url, { headers: { Authorization: `Bearer ${ACCESS_TOKEN}` } });
    if (!res.ok) {
      console.error(`[Meta WhatsApp] Falha ao baixar mídia ${mediaId}: HTTP ${res.status}`);
      return null;
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    return { base64: buffer.toString('base64'), mimetype: media.mime_type || 'application/octet-stream' };
  } catch (err) {
    console.error(`[Meta WhatsApp] downloadMediaBase64 error (${mediaId}):`, err);
    return null;
  }
}
