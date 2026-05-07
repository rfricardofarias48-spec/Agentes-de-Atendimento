/**
 * POST /api/admin/setup-org
 * Configura automaticamente webhook e Chatwoot na Evolution após o admin
 * preencher os dados da organização.
 *
 * Body: { orgId: string }
 * Returns: { steps: Step[] }
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { configureWebhook, getConnectionStatus } from '../services/evolutionService.js';
import { configureChatwootOnEvolution } from '../services/chatwootService.js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
);

const VERCEL_URL = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : 'https://agentes-de-atendimento.vercel.app';

const WEBHOOK_URL = `${VERCEL_URL}/api/webhook/evolution`;

interface Step {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { orgId } = req.body as { orgId?: string };
  if (!orgId) return res.status(400).json({ error: 'orgId required' });

  // Busca org
  const { data: org, error } = await supabase
    .from('organizations')
    .select('id, name, evolution_instance, evolution_token, chatwoot_account_id, chatwoot_token, chatwoot_inbox_id')
    .eq('id', orgId)
    .single();

  if (error || !org) {
    return res.status(404).json({ error: 'Organização não encontrada' });
  }

  if (!org.evolution_instance) {
    return res.status(400).json({ error: 'Instância Evolution não configurada' });
  }

  const steps: Step[] = [];

  // ── 1. Verificar status da conexão ───────────────────────────────────────
  const state = await getConnectionStatus(org.evolution_instance, org.evolution_token);
  steps.push({
    id: 'connection',
    label: 'Status da instância',
    ok: state === 'open',
    detail: state === 'open'
      ? 'WhatsApp conectado'
      : `Estado: ${state} — escaneie o QR code para conectar`,
  });

  // ── 2. Configurar Webhook ────────────────────────────────────────────────
  const webhookOk = await configureWebhook(
    org.evolution_instance,
    WEBHOOK_URL,
    org.evolution_token,
  );
  steps.push({
    id: 'webhook',
    label: 'Webhook Evolution',
    ok: webhookOk,
    detail: webhookOk
      ? `Apontando para ${WEBHOOK_URL}`
      : 'Falha ao configurar webhook — verifique o token da instância',
  });

  // ── 3. Configurar Chatwoot (se dados presentes) ──────────────────────────
  if (org.chatwoot_account_id && org.chatwoot_token) {
    const chatwootOk = await configureChatwootOnEvolution(
      org.evolution_instance,
      org.evolution_token || process.env.EVOLUTION_API_KEY || '',
      org.chatwoot_account_id,
      org.chatwoot_token,
      org.chatwoot_inbox_id ?? undefined,
      org.name,
    );
    steps.push({
      id: 'chatwoot',
      label: 'Integração Chatwoot',
      ok: chatwootOk,
      detail: chatwootOk
        ? `Conta ${org.chatwoot_account_id} configurada na instância`
        : 'Falha ao integrar Chatwoot — verifique account_id e token',
    });
  } else {
    steps.push({
      id: 'chatwoot',
      label: 'Integração Chatwoot',
      ok: false,
      detail: 'Dados do Chatwoot não preenchidos — pulado',
    });
  }

  // ── 4. Garantir agent_settings ───────────────────────────────────────────
  const { data: existing } = await supabase
    .from('agent_settings')
    .select('id')
    .eq('org_id', orgId)
    .single();

  if (!existing) {
    const { error: settingsErr } = await supabase.from('agent_settings').insert({
      org_id: orgId,
      agent_name: 'Assistente',
      greeting_message: `Olá! Sou o assistente da ${org.name}. Como posso ajudar?`,
      tone: 'friendly',
      specialties: [],
      working_hours: null,
    });
    steps.push({
      id: 'agent_settings',
      label: 'Configurações do Agente',
      ok: !settingsErr,
      detail: settingsErr
        ? `Erro ao criar: ${settingsErr.message}`
        : 'Perfil do agente criado com valores padrão',
    });
  } else {
    steps.push({
      id: 'agent_settings',
      label: 'Configurações do Agente',
      ok: true,
      detail: 'Perfil do agente já existe',
    });
  }

  return res.status(200).json({ steps, webhookUrl: WEBHOOK_URL });
}
