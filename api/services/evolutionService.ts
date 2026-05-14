/**
 * Evolution API Service — AgenteClin
 * Multi-tenant: cada organização tem sua própria instância Evolution.
 * Config por org vem da tabela organizations (evolution_instance, evolution_token).
 */

import crypto from 'crypto';

const BASE_URL = (process.env.EVOLUTION_API_URL || '').replace(/\/$/, '');
const GLOBAL_API_KEY = process.env.EVOLUTION_API_KEY || '';

export function cleanPhone(rawJid: string): string {
  return rawJid.replace(/@.*$/, '').replace(/^\+/, '');
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function humanDelay(text: string): number {
  const reactionMs = 800 + Math.random() * 1200;
  const typingMs = (text.length / 45) * 1000;
  const variance = (Math.random() - 0.5) * 0.4 * typingMs;
  return Math.min(Math.max(reactionMs + typingMs + variance, 1200), 8000);
}

function getApiKey(instanceToken?: string | null): string {
  return instanceToken || GLOBAL_API_KEY;
}

async function sendTypingPresence(instance: string, jid: string, durationMs: number, apiKey: string): Promise<void> {
  const phone = cleanPhone(jid);
  try {
    await fetch(`${BASE_URL}/chat/sendPresence/${instance}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: apiKey },
      body: JSON.stringify({ number: phone, options: { delay: durationMs, presence: 'composing' } }),
    });
  } catch { /* best-effort */ }
}

async function post(path: string, body: Record<string, unknown>, apiKey: string): Promise<{ ok: boolean; data: unknown }> {
  const fullUrl = `${BASE_URL}${path}`;
  try {
    const res = await fetch(fullUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: apiKey },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) {
      console.error(`[Evolution] POST ${fullUrl} → HTTP ${res.status}: ${text.substring(0, 200)}`);
      return { ok: false, data: null };
    }
    try { return { ok: true, data: JSON.parse(text) }; } catch { return { ok: true, data: null }; }
  } catch (err) {
    console.error(`[Evolution] fetch error on ${fullUrl}:`, err);
    return { ok: false, data: null };
  }
}

/** Envia mensagem de texto com simulação de digitação humana */
export async function sendText(
  instance: string,
  jid: string,
  text: string,
  instanceToken?: string | null,
): Promise<boolean> {
  const phone = cleanPhone(jid);
  const apiKey = getApiKey(instanceToken);
  const delay = humanDelay(text);

  await Promise.all([
    sendTypingPresence(instance, jid, delay, apiKey),
    sleep(delay),
  ]);

  const { ok } = await post(`/message/sendText/${instance}`, { number: phone, text, linkPreview: false }, apiKey);
  return ok;
}

/** Cria uma nova instância Evolution para uma clínica */
export async function createInstance(instanceName: string): Promise<{ token: string } | null> {
  const apiKey = GLOBAL_API_KEY;
  const fullUrl = `${BASE_URL}/instance/create`;
  try {
    const res = await fetch(fullUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: apiKey },
      body: JSON.stringify({
        instanceName,
        qrcode: true,
        integration: 'WHATSAPP-BAILEYS',
      }),
    });
    const data = await res.json() as { instance?: { instanceName: string }; hash?: { apikey: string } };
    if (res.ok && data.hash?.apikey) {
      return { token: data.hash.apikey };
    }
    console.error('[Evolution] createInstance failed:', data);
    return null;
  } catch (err) {
    console.error('[Evolution] createInstance error:', err);
    return null;
  }
}

/** Retorna o QR code para conectar WhatsApp em uma instância */
export async function getQRCode(instance: string, instanceToken?: string | null): Promise<string | null> {
  const apiKey = getApiKey(instanceToken);
  try {
    const res = await fetch(`${BASE_URL}/instance/connect/${instance}`, {
      headers: { apikey: apiKey },
    });
    const data = await res.json() as { base64?: string; code?: string };
    return data.base64 || data.code || null;
  } catch (err) {
    console.error('[Evolution] getQRCode error:', err);
    return null;
  }
}

/** Verifica o status de conexão da instância */
export async function getConnectionStatus(instance: string, instanceToken?: string | null): Promise<string> {
  const apiKey = getApiKey(instanceToken);
  try {
    const res = await fetch(`${BASE_URL}/instance/connectionState/${instance}`, {
      headers: { apikey: apiKey },
    });
    const data = await res.json() as { instance?: { state?: string } };
    return data.instance?.state || 'unknown';
  } catch {
    return 'unknown';
  }
}

/** Envia um documento (PDF, etc.) via WhatsApp */
export async function sendDocument(
  instance: string,
  jid: string,
  documentUrl: string,
  fileName: string,
  caption: string,
  instanceToken?: string | null,
): Promise<boolean> {
  const phone = cleanPhone(jid);
  const apiKey = getApiKey(instanceToken);
  const { ok } = await post(`/message/sendMedia/${instance}`, {
    number: phone,
    mediatype: 'document',
    media: documentUrl,
    fileName,
    caption,
  }, apiKey);
  return ok;
}

/** Configura webhook da instância */
export async function configureWebhook(
  instance: string,
  webhookUrl: string,
  instanceToken?: string | null,
): Promise<boolean> {
  const apiKey = getApiKey(instanceToken);
  const { ok } = await post(`/webhook/set/${instance}`, {
    webhook: {
      enabled: true,
      url: webhookUrl,
      webhookByEvents: false,
      webhookBase64: true,           // necessário para receber/enviar PDFs
      events: [
        'MESSAGES_UPSERT',           // mensagens recebidas dos pacientes
        'CONNECTION_UPDATE',         // status de conexão / QR code
        'QRCODE_UPDATED',            // QR code expirou e foi renovado
        'SEND_MESSAGE',              // confirmação de envio (PDFs)
      ],
    },
  }, apiKey);
  return ok;
}

/**
 * Configura as opções gerais da instância (aba Settings do painel Evolution).
 * Deve ser chamado logo após criar a instância.
 */
export async function configureInstanceSettings(
  instance: string,
  instanceToken?: string | null,
): Promise<boolean> {
  const apiKey = getApiKey(instanceToken);
  const { ok } = await post(`/settings/set/${instance}`, {
    rejectCall: true,
    msgCall: 'No momento não atendemos chamadas por aqui. Por favor, envie uma mensagem de texto.',
    groupsIgnore: true,
    alwaysOnline: false,
    readMessages: false,
    syncFullHistory: false,
    readStatus: false,
  }, apiKey);
  return ok;
}

// ── Media decryption (AES-256-CBC + HKDF-SHA256) ──
const MEDIA_HKDF_INFO: Record<string, string> = {
  document: 'WhatsApp Document Keys',
  image: 'WhatsApp Image Keys',
  audio: 'WhatsApp Audio Keys',
};

function hkdfExpand(prk: Buffer, info: Buffer, length: number): Buffer {
  let result = Buffer.alloc(0);
  let t = Buffer.alloc(0);
  for (let i = 1; result.length < length; i++) {
    t = crypto.createHmac('sha256', prk).update(Buffer.concat([t, info, Buffer.from([i])])).digest();
    result = Buffer.concat([result, t]);
  }
  return result.subarray(0, length);
}

export async function downloadMediaBase64(
  instance: string,
  messageData: { key: Record<string, unknown>; message: Record<string, unknown> },
  instanceToken?: string | null,
): Promise<{ base64: string; mimetype: string } | null> {
  const apiKey = getApiKey(instanceToken);
  const msg = messageData.message || {};
  const docMsg = (msg.documentMessage || msg.imageMessage || msg.audioMessage) as Record<string, unknown> | undefined;
  const mimetype = String(docMsg?.mimetype || 'application/octet-stream');
  const mediaUrl = String(docMsg?.URL || docMsg?.mediaUrl || docMsg?.url || '');
  const mediaKeyB64 = String(docMsg?.mediaKey || '');

  if (mediaUrl?.startsWith('http') && mediaKeyB64) {
    try {
      const res = await fetch(mediaUrl);
      if (res.ok) {
        const encrypted = Buffer.from(await res.arrayBuffer());
        const mediaKey = Buffer.from(mediaKeyB64, 'base64');
        const salt = Buffer.alloc(32);
        const prk = crypto.createHmac('sha256', salt).update(mediaKey).digest();
        const mediaType = docMsg?.mimetype ? String(docMsg.mimetype).split('/')[0] : 'document';
        const infoStr = MEDIA_HKDF_INFO[mediaType] || MEDIA_HKDF_INFO.document;
        const expanded = hkdfExpand(prk, Buffer.from(infoStr), 112);
        const iv = expanded.subarray(0, 16);
        const cipherKey = expanded.subarray(16, 48);
        const fileData = encrypted.subarray(0, encrypted.length - 10);
        const decipher = crypto.createDecipheriv('aes-256-cbc', cipherKey, iv);
        const decrypted = Buffer.concat([decipher.update(fileData), decipher.final()]);
        return { base64: decrypted.toString('base64'), mimetype };
      }
    } catch (err) {
      console.error('[Evolution] CDN decrypt error:', err);
    }
  }

  // Fallback: Evolution API endpoint
  try {
    const res = await fetch(`${BASE_URL}/chat/getBase64FromMediaMessage/${instance}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: apiKey },
      body: JSON.stringify({ message: messageData }),
    });
    if (res.ok) {
      const data = await res.json() as { base64?: string; mimetype?: string };
      if (data.base64) return { base64: data.base64, mimetype: data.mimetype || mimetype };
    }
  } catch { /* ignore */ }

  return null;
}
