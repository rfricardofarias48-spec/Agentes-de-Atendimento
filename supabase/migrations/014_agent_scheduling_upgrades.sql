-- =============================================
-- Profissionais (agendas independentes por org) +
-- vínculo em appointments. Duração por serviço fica
-- dentro do próprio jsonb `agent_settings.services`
-- (chave `duration_minutes`), sem precisar de migration.
-- =============================================

create table if not exists professionals (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  name          text not null,
  active        boolean not null default true,
  working_hours jsonb,              -- mesmo formato de agent_settings.working_hours; null = usa o padrão da clínica
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists professionals_org_id_idx on professionals(org_id);

alter table appointments
  add column if not exists professional_id uuid references professionals(id) on delete set null;
create index if not exists appointments_professional_id_idx on appointments(professional_id);

alter table professionals enable row level security;

create policy "admin manages all professionals" on professionals for all
  using (exists (select 1 from user_profiles where user_id = auth.uid() and role = 'admin'));

create policy "client manages own professionals" on professionals for all
  using (exists (select 1 from user_profiles where user_id = auth.uid() and org_id = professionals.org_id));
