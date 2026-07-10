/**
 * POST /api/sales/generate-link
 *
 * Duas finalidades, no mesmo endpoint pra não estourar o limite de
 * functions da Vercel (ver histórico do projeto — já foi consolidado
 * antes por esse motivo):
 *
 *  1) Cliente NOVO — body sem orgId: { clientName, clientEmail, setupFee, monthlyFee }
 *     Gera um link de pagamento Asaas (mensalidade recorrente). O setup
 *     fee é cobrado à parte, automaticamente, assim que a mensalidade é
 *     paga e a organização é criada — ver api/webhooks/asaas.ts.
 *
 *  2) Cliente EXISTENTE — body com orgId: { orgId, monthlyFee, setupFee?, chargeSetupNow? }
 *     Atualiza os valores negociados no banco e sincroniza com o Asaas:
 *     se a mensalidade mudou e já existe assinatura, atualiza o valor da
 *     assinatura (PUT /subscriptions/{id}); se chargeSetupNow=true, dispara
 *     uma cobrança avulsa do setup fee (útil pra recobrar se a automática
 *     falhou, ou pra setup renegociado depois).
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  generatePaymentLink, updateSubscriptionValue, createOneTimeCharge, getOrCreateCustomer,
} from '../_services/asaasService.js';
import { supabaseAdmin } from '../_lib/supabaseAdmin.js';
import { randomUUID } from 'crypto';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = req.body as {
    orgId?: string;
    clientName?: string;
    clientEmail?: string;
    setupFee?: number;
    monthlyFee?: number;
    chargeSetupNow?: boolean;
  };

  if (body.orgId) return handleUpdateExisting(body, res);
  return handleGenerateNew(body, res);
}

// ── Cliente novo: gera o link de pagamento da mensalidade ────────────────
async function handleGenerateNew(
  body: { clientName?: string; clientEmail?: string; setupFee?: number; monthlyFee?: number },
  res: VercelResponse,
) {
  const { clientName, clientEmail, setupFee, monthlyFee } = body;

  if (!clientName || !clientEmail) {
    return res.status(400).json({ error: 'clientName e clientEmail são obrigatórios' });
  }

  const monthly = Number(monthlyFee);
  if (!monthly || monthly <= 0) {
    return res.status(400).json({ error: 'Informe uma mensalidade válida (maior que zero)' });
  }

  const setup = Math.max(0, Number(setupFee) || 0);
  const saleId = randomUUID();

  try {
    const link = await generatePaymentLink({ clientName, monthlyFee: monthly, saleId });

    await supabaseAdmin.from('sales').insert({
      id: saleId,
      client_name: clientName,
      client_email: clientEmail,
      setup_fee: setup,
      monthly_fee: monthly,
      asaas_link_id: link.id,
      asaas_link_url: link.url,
      status: 'pending',
    });

    return res.status(200).json({ url: link.url, saleId, setupFee: setup, monthlyFee: monthly });
  } catch (err) {
    console.error('[generate-link]', err);
    return res.status(500).json({ error: String(err) });
  }
}

// ── Cliente existente: atualiza valores e sincroniza com o Asaas ─────────
async function handleUpdateExisting(
  body: { orgId?: string; monthlyFee?: number; setupFee?: number; chargeSetupNow?: boolean },
  res: VercelResponse,
) {
  const { orgId, monthlyFee, setupFee, chargeSetupNow } = body;
  if (!orgId) return res.status(400).json({ error: 'orgId é obrigatório' });

  const { data: org, error: orgErr } = await supabaseAdmin
    .from('organizations')
    .select('id, name, billing_email, monthly_fee, setup_fee, setup_fee_status, asaas_customer_id, asaas_subscription_id')
    .eq('id', orgId)
    .single();

  if (orgErr || !org) return res.status(404).json({ error: 'Cliente não encontrado' });

  const newMonthly = monthlyFee !== undefined ? Number(monthlyFee) : org.monthly_fee;
  const newSetup = setupFee !== undefined ? Number(setupFee) : org.setup_fee;

  const updatePayload: Record<string, unknown> = { monthly_fee: newMonthly, setup_fee: newSetup };

  // Mensalidade mudou e já existe assinatura ativa → sincroniza o valor no Asaas
  let subscriptionSynced = false;
  if (org.asaas_subscription_id && newMonthly !== org.monthly_fee) {
    subscriptionSynced = await updateSubscriptionValue(org.asaas_subscription_id, newMonthly);
    if (!subscriptionSynced) {
      console.warn(`[update-billing] Não foi possível sincronizar a assinatura ${org.asaas_subscription_id} da org ${orgId}`);
    }
  }

  let setupCharge: { id: string } | null = null;
  if (chargeSetupNow && newSetup > 0) {
    try {
      const customerId = org.asaas_customer_id || (org.billing_email
        ? await getOrCreateCustomer(org.name, org.billing_email)
        : null);
      if (!customerId) {
        return res.status(400).json({ error: 'Cliente sem e-mail de cobrança cadastrado — não é possível gerar cobrança no Asaas.' });
      }
      const charge = await createOneTimeCharge({
        customerId,
        value: newSetup,
        description: `Taxa de configuração — ${org.name}`,
        externalReference: `setup:${orgId}`,
      });
      setupCharge = { id: charge.id };
      updatePayload.setup_payment_id = charge.id;
      updatePayload.setup_fee_status = 'pending';
      if (!org.asaas_customer_id) updatePayload.asaas_customer_id = customerId;
    } catch (err) {
      console.error('[update-billing] Falha ao criar cobrança de setup fee:', err);
      return res.status(500).json({ error: 'Falha ao gerar cobrança do setup fee no Asaas' });
    }
  }

  const { error: updateErr } = await supabaseAdmin
    .from('organizations')
    .update(updatePayload)
    .eq('id', orgId);

  if (updateErr) return res.status(500).json({ error: updateErr.message });

  return res.status(200).json({
    ok: true,
    monthlyFee: newMonthly,
    setupFee: newSetup,
    subscriptionSynced,
    setupChargeId: setupCharge?.id ?? null,
  });
}
