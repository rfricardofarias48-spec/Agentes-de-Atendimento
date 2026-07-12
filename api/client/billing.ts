/**
 * GET /api/client/billing
 *
 * Retorna os dados de cobrança da organização do usuário autenticado:
 * mensalidade, próximo vencimento, status, e a cobrança pendente (PIX +
 * boleto) da assinatura e do setup fee (se ainda não pago). Busca ao
 * vivo no Asaas — não guarda QR code no banco, fica sempre sincronizado.
 *
 * Autenticação: Authorization: Bearer <access_token> do Supabase. O
 * orgId nunca vem do cliente — é resolvido a partir do token, via
 * user_profiles, pra um usuário nunca conseguir ver a cobrança de outra
 * organização.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from '../_lib/supabaseAdmin.js';
import {
  getPendingPaymentForSubscription, getPixQrCode, getPayment, type AsaasPayment,
} from '../_services/asaasService.js';

interface PaymentInfo {
  value: number;
  dueDate: string;
  status: string;
  invoiceUrl: string | null;
  bankSlipUrl: string | null;
  pix: { encodedImage: string; payload: string } | null;
}

interface HistoryEntry {
  value: number;
  dueDate: string;
  paidDate: string | null;
  status: string;
  type: 'subscription' | 'setup';
}

async function enrichPayment(payment: AsaasPayment): Promise<PaymentInfo> {
  const pix = await getPixQrCode(payment.id);
  return {
    value: payment.value,
    dueDate: payment.dueDate,
    status: payment.status,
    invoiceUrl: payment.invoiceUrl ?? null,
    bankSlipUrl: payment.bankSlipUrl ?? null,
    pix: pix ? { encodedImage: pix.encodedImage, payload: pix.payload } : null,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Não autenticado' });

  const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
  if (userErr || !userData?.user) return res.status(401).json({ error: 'Sessão inválida' });

  const { data: profile } = await supabaseAdmin
    .from('user_profiles')
    .select('org_id')
    .eq('user_id', userData.user.id)
    .single();

  if (!profile?.org_id) return res.status(404).json({ error: 'Organização não encontrada para este usuário' });

  const { data: org } = await supabaseAdmin
    .from('organizations')
    .select('monthly_fee, subscription_period_end, asaas_status, asaas_subscription_id, setup_fee, setup_fee_status, setup_payment_id')
    .eq('id', profile.org_id)
    .single();

  if (!org) return res.status(404).json({ error: 'Organização não encontrada' });

  // Cobrança pendente da mensalidade (ao vivo no Asaas)
  let subscriptionPayment: PaymentInfo | null = null;
  if (org.asaas_subscription_id) {
    const payment = await getPendingPaymentForSubscription(org.asaas_subscription_id);
    if (payment) subscriptionPayment = await enrichPayment(payment);
  }

  // Setup fee, se ainda estiver pendente
  let setupPayment: PaymentInfo | null = null;
  if (org.setup_fee_status === 'pending' && org.setup_payment_id) {
    const payment = await getPayment(org.setup_payment_id);
    if (payment) setupPayment = await enrichPayment(payment);
  }

  // Histórico de cobranças já geradas (mensalidade + setup)
  const { data: historyRows } = await supabaseAdmin
    .from('payment_history')
    .select('value, due_date, paid_date, status, type')
    .eq('org_id', profile.org_id)
    .order('due_date', { ascending: false })
    .limit(24);

  const history: HistoryEntry[] = (historyRows || []).map(h => ({
    value: h.value,
    dueDate: h.due_date,
    paidDate: h.paid_date,
    status: h.status,
    type: h.type,
  }));

  return res.status(200).json({
    monthlyFee: org.monthly_fee,
    nextDueDate: org.subscription_period_end,
    asaasStatus: org.asaas_status,
    subscriptionPayment,
    setupFee: org.setup_fee,
    setupFeeStatus: org.setup_fee_status,
    setupPayment,
    history,
  });
}
