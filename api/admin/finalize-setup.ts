/**
 * POST /api/admin/finalize-setup
 * Valida Evolution + Chatwoot, gera link de acesso e envia mensagem de boas-vindas via WhatsApp.
 *
 * Body: { orgId: string }
 * Returns: { steps: Step[] }
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from '../lib/supabaseAdmin.js';
import { getConnectionStatus, sendText } from '../services/evolutionService.js';

const CHATWOOT_URL = (process.env.CHATWOOT_URL || '').replace(/\/$/, '');
const APP_URL = process.env.VITE_APP_URL || 'https://agentes-de-atendimento.vercel.app';

interface Step {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
}

async function testChatwoot(accountId: number, token: string): Promise<boolean> {
  if (!CHATWOOT_URL) return false;
  try {
    const res = await fetch(`${CHATWOOT_URL}/api/v1/profile`, {
      headers: { 'api_access_token': token },
    });
    return res.ok;
  } catch {
    return false;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { orgId } = req.body as { orgId?: string };
  if (!orgId) return res.status(400).json({ error: 'orgId required' });

  // Buscar dados da org
  const { data: org } = await supabaseAdmin
    .from('organizations')
    .select('id, name, billing_email, evolution_instance, evolution_token, chatwoot_account_id, chatwoot_token')
    .eq('id', orgId)
    .single();

  if (!org) return res.status(404).json({ error: 'Organização não encontrada' });

  // Buscar telefone de notificação do agent_settings
  const { data: settings } = await supabaseAdmin
    .from('agent_settings')
    .select('notification_phone')
    .eq('org_id', orgId)
    .maybeSingle();

  // Buscar email do usuário vinculado
  const userInfoRes = await fetch(`${APP_URL}/api/admin/get-org-user?orgId=${orgId}`).catch(() => null);
  const userInfo = userInfoRes ? await userInfoRes.json().catch(() => ({})) as { email?: string } : {};
  const linkedEmail = userInfo?.email ?? org.billing_email;

  const steps: Step[] = [];

  // ── 1. Verificar Evolution preenchida ───────────────────────────────────
  const hasEvolution = !!(org.evolution_instance && org.evolution_token);
  steps.push({
    id: 'evolution_fields',
    label: 'Dados da Evolution',
    ok: hasEvolution,
    detail: hasEvolution
      ? `Instância: ${org.evolution_instance}`
      : 'Instância e Token da Evolution não preenchidos — configure na aba Geral',
  });

  // ── 2. Verificar conexão WhatsApp ───────────────────────────────────────
  let evolutionConnected = false;
  if (hasEvolution) {
    const state = await getConnectionStatus(org.evolution_instance!, org.evolution_token);
    evolutionConnected = state === 'open';
    steps.push({
      id: 'evolution_conn',
      label: 'WhatsApp conectado',
      ok: evolutionConnected,
      detail: evolutionConnected
        ? 'Instância online e pronta para enviar mensagens'
        : `Estado atual: "${state}" — escaneie o QR code no painel Evolution para conectar`,
    });
  } else {
    steps.push({
      id: 'evolution_conn',
      label: 'WhatsApp conectado',
      ok: false,
      detail: 'Impossível verificar sem os dados da Evolution',
    });
  }

  // ── 3. Verificar Chatwoot ────────────────────────────────────────────────
  const hasChatwoot = !!(org.chatwoot_account_id && org.chatwoot_token);
  let chatwootOk = false;
  if (hasChatwoot) {
    chatwootOk = await testChatwoot(org.chatwoot_account_id!, org.chatwoot_token!);
    steps.push({
      id: 'chatwoot',
      label: 'Chatwoot acessível',
      ok: chatwootOk,
      detail: chatwootOk
        ? `Conta #${org.chatwoot_account_id} validada com sucesso`
        : 'Token do Chatwoot inválido ou servidor inacessível — verifique as credenciais',
    });
  } else {
    steps.push({
      id: 'chatwoot',
      label: 'Chatwoot acessível',
      ok: false,
      detail: 'Account ID e Token do Chatwoot não preenchidos — configure na aba Geral',
    });
  }

  // ── 4. Verificar usuário e telefone ─────────────────────────────────────
  const notificationPhone = settings?.notification_phone ?? null;
  const hasPhone = !!(notificationPhone && notificationPhone.length >= 10);
  steps.push({
    id: 'phone',
    label: 'Telefone do cliente',
    ok: hasPhone,
    detail: hasPhone
      ? `Número: ${notificationPhone}`
      : 'Nenhum telefone cadastrado — peça ao cliente preencher nas Configurações ou salve via painel',
  });

  // ── 5. Gerar link de acesso ──────────────────────────────────────────────
  let accessLink = APP_URL;
  let linkOk = false;
  if (linkedEmail) {
    try {
      const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
        type: 'recovery',
        email: linkedEmail,
        options: { redirectTo: `${APP_URL}/reset-password` },
      });
      if (!linkErr && linkData?.properties?.action_link) {
        accessLink = linkData.properties.action_link;
        linkOk = true;
      }
    } catch { /* usa APP_URL como fallback */ }
  }
  steps.push({
    id: 'link',
    label: 'Link de acesso gerado',
    ok: linkOk,
    detail: linkOk
      ? 'Link de redefinição de senha gerado'
      : linkedEmail
        ? 'Falha ao gerar link — usuário pode acessar via ' + APP_URL
        : 'Nenhum e-mail vinculado à organização',
  });

  // ── 6. Enviar mensagem de boas-vindas ────────────────────────────────────
  const canSend = evolutionConnected && hasPhone;
  if (canSend) {
    const message = [
      `Olá! Bem-vindo(a) à plataforma Agentes de Atendimento! 🎉`,
      ``,
      `Sua conta foi configurada com sucesso.`,
      ``,
      `*Login:* ${linkedEmail || org.billing_email}`,
      `*Acesso:* ${accessLink}`,
      ``,
      `Clique no link acima para definir sua senha e acessar o painel.`,
      ``,
      `Qualquer dúvida estamos à disposição!`,
    ].join('\n');

    const sent = await sendText(
      org.evolution_instance!,
      notificationPhone!,
      message,
      org.evolution_token,
    );

    steps.push({
      id: 'message',
      label: 'Mensagem de boas-vindas enviada',
      ok: sent,
      detail: sent
        ? `Enviada para ${notificationPhone}`
        : 'Falha ao enviar — verifique se o número está correto e a instância está online',
    });
  } else {
    steps.push({
      id: 'message',
      label: 'Mensagem de boas-vindas',
      ok: false,
      detail: !evolutionConnected
        ? 'Aguardando WhatsApp conectado para enviar'
        : 'Aguardando telefone do cliente para enviar',
    });
  }

  return res.status(200).json({ steps });
}
