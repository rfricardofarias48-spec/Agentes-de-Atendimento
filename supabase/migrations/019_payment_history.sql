-- =============================================
-- Histórico de pagamentos (mensalidade + setup)
-- =============================================
-- Guarda um registro local de cada cobrança já paga/gerada, pra exibir
-- histórico na tela "Minha Assinatura" do cliente sem depender de uma
-- chamada ao vivo no Asaas por cobrança antiga. As cobranças pendentes
-- (atuais) continuam vindo ao vivo do Asaas via api/client/billing.ts;
-- esta tabela é só o retrato histórico do que já foi cobrado.

create table if not exists payment_history (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  value numeric(10,2) not null,
  due_date date not null,
  paid_date date,
  status text not null default 'paid' check (status in ('paid', 'pending', 'overdue')),
  type text not null default 'subscription' check (type in ('subscription', 'setup')),
  asaas_payment_id text,
  created_at timestamptz not null default now()
);

create index if not exists payment_history_org_id_idx on payment_history(org_id, due_date desc);

comment on table payment_history is 'Retrato histórico de cobranças (mensalidade/setup) já geradas, usado na tela de assinatura do cliente.';

alter table payment_history enable row level security;

create policy "payment_history_select" on payment_history for select
  using (
    exists (
      select 1 from user_profiles
      where user_id = auth.uid()
        and (role = 'admin' or org_id = payment_history.org_id)
    )
  );
