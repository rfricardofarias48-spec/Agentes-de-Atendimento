/**
 * Chatwoot Service — AgenteClin
 * Multi-tenant: um servidor Chatwoot compartilhado, uma conta por organização.
 * Config por org vem da tabela organizations (chatwoot_account_id, chatwoot_token, chatwoot_inbox_id).
 */

import { Agent } from 'undici';

const cleanEnv = (key: string) => (process.env[key] || '').replace(/^﻿+/, '').trim();

const CHATWOOT_URL = cleanEnv('CHATWOOT_URL').replace(/\/$/, '');
const CHATWOOT_ADMIN_TOKEN = cleanEnv('CHATWOOT_ADMIN_TOKEN');

// Aceita certificados autoassinados em instâncias self-hosted (sslip.io, etc.)
const tlsDispatcher = new Agent({ connect: { rejectUnauthorized: false } });

interface ChatwootContact {
  id: number;
  name: string;
  phone_number?: string;
}

interface ChatwootConversation {
  id: number;
  status: string;
}

async function chatwootRequest(
  method: string,
  path: string,
  token: string,
  body?: Record<string, unknown>,
): Promise<unknown> {
  if (!CHATWOOT_URL) {
    console.warn('[Chatwoot] CHATWOOT_URL not configured');
    return null;
  }
  try {
    const res = await fetch(`${CHATWOOT_URL}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'api_access_token': token },
      body: body ? JSON.stringify(body) : undefined,
      // @ts-ignore — dispatcher é aceito pelo fetch do Node 22 (undici)
      dispatcher: tlsDispatcher,
    });
    if (!res.ok) {
      const text = await res.text();
      console.error(`[Chatwoot] ${method} ${path} → HTTP ${res.status}: ${text.substring(0, 200)}`);
      return null;
    }
    return res.json().catch(() => null);
  } catch (err) {
    console.error(`[Chatwoot] fetch error on ${method} ${path}:`, err);
    return null;
  }
}

/** Encontra ou cria um contato no Chatwoot pelo telefone */
export async function findOrCreateContact(
  accountId: number,
  token: string,
  phone: string,
  name?: string,
): Promise<number | null> {
  const normalized = phone.startsWith('+') ? phone : `+${phone}`;

  const search = await chatwootRequest(
    'GET',
    `/api/v1/accounts/${accountId}/contacts/search?q=${encodeURIComponent(normalized)}&page=1`,
    token,
  ) as { payload?: ChatwootContact[] } | null;

  const found = search?.payload?.find(c => c.phone_number === normalized || c.phone_number === phone);
  if (found) return found.id;

  const created = await chatwootRequest(
    'POST',
    `/api/v1/accounts/${accountId}/contacts`,
    token,
    { name: name || phone, phone_number: normalized },
  ) as { id?: number } | null;

  return created?.id ?? null;
}

/** Encontra conversa aberta ou cria nova */
export async function findOrCreateConversation(
  accountId: number,
  token: string,
  contactId: number,
  inboxId: number,
): Promise<number | null> {
  const contactConvs = await chatwootRequest(
    'GET',
    `/api/v1/accounts/${accountId}/contacts/${contactId}/conversations`,
    token,
  ) as { payload?: ChatwootConversation[] } | null;

  const existing = contactConvs?.payload?.find(c => c.status === 'open');
  if (existing) return existing.id;

  const created = await chatwootRequest(
    'POST',
    `/api/v1/accounts/${accountId}/conversations`,
    token,
    { inbox_id: inboxId, contact_id: contactId },
  ) as { id?: number } | null;

  return created?.id ?? null;
}

/** Posta mensagem em uma conversa */
export async function postMessage(
  accountId: number,
  token: string,
  conversationId: number,
  content: string,
  messageType: 'incoming' | 'outgoing',
): Promise<void> {
  await chatwootRequest(
    'POST',
    `/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`,
    token,
    { content, message_type: messageType, private: false },
  );
}

/** Espelha mensagem no Chatwoot — cria contato/conversa automaticamente */
export async function mirrorMessage(
  accountId: number,
  token: string,
  inboxId: number,
  phone: string,
  content: string,
  direction: 'incoming' | 'outgoing',
  patientName?: string,
  existingConversationId?: number,
): Promise<number | null> {
  try {
    let conversationId = existingConversationId ?? null;

    if (!conversationId) {
      const contactId = await findOrCreateContact(accountId, token, phone, patientName);
      if (!contactId) return null;
      conversationId = await findOrCreateConversation(accountId, token, contactId, inboxId);
      if (!conversationId) return null;
    }

    await postMessage(accountId, token, conversationId, content, direction);
    return conversationId;
  } catch (err) {
    console.error('[Chatwoot] mirrorMessage error:', err);
    return null;
  }
}

/**
 * Configura a integração Chatwoot na instância Evolution (aba Integrations → Chatwoot).
 * Preenche todos os campos conforme especificado na skill de setup.
 */
export async function configureChatwootOnEvolution(
  instance: string,
  evolutionToken: string,
  chatwootAccountId: number,
  chatwootToken: string,
  chatwootInboxId?: number,
  orgName?: string,
): Promise<boolean> {
  const evolutionUrl = (process.env.EVOLUTION_API_URL || '').replace(/\/$/, '');
  if (!evolutionUrl || !CHATWOOT_URL) {
    console.warn('[Chatwoot] EVOLUTION_API_URL ou CHATWOOT_URL não configurado');
    return false;
  }

  const cleanToken = chatwootToken.trim().replace(/[\r\n\t"']/g, '');
  const inboxName  = orgName ? `WhatsApp - ${orgName}` : 'WhatsApp';

  const body: Record<string, unknown> = {
    enabled: true,
    accountId: String(chatwootAccountId),
    token: cleanToken,
    url: CHATWOOT_URL,
    nameInbox: inboxName,
    organization: orgName ?? '',
    signMsg: false,                    // não assinar com nome do agente
    reopenConversation: true,          // reabre conversa ao receber nova mensagem
    conversationPending: false,        // conversa começa aberta (não pendente)
    mergeBrazilContacts: true,
    importContacts: false,             // não importar agenda
    importMessages: false,             // não importar histórico
    daysLimitImportMessages: 0,
    autoCreate: chatwootInboxId ? false : true,
  };
  if (chatwootInboxId) body.inboxId = String(chatwootInboxId);

  try {
    const res = await fetch(`${evolutionUrl}/chatwoot/set/${instance}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: evolutionToken },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      console.log(`[Chatwoot] Evolution configurado para instância: ${instance}`);
      return true;
    }
    const text = await res.text();
    console.error(`[Chatwoot] configureChatwootOnEvolution falhou: ${res.status} ${text.substring(0, 200)}`);
    return false;
  } catch (err) {
    console.error('[Chatwoot] configureChatwootOnEvolution error:', err);
    return false;
  }
}

