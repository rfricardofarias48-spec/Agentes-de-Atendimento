/**
 * GET  /api/admin/auto-setup?orgId=xxx
 *   Status de conexão + QR code da instância Evolution (polling). Vivia
 *   antes em api/admin/qr-status.ts — consolidado aqui pra não estourar
 *   o limite de functions da Vercel (mesmo motivo de outras consolidações
 *   já feitas neste projeto).
 *
 * POST /api/admin/auto-setup   Body: { orgId: string }
 *   Provider-aware:
 *   - whatsapp_provider = 'evolution' (default): orquestra a criação
 *     completa da infra (instância Evolution + Chatwoot + integração +
 *     QR code), como sempre foi.
 *   - whatsapp_provider = 'official': não provisiona nada (o número já
 *     existe no Meta Business Manager) — só valida o
 *     whatsapp_phone_number_id contra a Graph API (token global,
 *     META_ACCESS_TOKEN) e, se válido, ativa o provider oficial pra essa
 *     organização. É o botão "Migrar para API Oficial" do admin.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from '../_lib/supabaseAdmin.js';
import {
  createInstance,
  getQRCode,
  configureWebhook,
  configureInstanceSettings,
  getConnectionStatus,
} from '../_services/evolutionService.js';
import {
  configureChatwootOnEvolution,
  createChatwootWebhook,
  getFirstInboxId,
  platformSetupChatwootAccount,
} from '../_services/chatwootService.js';
import { getPhoneNumberInfo } from '../_services/metaWhatsappService.js';

const WEBHOOK_URL = process.env.VITE_APP_URL
  ? `${process.env.VITE_APP_URL}/api/webhook/evolution`
  : 'https://app.elevva.net.br/api/webhook/evolution';
const CHATWOOT_WEBHOOK_URL = process.env.VITE_APP_URL
  ? `${process.env.VITE_APP_URL}/api/webhooks/chatwoot`
  : 'https://app.elevva.net.br/api/webhooks/chatwoot';
const CHATWOOT_BASE_URL = (process.env.CHATWOOT_URL || '').replace(/^﻿+/, '').trim().replace(/\/$/, '');
const HAS_PLATFORM_TOKEN = !!(process.env.CHATWOOT_PLATFORM_TOKEN || '').trim();

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
  if (req.method === 'GET') return handleQrStatus(req, res);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { orgId, migrateToOfficial } = req.body as { orgId?: string; migrateToOfficial?: boolean };
  if (!orgId) return res.status(400).json({ error: 'orgId required' });

  const { data: org } = await supabaseAdmin
    .from('organizations')
    .select('id, name, phone, whatsapp_provider, whatsapp_phone_number_id, evolution_instance, evolution_token, chatwoot_account_id, chatwoot_token, chatwoot_inbox_id, chatwoot_url')
    .eq('id', orgId)
    .single();

  if (!org) return res.status(404).json({ error: 'Organização não encontrada' });

  // migrateToOfficial=true dispara a validação mesmo antes de a org estar
  // marcada como 'official' — só vira 'official' de fato se a validação passar.
  if (org.whatsapp_provider === 'official' || migrateToOfficial) {
    return handleOfficialSetup(org, res);
  }
  return handleEvolutionSetup(org, orgId, res);
}

// ── GET: status/QR da instância Evolution (polling) ──────────────────────
async function handleQrStatus(req: VercelRequest, res: VercelResponse) {
  const orgId = req.query.orgId as string | undefined;
  if (!orgId) return res.status(400).json({ error: 'orgId required' });

  const { data: org } = await supabaseAdmin
    .from('organizations')
    .select('evolution_instance, evolution_token')
    .eq('id', orgId)
    .single();

  if (!org?.evolution_instance) {
    return res.status(404).json({ error: 'Instância não configurada' });
  }

  const state = await getConnectionStatus(org.evolution_instance, org.evolution_token);
  const connected = state === 'open';
  const qrCode = connected ? null : await getQRCode(org.evolution_instance, org.evolution_token);

  return res.status(200).json({ state, connected, qrCode });
}

// ── POST — provider oficial: valida o número e ativa, sem provisionar nada ──
async function handleOfficialSetup(
  org: { id: string; name: string; whatsapp_phone_number_id: string | null },
  res: VercelResponse,
) {
  const steps: Step[] = [];

  if (!org.whatsapp_phone_number_id) {
    steps.push({
      id: 'phone_number_id',
      label: 'Phone Number ID',
      ok: false,
      detail: 'Preencha o Phone Number ID da Meta antes de migrar.',
    });
    return res.status(200).json({ steps, provider: 'official' });
  }

  const info = await getPhoneNumberInfo(org.whatsapp_phone_number_id);
  if (!info) {
    steps.push({
      id: 'meta_validate',
      label: 'Validar número na Meta',
      ok: false,
      detail: 'Não foi possível validar — confira o Phone Number ID e se META_ACCESS_TOKEN está configurado.',
    });
    return res.status(200).json({ steps, provider: 'official' });
  }

  steps.push({
    id: 'meta_validate',
    label: 'Número validado na Meta',
    ok: true,
    detail: `${info.verifiedName ?? org.name} · ${info.displayPhoneNumber ?? '—'} · qualidade: ${info.qualityRating ?? '—'}`,
  });

  await supabaseAdmin.from('organizations').update({ whatsapp_provider: 'official' }).eq('id', org.id);

  steps.push({
    id: 'provider',
    label: 'API oficial ativada',
    ok: true,
    detail: 'Esta organização agora responde pela API oficial do WhatsApp.',
  });

  return res.status(200).json({ steps, provider: 'official' });
}

// ── POST — provider evolution: fluxo completo de provisionamento (como sempre foi) ──
async function handleEvolutionSetup(
  org: {
    id: string; name: string; phone: string | null;
    evolution_instance: string | null; evolution_token: string | null;
    chatwoot_account_id: number | null; chatwoot_token: string | null; chatwoot_inbox_id: number | null;
  },
  orgId: string,
  res: VercelResponse,
) {
  const steps: Step[] = [];
  let evolutionInstance = org.evolution_instance;
  let evolutionToken    = org.evolution_token;
  let chatwootAccountId = org.chatwoot_account_id;
  let chatwootToken     = org.chatwoot_token;
  let chatwootInboxId   = org.chatwoot_inbox_id;

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

  // ── 2. Chatwoot — automático (Platform API) ou manual ────────────────────
  if (!chatwootAccountId || !chatwootToken) {
    if (HAS_PLATFORM_TOKEN) {
      // Automático via Platform API
      const orgEmail = org.phone
        ? `org-${slugify(org.name)}-${Date.now().toString(36)}@app.elevva.net.br`
        : `org-${Date.now().toString(36)}@app.elevva.net.br`;

      const cwSetup = await platformSetupChatwootAccount(org.name, orgEmail);
      if (cwSetup) {
        chatwootAccountId = cwSetup.accountId;
        chatwootToken     = cwSetup.token;
        steps.push({
          id: 'chatwoot_create',
          label: 'Conta Chatwoot criada automaticamente',
          ok: true,
          detail: `Account #${cwSetup.accountId} · Login: ${cwSetup.email} · Senha gerada automaticamente`,
        });

        // Salva credenciais e userId para possibilitar cleanup futuro
        await supabaseAdmin.from('organizations')
          .update({
            chatwoot_login_email: cwSetup.email,
            chatwoot_login_password: cwSetup.password,
            chatwoot_user_id: cwSetup.userId,
          })
          .eq('id', orgId)
          .then(() => {}); // best-effort, colunas podem não existir ainda
      } else {
        steps.push({
          id: 'chatwoot_create',
          label: 'Criar conta Chatwoot',
          ok: false,
          detail: 'Falha na Platform API — verifique CHATWOOT_PLATFORM_TOKEN e CHATWOOT_URL',
        });
      }
    } else {
      // Manual — CHATWOOT_PLATFORM_TOKEN não configurado
      steps.push({
        id: 'chatwoot_create',
        label: 'Chatwoot — configuração manual necessária',
        ok: false,
        detail: 'Configure CHATWOOT_PLATFORM_TOKEN nas variáveis de ambiente para automação completa, ou preencha Account ID e Token manualmente.',
      });
    }
  } else {
    steps.push({
      id: 'chatwoot_create',
      label: 'Chatwoot',
      ok: true,
      detail: `Account #${chatwootAccountId} — credenciais já configuradas`,
    });
  }

  // ── Persistir credenciais ─────────────────────────────────────────────────
  await supabaseAdmin.from('organizations').update({
    evolution_instance:  evolutionInstance,
    evolution_token:     evolutionToken,
    chatwoot_account_id: chatwootAccountId,
    chatwoot_token:      chatwootToken,
    chatwoot_url:        CHATWOOT_BASE_URL || null,
  }).eq('id', orgId);

  // ── 3. Configurar Settings da instância ──────────────────────────────────
  const settingsOk = await configureInstanceSettings(evolutionInstance!, evolutionToken);
  steps.push({
    id: 'settings',
    label: 'Settings da instância',
    ok: settingsOk,
    detail: settingsOk
      ? 'Reject Calls ON · Ignore Groups ON · Always Online OFF · Read Messages OFF · Sync History OFF'
      : 'Falha ao aplicar settings — verifique token da instância',
  });

  // ── 4. Configurar Webhook Evolution ──────────────────────────────────────
  const webhookOk = await configureWebhook(evolutionInstance!, WEBHOOK_URL, evolutionToken);
  steps.push({
    id: 'webhook',
    label: 'Webhook configurado',
    ok: webhookOk,
    detail: webhookOk
      ? `URL: ${WEBHOOK_URL} · Base64 ON · MESSAGES_UPSERT, CONNECTION_UPDATE, QRCODE_UPDATED, SEND_MESSAGE`
      : 'Falha ao configurar webhook',
  });

  // ── 5. Integrar Evolution ↔ Chatwoot ─────────────────────────────────────
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

    // ── 7. Webhook Chatwoot — feito aqui (conta já ativa, evita race condition) ──
    // Tenta até 3x com 2s de intervalo
    let cwWebhookOk = false;
    for (let attempt = 1; attempt <= 3 && !cwWebhookOk; attempt++) {
      if (attempt > 1) await new Promise(r => setTimeout(r, 2000));
      cwWebhookOk = await createChatwootWebhook(chatwootAccountId, chatwootToken, CHATWOOT_WEBHOOK_URL);
    }
    steps.push({
      id: 'chatwoot_webhook',
      label: 'Webhook Chatwoot',
      ok: cwWebhookOk,
      detail: cwWebhookOk
        ? `URL: ${CHATWOOT_WEBHOOK_URL} · conversation_status_changed, message_created`
        : 'Falha ao criar webhook Chatwoot após 3 tentativas',
    });
  }

  // ── Persistir inbox_id ────────────────────────────────────────────────────
  if (chatwootInboxId) {
    await supabaseAdmin.from('organizations')
      .update({ chatwoot_inbox_id: chatwootInboxId })
      .eq('id', orgId);
  }

  // ── 7. Obter QR code ──────────────────────────────────────────────────────
  const qrCode = await getQRCode(evolutionInstance!, evolutionToken);
  steps.push({
    id: 'qr',
    label: 'QR code pronto',
    ok: !!qrCode,
    detail: qrCode
      ? 'Escaneie com o WhatsApp do cliente para ativar a instância'
      : 'QR ainda sendo gerado — aguarde e clique em Atualizar QR',
  });

  return res.status(200).json({ steps, qrCode, evolutionInstance, chatwootAccountId, chatwootToken });
}
