/**
 * Asaas Service — AgenteClin
 * Gateway de pagamento: geração de links e sincronização de assinaturas.
 */

const ASAAS_URL = (process.env.ASAAS_API_URL || 'https://api.asaas.com/v3').replace(/\/$/, '');
const ASAAS_KEY = process.env.ASAAS_API_KEY || '';
const WEBHOOK_TOKEN = process.env.ASAAS_WEBHOOK_TOKEN || '';

export const ANNUAL_DISCOUNT = 0.20

// Preços mensais base
export const PLAN_PRICES_MONTHLY: Record<string, number> = {
  starter: 299.90,
  pro:     449.90,
  clinic:  849.90,
}

// Preço final (mensal ou anual = mensal × 12 × 0.8)
export function getPlanPrice(plan: string, billing: 'mensal' | 'anual'): number {
  const monthly = PLAN_PRICES_MONTHLY[plan] ?? 0
  if (billing === 'anual') return parseFloat((monthly * 12 * (1 - ANNUAL_DISCOUNT)).toFixed(2))
  return monthly
}

// Mantido para compatibilidade com generate-link
export const PLAN_PRICES: Record<string, number> = {
  starter:       PLAN_PRICES_MONTHLY.starter,
  starter_anual: getPlanPrice('starter', 'anual'),
  pro:           PLAN_PRICES_MONTHLY.pro,
  pro_anual:     getPlanPrice('pro', 'anual'),
  clinic:        PLAN_PRICES_MONTHLY.clinic,
  clinic_anual:  getPlanPrice('clinic', 'anual'),
}

export const PLAN_LABELS: Record<string, string> = {
  starter: 'Essencial',
  pro:     'Pro',
  clinic:  'Max',
};

async function asaasRequest(method: string, path: string, body?: unknown) {
  const res = await fetch(`${ASAAS_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      access_token: ASAAS_KEY,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Asaas ${method} ${path} → ${res.status}: ${text}`);
  }
  return res.json();
}

export function validateWebhookToken(token?: string): boolean {
  if (!WEBHOOK_TOKEN) return true; // sem token configurado, aceita tudo (dev)
  return token === WEBHOOK_TOKEN;
}

export function encodeMeta(meta: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(meta)).toString('base64');
}

export function decodeMeta(ref: string): Record<string, unknown> | null {
  try {
    return JSON.parse(Buffer.from(ref, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

export interface AsaasPaymentLink {
  id: string;
  url: string;
  name: string;
}

export async function generatePaymentLink(params: {
  clientName: string;
  clientEmail: string;
  plan: string;       // 'starter' | 'pro' | 'clinic'
  billing: 'mensal' | 'anual';
  saleId: string;
  discountPercent?: number;
}): Promise<AsaasPaymentLink> {
  const { clientName, clientEmail, plan, billing, saleId, discountPercent = 0 } = params;
  const basePrice = getPlanPrice(plan, billing);
  const amount = parseFloat((basePrice * (1 - discountPercent / 100)).toFixed(2));
  const cycle = billing === 'anual' ? 'YEARLY' : 'MONTHLY';
  const planLabel = PLAN_LABELS[plan] ?? plan;
  const billingLabel = billing === 'anual' ? 'Anual' : 'Mensal';

  const body = {
    name: `AgenteClin ${planLabel} ${billingLabel} — ${clientName}`,
    description: `Assinatura ${planLabel} ${billingLabel} — AgenteClin`,
    value: amount,
    billingType: 'UNDEFINED',
    chargeType: 'RECURRENT',
    cycle,
    dueDateLimitDays: 3,
    isAddNewPaymentEnabled: false,
    externalReference: saleId, // UUID (36 chars) — dados completos ficam na tabela sales
  };

  const data = await asaasRequest('POST', '/paymentLinks', body) as AsaasPaymentLink;
  return data;
}

export async function getOrCreateCustomer(name: string, email: string): Promise<string> {
  // Busca cliente existente
  const search = await asaasRequest('GET', `/customers?email=${encodeURIComponent(email)}`) as { data?: Array<{ id: string }> };
  if (search.data?.[0]?.id) return search.data[0].id;

  // Cria novo cliente
  const customer = await asaasRequest('POST', '/customers', { name, email }) as { id: string };
  return customer.id;
}

export async function getSubscriptionStatus(subscriptionId: string): Promise<string | null> {
  try {
    const data = await asaasRequest('GET', `/subscriptions/${subscriptionId}`) as { status?: string };
    return data.status ?? null;
  } catch {
    return null;
  }
}
