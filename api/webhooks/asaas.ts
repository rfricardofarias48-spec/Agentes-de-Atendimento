/**
 * POST /api/webhooks/asaas
 * Processa eventos de pagamento do Asaas.
 *
 * Eventos tratados:
 *  - PAYMENT_CONFIRMED / PAYMENT_RECEIVED → cria org + convida usuário via e-mail
 *  - PAYMENT_OVERDUE  → suspende org
 *  - PAYMENT_RESTORED → reativa org
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from '../_lib/supabaseAdmin.js';
import { validateWebhookToken } from '../_services/asaasService.js';

const APP_URL = process.env.VITE_APP_URL || 'https://app.elevva.net.br';

const maxConvByPlan: Record<string, number> = {
  starter: 600,
  pro:     2000,
  clinic:  999999,
};

function calcPeriodEnd(billing: string, dueDate?: string): string {
  const base = dueDate ? new Date(dueDate + 'T12:00:00Z') : new Date();
  if (billing === 'anual') {
    base.setFullYear(base.getFullYear() + 1);
  } else {
    base.setMonth(base.getMonth() + 1);
  }
  return base.toISOString();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const headerToken = req.headers['asaas-access-token'] as string | undefined;
  if (!validateWebhookToken(headerToken)) {
    console.warn('[Asaas Webhook] Token inválido');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { event, payment } = req.body as {
    event?: string;
    payment?: {
      id?: string;
      externalReference?: string;
      status?: string;
      value?: number;
      dueDate?: string;
      subscription?: string;
      customer?: string;
    };
  };

  console.log(`[Asaas Webhook] evento=${event} payment=${payment?.id}`);

  if (!event || !payment) {
    return res.status(200).json({ ok: true, note: 'Sem dados relevantes' });
  }

  const saleId = payment.externalReference ?? null;

  // ── PAYMENT_OVERDUE: suspender org ──────────────────────────────────────
  if (event === 'PAYMENT_OVERDUE') {
    if (saleId) {
      const { data: sale } = await supabaseAdmin
        .from('sales').select('client_email').eq('id', saleId).maybeSingle();
      if (sale?.client_email) {
        await supabaseAdmin
          .from('organizations')
          .update({ status: 'suspended', asaas_status: 'overdue' })
          .eq('billing_email', sale.client_email);
      }
    }
    return res.status(200).json({ ok: true });
  }

  // ── PAYMENT_RESTORED: reativar org ─────────────────────────────────────
  if (event === 'PAYMENT_RESTORED') {
    if (saleId) {
      const { data: sale } = await supabaseAdmin
        .from('sales').select('client_email').eq('id', saleId).maybeSingle();
      if (sale?.client_email) {
        await supabaseAdmin
          .from('organizations')
          .update({ status: 'active', asaas_status: 'active' })
          .eq('billing_email', sale.client_email)
          .eq('status', 'suspended');
      }
    }
    return res.status(200).json({ ok: true });
  }

  // ── PAYMENT_CONFIRMED / PAYMENT_RECEIVED ───────────────────────────────
  if (!['PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED'].includes(event)) {
    return res.status(200).json({ ok: true, note: 'Evento ignorado' });
  }

  if (!saleId) {
    return res.status(200).json({ ok: true, note: 'Sem externalReference' });
  }

  const { data: sale } = await supabaseAdmin
    .from('sales')
    .select('client_name, client_email, plan, billing, status')
    .eq('id', saleId)
    .maybeSingle();

  if (!sale?.client_email) {
    return res.status(200).json({ ok: true, note: 'Venda não encontrada' });
  }

  const { client_name: clientName, client_email: clientEmail, plan, billing } = sale;

  const periodEnd = calcPeriodEnd(billing, payment.dueDate);
  const asaasData = {
    asaas_customer_id:       payment.customer ?? null,
    asaas_subscription_id:   payment.subscription ?? null,
    asaas_status:            'active',
    subscription_period_end: periodEnd,
    billing,
  };

  // ── Org já existe? (renovação de assinatura) ───────────────────────────
  const { data: existingOrg } = await supabaseAdmin
    .from('organizations')
    .select('id, status')
    .eq('billing_email', clientEmail)
    .maybeSingle();

  if (existingOrg) {
    await supabaseAdmin
      .from('organizations')
      .update({ status: 'active', plan, ...asaasData })
      .eq('id', existingOrg.id);

    console.log(`[Asaas] Org ${existingOrg.id} renovada — plano ${plan}`);

  } else {
    // ── Org nova: criar organização ────────────────────────────────────
    const slugBase = clientName
      .toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .slice(0, 40);

    const { data: newOrg, error: orgErr } = await supabaseAdmin
      .from('organizations')
      .insert({
        name: clientName,
        slug: `${slugBase}-${Date.now().toString(36)}`,
        billing_email: clientEmail,
        plan,
        status: 'active',
        agent_tone: 'friendly',
        max_conversations_month: maxConvByPlan[plan] ?? 600,
        conversations_used: 0,
        ...asaasData,
      })
      .select()
      .single();

    if (orgErr || !newOrg) {
      console.error('[Asaas] Erro ao criar org:', orgErr);
      return res.status(500).json({ error: 'Erro ao criar organização' });
    }

    // ── Criar usuário via convite (envia e-mail para o cliente definir senha) ──
    const { data: inviteData, error: inviteErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      clientEmail,
      {
        data: { name: clientName },
        redirectTo: `${APP_URL}/reset-password`,
      },
    );

    if (inviteErr) {
      console.error('[Asaas] Erro ao convidar usuário:', inviteErr);
    } else if (inviteData?.user) {
      // Vincular usuário à organização em user_profiles
      const { error: profileErr } = await supabaseAdmin.from('user_profiles').insert({
        user_id: inviteData.user.id,
        org_id: newOrg.id,
        role: 'client',
      });
      if (profileErr) {
        console.error('[Asaas] Erro ao criar user_profile:', profileErr);
      }
    }

    // ── Criar agent_settings padrão ────────────────────────────────────
    await supabaseAdmin.from('agent_settings').insert({
      org_id: newOrg.id,
      agent_name: 'Assistente',
      greeting_message: `Olá! Sou o assistente da ${clientName}. Como posso ajudar?`,
      tone: 'friendly',
      specialties: [],
      services: [],
      custom_instructions: '',
    });

    console.log(`[Asaas] Conta criada: ${newOrg.id} para ${clientEmail} — plano ${plan}`);
  }

  // Marcar venda como paga
  await supabaseAdmin
    .from('sales')
    .update({ status: 'paid', asaas_payment_id: payment.id, paid_at: new Date().toISOString() })
    .eq('id', saleId);

  return res.status(200).json({ ok: true });
}
