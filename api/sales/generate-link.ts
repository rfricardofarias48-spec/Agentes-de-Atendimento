/**
 * POST /api/sales/generate-link
 * Gera um link de pagamento Asaas para um plano AgenteClin.
 * Body: { clientName, clientEmail, plan, billing }
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { generatePaymentLink, PLAN_PRICES, PLAN_LABELS } from '../services/asaasService.js';
import { supabaseAdmin } from '../lib/supabaseAdmin.js';
import { randomUUID } from 'crypto';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { clientName, clientEmail, plan, billing } = req.body as {
    clientName?: string;
    clientEmail?: string;
    plan?: string;
    billing?: 'mensal' | 'anual';
  };

  if (!clientName || !clientEmail || !plan || !billing) {
    return res.status(400).json({ error: 'clientName, clientEmail, plan e billing são obrigatórios' });
  }

  if (!['starter', 'pro', 'clinic'].includes(plan)) {
    return res.status(400).json({ error: 'Plano inválido' });
  }

  if (!['mensal', 'anual'].includes(billing)) {
    return res.status(400).json({ error: 'Billing inválido' });
  }

  const saleId = randomUUID();

  try {
    const link = await generatePaymentLink({ clientName, clientEmail, plan, billing, saleId });

    await supabaseAdmin.from('sales').insert({
      id: saleId,
      client_name: clientName,
      client_email: clientEmail,
      plan,
      billing,
      asaas_link_id: link.id,
      asaas_link_url: link.url,
      status: 'pending',
    });

    return res.status(200).json({
      url: link.url,
      saleId,
      plan,
      billing,
      amount: billing === 'anual' ? PLAN_PRICES[`${plan}_anual`] : PLAN_PRICES[plan],
      planLabel: PLAN_LABELS[plan],
    });
  } catch (err) {
    console.error('[generate-link]', err);
    return res.status(500).json({ error: String(err) });
  }
}
