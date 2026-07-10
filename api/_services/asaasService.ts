/**
 * Asaas Service — AgenteClin
 * Gateway de pagamento: geração de links, cobranças avulsas (setup) e
 * sincronização de assinaturas (mensalidade). Sem planos fixos — os
 * valores (setup/mensalidade) são negociados por cliente.
 */

const ASAAS_URL = (process.env.ASAAS_API_URL || 'https://api.asaas.com/v3').replace(/\/$/, '');
const ASAAS_KEY = process.env.ASAAS_API_KEY || '';
const WEBHOOK_TOKEN = process.env.ASAAS_WEBHOOK_TOKEN || '';

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

export interface AsaasPaymentLink {
  id: string;
  url: string;
  name: string;
}

/**
 * Gera um Payment Link recorrente (mensal) pro valor negociado com o
 * cliente. Quando pago, o Asaas cria a assinatura sozinho — o webhook
 * recebe payment.subscription preenchido e é isso que dispara a criação
 * da organização (ver api/webhooks/asaas.ts).
 */
export async function generatePaymentLink(params: {
  clientName: string;
  monthlyFee: number;
  saleId: string;
}): Promise<AsaasPaymentLink> {
  const { clientName, monthlyFee, saleId } = params;

  const body = {
    name: `Mensalidade — ${clientName}`,
    description: `Assinatura mensal — ${clientName}`,
    value: monthlyFee,
    billingType: 'UNDEFINED',
    chargeType: 'RECURRENT',
    cycle: 'MONTHLY',
    dueDateLimitDays: 3,
    isAddNewPaymentEnabled: false,
    externalReference: saleId, // UUID — dados completos ficam na tabela sales
  };

  return await asaasRequest('POST', '/paymentLinks', body) as AsaasPaymentLink;
}

export async function getOrCreateCustomer(name: string, email: string): Promise<string> {
  // Busca cliente existente
  const search = await asaasRequest('GET', `/customers?email=${encodeURIComponent(email)}`) as { data?: Array<{ id: string }> };
  if (search.data?.[0]?.id) return search.data[0].id;

  // Cria novo cliente
  const customer = await asaasRequest('POST', '/customers', { name, email }) as { id: string };
  return customer.id;
}

export interface AsaasPayment {
  id: string;
  status: string;
  value: number;
  dueDate: string;
  invoiceUrl?: string;
  bankSlipUrl?: string;
  subscription?: string;
  customer?: string;
}

/**
 * Cria uma cobrança avulsa (única) — usada pro setup fee ou qualquer
 * cobrança extra fora da mensalidade recorrente.
 */
export async function createOneTimeCharge(params: {
  customerId: string;
  value: number;
  description: string;
  externalReference: string;
  dueDateDays?: number;
}): Promise<AsaasPayment> {
  const { customerId, value, description, externalReference, dueDateDays = 3 } = params;
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + dueDateDays);

  const body = {
    customer: customerId,
    billingType: 'UNDEFINED',
    value,
    dueDate: dueDate.toISOString().slice(0, 10),
    description,
    externalReference,
  };

  return await asaasRequest('POST', '/payments', body) as AsaasPayment;
}

/**
 * Atualiza o valor de uma assinatura existente no Asaas — passa a valer
 * a partir da próxima cobrança do ciclo. É como a mensalidade fica
 * sincronizada quando o admin renegocia o valor depois.
 */
export async function updateSubscriptionValue(subscriptionId: string, value: number): Promise<boolean> {
  try {
    await asaasRequest('PUT', `/subscriptions/${subscriptionId}`, { value });
    return true;
  } catch (err) {
    console.error('[Asaas] Falha ao atualizar valor da assinatura:', err);
    return false;
  }
}

export async function getSubscriptionStatus(subscriptionId: string): Promise<string | null> {
  try {
    const data = await asaasRequest('GET', `/subscriptions/${subscriptionId}`) as { status?: string };
    return data.status ?? null;
  } catch {
    return null;
  }
}

/** Busca a próxima cobrança pendente (ou vencida) de uma assinatura — é o que o cliente vê pra pagar. */
export async function getPendingPaymentForSubscription(subscriptionId: string): Promise<AsaasPayment | null> {
  try {
    const pending = await asaasRequest('GET', `/payments?subscription=${subscriptionId}&status=PENDING&limit=1`) as { data?: AsaasPayment[] };
    if (pending.data?.[0]) return pending.data[0];

    const overdue = await asaasRequest('GET', `/payments?subscription=${subscriptionId}&status=OVERDUE&limit=1`) as { data?: AsaasPayment[] };
    return overdue.data?.[0] ?? null;
  } catch (err) {
    console.error('[Asaas] Falha ao buscar cobrança pendente da assinatura:', err);
    return null;
  }
}

/** Busca um payment avulso por id (usado pro setup fee). */
export async function getPayment(paymentId: string): Promise<AsaasPayment | null> {
  try {
    return await asaasRequest('GET', `/payments/${paymentId}`) as AsaasPayment;
  } catch (err) {
    console.error('[Asaas] Falha ao buscar payment:', err);
    return null;
  }
}

export interface AsaasPixQrCode {
  encodedImage: string; // base64 do QR (sem prefixo data:image)
  payload: string;      // código copia-e-cola
  expirationDate?: string;
}

export async function getPixQrCode(paymentId: string): Promise<AsaasPixQrCode | null> {
  try {
    return await asaasRequest('GET', `/payments/${paymentId}/pixQrCode`) as AsaasPixQrCode;
  } catch (err) {
    console.error('[Asaas] Falha ao buscar QR code PIX:', err);
    return null;
  }
}
