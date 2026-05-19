-- =============================================
-- Recrutamento: auto_analyze + sessões de conversa
-- =============================================

-- Campo que habilita análise automática de CVs na vaga
alter table jobs
  add column if not exists auto_analyze boolean not null default true;

-- Sessões de recrutamento por telefone (estado da conversa do candidato)
create table if not exists recruitment_sessions (
  phone      text    not null,
  org_id     uuid    not null references organizations(id) on delete cascade,
  job_id     uuid    references jobs(id) on delete cascade,
  state      text    not null default 'awaiting_job_code',
  -- states: awaiting_job_code | awaiting_cv | done
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (phone, org_id)
);

alter table recruitment_sessions enable row level security;

create policy "recruitment_sessions_service_all" on recruitment_sessions
  for all using (true);
-- acesso apenas via service role key (backend), não via anon key do frontend
