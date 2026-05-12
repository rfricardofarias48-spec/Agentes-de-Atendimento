/**
 * POST /api/webhooks/asaas
 * Processa eventos de pagamento do Asaas.
 *
 * Eventos tratados:
 *  - PAYMENT_CONFIRMED / PAYMENT_RECEIVED → cria org + usuário (se não existir), ativa assinatura
 *  - PAYMENT_OVERDUE  → suspende org
 *  - PAYMENT_RESTORED → reativa org
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from '../lib/supabaseAdmin.js';
import { validateWebhookToken, decodeMeta, PLAN_LABELS } from '../services/asaasService.js';

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

  // ── PAYMENT_OVERDUE: suspender org ──────────────────────────────────────
  if (event === 'PAYMENT_OVERDUE') {
    const meta = payment.externalReference ? decodeMeta(payment.externalReference) : null;
    if (meta?.clientEmail) {
      const { data: org } = await supabaseAdmin
        .from('organizations')
        .select('id')
        .eq('billing_email', meta.clientEmail as string)
        .maybeSingle();

      if (org) {
        await supabaseAdmin
          .from('organizations')
          .update({ status: 'suspended', asaas_status: 'overdue' })
          .eq('id', org.id);
        console.log(`[Asaas] Org ${org.id} suspensa por inadimplência`);
      }
    }
    return res.status(200).json({ ok: true });
  }

  // ── PAYMENT_RESTORED: reativar org ─────────────────────────────────────
  if (event === 'PAYMENT_RESTORED') {
    const meta = payment.externalReference ? decodeMeta(payment.externalReference) : null;
    if (meta?.clientEmail) {
      await supabaseAdmin
        .from('organizations')
        .update({ status: 'active', asaas_status: 'active' })
        .eq('billing_email', meta.clientEmail as string)
        .eq('status', 'suspended');
    }
    return res.status(200).json({ ok: true });
  }

  // ── PAYMENT_CONFIRMED / PAYMENT_RECEIVED ───────────────────────────────
  if (!['PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED'].includes(event)) {
    return res.status(200).json({ ok: true, note: 'Evento ignorado' });
  }

  const meta = payment.externalReference ? decodeMeta(payment.externalReference) : null;
  if (!meta?.clientEmail) {
    return res.status(200).json({ ok: true, note: 'Sem metadata de cliente' });
  }

  const { clientName, clientEmail, plan, billing, saleId } = meta as {
    clientName: string;
    clientEmail: string;
    plan: string;
    billing: string;
    saleId: string;
  };

  const periodEnd = calcPeriodEnd(billing, payment.dueDate);
  const asaasData = {
    asaas_customer_id:      payment.customer ?? null,
    asaas_subscription_id:  payment.subscription ?? null,
    asaas_status:           'active',
    subscription_period_end: periodEnd,
  };

  // Verifica se org já existe para este email
  const { data: existingOrg } = await supabaseAdmin
    .from('organizations')
    .select('id, status')
    .eq('billing_email', clientEmail)
    .maybeSingle();

  if (existingOrg) {
    // Org existe — atualiza dados de assinatura
    await supabaseAdmin
      .from('organizations')
      .update({ status: 'active', plan, ...asaasData })
      .eq('id', existingOrg.id);

    console.log(`[Asaas] Org ${existingOrg.id} renovada — plano ${plan}`);
  } else {
    // Org nova — criar organização + usuário
    const slug = clientName
      .toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .slice(0, 40);

    const tempPassword = Math.random().toString(36).slice(-10) + 'A1!';

    const { data: newOrg, error: orgErr } = await supabaseAdmin
      .from('organizations')
      .insert({
        name: clientName,
        slug: `${slug}-${Date.now().toString(36)}`,
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

    // Cria usuário no Supabase Auth
    const { data: authUser, error: authErr } = await supabaseAdmin.auth.admin.createUser({
      email: clientEmail,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { org_id: newOrg.id, role: 'client', name: clientName },
    });

    if (authErr) {
      console.error('[Asaas] Erro ao criar usuário:', authErr);
    } else if (authUser.user) {
      await supabaseAdmin.from('org_users').insert({
        org_id: newOrg.id,
        user_id: authUser.user.id,
        role: 'owner',
      });
    }

    // Cria agent_settings padrão
    await supabaseAdmin.from('agent_settings').insert({
      org_id: newOrg.id,
      agent_name: 'Assistente',
      greeting_message: `Olá! Sou o assistente da ${clientName}. Como posso ajudar?`,
      tone: 'friendly',
      specialties: [],
      services: [],
      custom_instructions: '',
    });

    console.log(`[Asaas] Org criada: ${newOrg.id} para ${clientEmail} — plano ${plan}`);
  }

  // Atualiza registro da venda
  if (saleId) {
    await supabaseAdmin
      .from('sales')
      .update({ status: 'paid', asaas_payment_id: payment.id, paid_at: new Date().toISOString() })
      .eq('id', saleId);
  }

  return res.status(200).json({ ok: true });
}