/**
 * Busca o ID do primeiro inbox da conta Chatwoot (criado via autoCreate do Evolution).
 */
export async function getFirstInboxId(
  accountId: number,
  token: string,
): Promise<number | null> {
  if (!CHATWOOT_URL) return null;
  try {
    const res = await fetch(`${CHATWOOT_URL}/api/v1/accounts/${accountId}/inboxes`, {
      headers: { 'api_access_token': token },
      // @ts-ignore — dispatcher é aceito pelo fetch do Node 22 (undici)
      dispatcher: tlsDispatcher,
    });
    if (!res.ok) return null;
    const data = await res.json() as { payload?: { id: number }[] };
    return data?.payload?.[0]?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Cria webhook na conta Chatwoot para receber eventos de conversa.
 * URL: nosso endpoint /api/webhooks/chatwoot
 * Eventos: conversation_status_changed, message_created
 */
export async function createChatwootWebhook(
  accountId: number,
  token: string,
  webhookUrl: string,
): Promise<boolean> {
  const result = await chatwootRequest(
    'POST',
    `/api/v1/accounts/${accountId}/integrations/webhooks`,
    token,
    {
      url: webhookUrl,
      subscriptions: ['conversation_status_changed', 'message_created'],
    },
  ) as { id?: number } | null;

  if (result?.id) {
    console.log(`[Chatwoot] Webhook criado para account #${accountId}: ${webhookUrl}`);
    return true;
  }
  console.error(`[Chatwoot] Falha ao criar webhook para account #${accountId}`);
  return false;
}

/**
 * Cria uma nova conta Chatwoot para uma organização (via admin token).
 * Retorna { accountId, token } ou null.
 */
export async function createChatwootAccount(orgName: string): Promise<{ accountId: number; token: string } | null> {
  if (!CHATWOOT_ADMIN_TOKEN) {
    console.warn('[Chatwoot] CHATWOOT_ADMIN_TOKEN não configurado');
    return null;
  }
  if (!CHATWOOT_URL) {
    console.warn('[Chatwoot] CHATWOOT_URL não configurado');
    return null;
  }
  // Alerta se a URL contiver /app — isso causaria 404 em todos os endpoints
  if (CHATWOOT_URL.includes('/app')) {
    console.error(`[Chatwoot] CHATWOOT_URL parece ter sufixo /app: "${CHATWOOT_URL}" — remova o /app, use apenas a URL base (ex: https://chat.exemplo.com)`);
  }

  const signUpUrl = `${CHATWOOT_URL}/auth/sign_up`;
  console.log(`[Chatwoot] Tentando criar conta em: ${signUpUrl}`);

  try {
    const res = await fetch(signUpUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // @ts-ignore — dispatcher é aceito pelo fetch do Node 22 (undici)
      dispatcher: tlsDispatcher,
      body: JSON.stringify({
        account_name: orgName,
        email: `org-${Date.now()}@gestor.elevva.net.br`,
        password: `Ac${Math.random().toString(36).slice(2, 10)}!1`,
        user_full_name: orgName,
      }),
    });

    const text = await res.text();
    if (!res.ok) {
      console.error(`[Chatwoot] signup FAILED — HTTP ${res.status} at ${signUpUrl} — resposta: ${text.substring(0, 400)}`);
      return null;
    }

    const data = JSON.parse(text) as { data?: { access_token?: string; account_id?: number } };
    if (data?.data?.account_id && data?.data?.access_token) {
      return { accountId: data.data.account_id, token: data.data.access_token };
    }
    console.error('[Chatwoot] Resposta inesperada em sign_up:', text.substring(0, 200));
    return null;
  } catch (err) {
    console.error(`[Chatwoot] createChatwootAccount erro de rede em ${signUpUrl}:`, err);
    return null;
  }
}
