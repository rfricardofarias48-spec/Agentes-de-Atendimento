/**
 * Chatwoot Service — AgenteClin
 * Multi-tenant: um servidor Chatwoot compartilhado, uma conta por organização.
 * Config por org vem da tabela organizations (chatwoot_account_id, chatwoot_token, chatwoot_inbox_id).
 */

import { Agent } from 'undici';

const cleanEnv = (key: string) => (process.env[key] || '').replace(/^﻿+/, '').trim();

const CHATWOOT_URL = cleanEnv('CHATWOOT_URL').replace(/\/$/, '');
const CHATWOOT_ADMIN_TOKEN = cleanEnv('CHATWOOT_ADMIN_TOKEN');
const CHATWOOT_PLATFORM_TOKEN = cleanEnv('CHATWOOT_PLATFORM_TOKEN');

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

// ── Platform API (requer CHATWOOT_PLATFORM_TOKEN criado no /super_admin → Platform Apps) ──

async function platformRequest(
  method: string,
  path: string,
  body?: Record<string, unknown>,
): Promise<unknown> {
  if (!CHATWOOT_PLATFORM_TOKEN) {
    console.warn('[Chatwoot] CHATWOOT_PLATFORM_TOKEN não configurado');
    return null;
  }
  if (!CHATWOOT_URL) {
    console.warn('[Chatwoot] CHATWOOT_URL não configurado');
    return null;
  }
  try {
    const res = await fetch(`${CHATWOOT_URL}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'api_access_token': CHATWOOT_PLATFORM_TOKEN },
      body: body ? JSON.stringify(body) : undefined,
      // @ts-ignore
      dispatcher: tlsDispatcher,
    });
    const text = await res.text();
    if (!res.ok) {
      console.error(`[Chatwoot Platform] ${method} ${path} → HTTP ${res.status}: ${text.substring(0, 300)}`);
      return null;
    }
    try { return JSON.parse(text); } catch { return null; }
  } catch (err) {
    console.error(`[Chatwoot Platform] fetch error on ${method} ${path}:`, err);
    return null;
  }
}

/**
 * Cria uma nova Account (workspace) via Platform API.
 * Retorna o account_id ou null.
 */
export async function platformCreateAccount(orgName: string): Promise<number | null> {
  const data = await platformRequest('POST', '/platform/api/v1/accounts', {
    name: orgName,
    locale: 'pt_BR',
  }) as { id?: number } | null;
  if (data?.id) {
    console.log(`[Chatwoot Platform] Account criada: #${data.id} — ${orgName}`);
    return data.id;
  }
  return null;
}

/**
 * Habilita as features necessárias para uma Account via Platform API.
 * Sem isso, a account criada programaticamente fica com recursos limitados.
 */
export async function platformEnableAccountFeatures(accountId: number): Promise<boolean> {
  const data = await platformRequest('PATCH', `/platform/api/v1/accounts/${accountId}`, {
    features: {
      agent_management: true,
      auto_resolve_conversations: true,
      automations: true,
      canned_responses: true,
      custom_attributes: true,
      inbox_management: true,
      integrations: true,
      labels: true,
      reports: true,
      team_management: true,
    },
  }) as { id?: number } | null;
  const ok = !!data?.id;
  if (ok) console.log(`[Chatwoot Platform] Features habilitadas para account #${accountId}`);
  else console.warn(`[Chatwoot Platform] Falha ao habilitar features para account #${accountId} — continuando mesmo assim`);
  return ok;
}

/**
 * Cria um usuário via Platform API.
 * Retorna { userId, accessToken } — o access_token já vem na resposta, sem precisar de login.
 */
export async function platformCreateUser(params: {
  name: string;
  email: string;
  password: string;
}): Promise<{ userId: number; accessToken: string } | null> {
  const data = await platformRequest('POST', '/platform/api/v1/users', {
    name: params.name,
    display_name: params.name,
    email: params.email,
    password: params.password,
  }) as { id?: number; access_token?: string } | null;

  if (data?.id && data?.access_token) {
    console.log(`[Chatwoot Platform] Usuário criado: #${data.id} — ${params.email}`);
    return { userId: data.id, accessToken: data.access_token };
  }
  return null;
}

/**
 * Associa um usuário a uma Account com role administrator via Platform API.
 */
export async function platformAddUserToAccount(
  accountId: number,
  userId: number,
): Promise<boolean> {
  const data = await platformRequest(
    'POST',
    `/platform/api/v1/accounts/${accountId}/account_users`,
    { user_id: userId, role: 'administrator' },
  ) as { id?: number } | null;
  const ok = !!data?.id;
  if (ok) console.log(`[Chatwoot Platform] Usuário #${userId} associado à account #${accountId} como administrator`);
  return ok;
}

/**
 * Cria conta Chatwoot completa via Platform API (account + user + associação).
 * Retorna { accountId, token, email, password } ou null.
 */
export async function platformSetupChatwootAccount(orgName: string, orgEmail: string): Promise<{
  accountId: number;
  token: string;
  email: string;
  password: string;
} | null> {
  if (!CHATWOOT_PLATFORM_TOKEN) {
    console.warn('[Chatwoot] CHATWOOT_PLATFORM_TOKEN não configurado — setup manual necessário');
    return null;
  }

  // 1. Criar Account
  const accountId = await platformCreateAccount(orgName);
  if (!accountId) return null;

  // 2. Habilitar features necessárias (agent management, automations, inbox, reports, etc.)
  await platformEnableAccountFeatures(accountId);

  // 3. Criar Usuário
  const password = `Elv${Math.random().toString(36).slice(2, 8)}@${Math.floor(10 + Math.random() * 90)}`;
  const email = orgEmail || `org-${Date.now()}@gestor.elevva.net.br`;
  const user = await platformCreateUser({ name: orgName, email, password });
  if (!user) return null;

  // 4. Associar usuário à account como administrator
  await platformAddUserToAccount(accountId, user.userId);

  return { accountId, token: user.accessToken, email, password };
}
