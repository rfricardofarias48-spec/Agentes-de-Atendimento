-- =============================================
-- Cobrança sob medida: Setup (único) + Mensalidade
-- Substitui o modelo de planos fixos (Essencial/Pro/Max).
-- =============================================

alter table organizations
  add column if not exists setup_fee numeric(10,2),
  add column if not exists monthly_fee numeric(10,2),
  add column if not exists setup_fee_status text not null default 'none',
  add column if not exists setup_payment_id text;

alter table sales
  add column if not exists setup_fee numeric(10,2),
  add column if not exists monthly_fee numeric(10,2);

-- plan/billing eram NOT NULL (herança do modelo de planos fixos) — como o
-- fluxo novo não preenche mais esses campos, precisam aceitar null.
alter table sales alter column plan drop not null;
alter table sales alter column billing drop not null;

comment on column organizations.setup_fee is 'Valor único de configuração/onboarding negociado com o cliente (cobrança avulsa no Asaas).';
comment on column organizations.monthly_fee is 'Mensalidade negociada — valor real cobrado na assinatura recorrente do Asaas (substitui o preço fixo por plano).';
comment on column organizations.setup_fee_status is 'none = sem setup a cobrar | pending = cobrança gerada, aguardando pagamento | paid = pago.';
comment on column organizations.setup_payment_id is 'ID do payment avulso do Asaas referente ao setup fee.';

-- Nota: organizations.plan, sales.plan e sales.billing permanecem no banco
-- (não usados mais pela UI nova) para não quebrar histórico.
