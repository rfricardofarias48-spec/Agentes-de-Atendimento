-- =============================================
-- RECRUITMENT — Nichos, Vagas, Candidatos, Entrevistas
-- =============================================

-- Nichos (agrupam vagas por área)
create table if not exists niches (
  id          uuid primary key default uuid_generate_v4(),
  org_id      uuid not null references organizations(id) on delete cascade,
  name        text not null,
  order_pos   integer not null default 0,
  is_pinned   boolean not null default false,
  created_at  timestamptz not null default now()
);

-- Vagas
create table if not exists jobs (
  id          uuid primary key default uuid_generate_v4(),
  org_id      uuid not null references organizations(id) on delete cascade,
  niche_id    uuid references niches(id) on delete set null,
  title       text not null,
  description text not null default '',
  criteria    text not null default '',
  short_code  text not null default '',
  is_pinned   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Candidatos (CVs enviados para uma vaga)
create table if not exists candidates (
  id              uuid primary key default uuid_generate_v4(),
  job_id          uuid not null references jobs(id) on delete cascade,
  org_id          uuid references organizations(id) on delete cascade,
  status          text not null default 'PENDENTE',
  file_path       text,
  analysis_result jsonb,
  candidate_name  text,
  candidate_phone text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Entrevistas
create table if not exists interviews (
  id               uuid primary key default uuid_generate_v4(),
  job_id           uuid not null references jobs(id) on delete cascade,
  candidate_id     uuid references candidates(id) on delete set null,
  slot_date        date,
  slot_time        time,
  meeting_link     text,
  format           text,
  interviewer_name text,
  status           text not null default 'AGUARDANDO_RESPOSTA',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- =============================================
-- RLS
-- =============================================

alter table niches    enable row level security;
alter table jobs      enable row level security;
alter table candidates enable row level security;
alter table interviews enable row level security;

-- niches: org members can do everything
create policy "niches_org_all" on niches
  for all using (
    org_id in (
      select org_id from user_profiles where user_id = auth.uid()
    )
  );

-- jobs: org members can do everything
create policy "jobs_org_all" on jobs
  for all using (
    org_id in (
      select org_id from user_profiles where user_id = auth.uid()
    )
  );

-- candidates: org members can do everything
create policy "candidates_org_all" on candidates
  for all using (
    org_id in (
      select org_id from user_profiles where user_id = auth.uid()
    )
  );

-- interviews: via jobs.org_id
create policy "interviews_org_all" on interviews
  for all using (
    job_id in (
      select id from jobs where org_id in (
        select org_id from user_profiles where user_id = auth.uid()
      )
    )
  );
