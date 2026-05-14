/**
 * POST /api/admin/auto-setup
 * Orquestra a criação completa de uma org:
 *   1. Cria instância Evolution
 *   2. Cria conta Chatwoot
 *   3. Aplica Settings da instância (Reject Calls, Ignore Groups…)
 *   4. Configura Webhook (Base64, eventos corretos)
 *   5. Integra Evolution ↔ Chatwoot (preenche aba Chatwoot)
 *   6. Localiza inbox_id criado via autoCreate
 *   7. Retorna QR code para o admin escanear
 *
 * Body: { orgId: string }
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from '../_lib/supabaseAdmin.js';
import {
  createInstance,
  getQRCode,
  configureWebhook,
  configureInstanceSettings,
} from '../_services/evolutionService.js';
import {
  createChatwootAccount,
  configureChatwootOnEvolution,
  createChatwootWebhook,
  getFirstInboxId,
} from '../_services/chatwootService.js';

const WEBHOOK_URL = 'https://gestor.elevva.net.br/api/webhook/evolution';
const CHATWOOT_WEBHOOK_URL = 'https://gestor.elevva.net.br/api/webhooks/chatwoot';
const CHATWOOT_BASE_URL = (process.env.CHATWOOT_URL || '').replace(/^﻿+/, '').trim().replace(/\/$/, '');

interface Step {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 24);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { orgId } = req.body as { orgId?: string };
  if (!orgId) return res.status(400).json({ error: 'orgId required' });

  const { data: org } = await supabaseAdmin
    .from('organizations')
    .select('id, name, evolution_instance, evolution_token, chatwoot_account_id, chatwoot_token, chatwoot_inbox_id, chatwoot_url')
    .eq('id', orgId)
    .single();

  if (!org) return res.status(404).json({ error: 'Organização não encontrada' });

  const steps: Step[] = [];
  let evolutionInstance = org.evolution_instance as string | null;
  let evolutionToken    = org.evolution_token    as string | null;
  let chatwootAccountId = org.chatwoot_account_id as number | null;
  let chatwootToken     = org.chatwoot_token     as string | null;
  let chatwootInboxId   = org.chatwoot_inbox_id  as number | null;

  // ── 1. Criar instância Evolution ─────────────────────────────────────────
  if (!evolutionInstance) {
    const instanceName = `elevva-${slugify(org.name)}-${Date.now().toString(36)}`;
    const created = await createInstance(instanceName);
    if (created) {
      evolutionInstance = instanceName;
      evolutionToken    = created.token;
      steps.push({ id: 'evolution_create', label: 'Instância Evolution criada', ok: true, detail: instanceName });
    } else {
      steps.push({ id: 'evolution_create', label: 'Criar instância Evolution', ok: false, detail: 'Falha ao criar — verifique EVOLUTION_API_URL e EVOLUTION_API_KEY' });
      return res.status(200).json({ steps, qrCode: null });
    }
  } else {
    steps.push({ id: 'evolution_create', label: 'Instância Evolution', ok: true, detail: `Já existente: ${evolutionInstance}` });
  }

  // ── 2. Criar conta Chatwoot ───────────────────────────────────────────────
  let chatwootFreshlyCreated = false;
  if (!chatwootAccountId) {
    const chatwoot = await createChatwootAccount(org.name);
    if (chatwoot) {
      chatwootAccountId = chatwoot.accountId;
      chatwootToken     = chatwoot.token;
      chatwootFreshlyCreated = true;
      steps.push({ id: 'chatwoot_create', label: 'Conta Chatwoot criada', ok: true, detail: `Account #${chatwootAccountId}` });
    } else {
      const cwUrlHint = CHATWOOT_BASE_URL
        ? (CHATWOOT_BASE_URL.includes('/app') ? `URL tem sufixo /app — remova: use "${CHATWOOT_BASE_URL.replace(/\/app.*$/, '')}"` : `URL: ${CHATWOOT_BASE_URL}`)
        : 'CHATWOOT_URL não configurado';
      steps.push({ id: 'chatwoot_create', label: 'Criar conta Chatwoot', ok: false, detail: `Falha ao criar — ${cwUrlHint}. Verifique também ENABLE_ACCOUNT_SIGNUP=true no Chatwoot` });
    }
  } else {
    steps.push({ id: 'chatwoot_create', label: 'Conta Chatwoot', ok: true, detail: `Já existente: Account #${chatwootAccountId}` });
  }

  // ── 2b. Criar webhook no Chatwoot — apenas para contas novas (evita duplicatas) ──
  if (chatwootFreshlyCreated && chatwootAccountId && chatwootToken) {
    const cwWebhookOk = await createChatwootWebhook(chatwootAccountId, chatwootToken, CHATWOOT_WEBHOOK_URL);
    steps.push({
      id: 'chatwoot_webhook',
      label: 'Webhook Chatwoot configurado',
      ok: cwWebhookOk,
      detail: cwWebhookOk
        ? `URL: ${CHATWOOT_WEBHOOK_URL} · conversation_status_changed, message_created`
        : 'Falha ao criar webhook — verifique credenciais Chatwoot',
    });
  } else if (!chatwootFreshlyCreated && chatwootAccountId) {
    steps.push({ id: 'chatwoot_webhook', label: 'Webhook Chatwoot', ok: true, detail: 'Já configurado (conta existente)' });
  }

  // ── Persistir credenciais antes de configurar ────────────────────────────
  await supabaseAdmin.from('organizations').update({
    evolution_instance:  evolutionInstance,
    evolution_token:     evolutionToken,
    chatwoot_account_id: chatwootAccountId,
    chatwoot_token:      chatwootToken,
    chatwoot_url:        CHATWOOT_BASE_URL || null,
  }).eq('id', orgId);

  // ── 3. Configurar Settings (aba Settings do painel Evolution) ────────────
  const settingsOk = await configureInstanceSettings(evolutionInstance!, evolutionToken);
  steps.push({
    id: 'settings',
    label: 'Settings da instância',
    ok: settingsOk,
    detail: settingsOk
      ? 'Reject Calls ON · Ignore Groups ON · Always Online OFF · Read Messages OFF · Sync History OFF'
      : 'Falha ao aplicar settings — verifique token da instância',
  });

  // ── 4. Configurar Webhook (aba Events → Webhook) ─────────────────────────
  const webhookOk = await configureWebhook(evolutionInstance!, WEBHOOK_URL, evolutionToken);
  steps.push({
    id: 'webhook',
    label: 'Webhook configurado',
    ok: webhookOk,
    detail: webhookOk
      ? `URL: ${WEBHOOK_URL} · Base64 ON · MESSAGES_UPSERT, CONNECTION_UPDATE, QRCODE_UPDATED, SEND_MESSAGE`
      : 'Falha ao configurar webhook',
  });

  // ── 5. Integrar Evolution ↔ Chatwoot (aba Integrations → Chatwoot) ───────
  let chatwootLinked = false;
  if (chatwootAccountId && chatwootToken) {
    chatwootLinked = await configureChatwootOnEvolution(
      evolutionInstance!,
      evolutionToken || '',
      chatwootAccountId,
      chatwootToken,
      undefined,
      org.name,
    );
    steps.push({
      id: 'chatwoot_link',
      label: 'Integração Evolution ↔ Chatwoot',
      ok: chatwootLinked,
      detail: chatwootLinked
        ? `Inbox "WhatsApp - ${org.name}" · Reopen ON · Pending OFF · Import OFF · AutoCreate ON`
        : 'Falha ao integrar — verifique CHATWOOT_URL e credenciais',
    });

    // ── 6. Localizar inbox_id criado via autoCreate ───────────────────────
    if (chatwootLinked && !chatwootInboxId) {
      await new Promise(r => setTimeout(r, 3000));
      const inboxId = await getFirstInboxId(chatwootAccountId, chatwootToken);
      if (inboxId) {
        chatwootInboxId = inboxId;
        steps.push({ id: 'inbox', label: 'Inbox WhatsApp localizado', ok: true, detail: `Inbox ID: ${inboxId}` });
      } else {
        steps.push({ id: 'inbox', label: 'Inbox WhatsApp', ok: false, detail: 'Inbox não encontrado ainda — tente novamente em alguns segundos' });
      }
    } else if (chatwootInboxId) {
      steps.push({ id: 'inbox', label: 'Inbox WhatsApp', ok: true, detail: `Já configurado: ID ${chatwootInboxId}` });
    }
  }

  // ── Persistir inbox_id ────────────────────────────────────────────────────
  if (chatwootInboxId) {
    await supabaseAdmin.from('organizations')
      .update({ chatwoot_inbox_id: chatwootInboxId })
      .eq('id', orgId);
  }

  // ── 7. Obter QR code para o admin escanear ────────────────────────────────
  const qrCode = await getQRCode(evolutionInstance!, evolutionToken);
  steps.push({
    id: 'qr',
    label: 'QR code pronto',
    ok: !!qrCode,
    detail: qrCode
      ? 'Escaneie com o WhatsApp do cliente para ativar a instância'
      : 'QR ainda sendo gerado — aguarde e clique em Atualizar QR',
  });

  return res.status(200).json({ steps, qrCode, evolutionInstance });
}
