-- =============================================
-- AgenteClin — Schema inicial
-- =============================================

-- Extensões
create extension if not exists "uuid-ossp";

-- =============================================
-- ORGANIZATIONS (clínicas clientes)
-- =============================================
create table organizations (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  slug text not null unique,
  plan text not null default 'starter' check (plan in ('starter', 'pro', 'clinic')),
  status text not null default 'trial' check (status in ('active', 'inactive', 'trial', 'suspended')),
  whatsapp_numbers text[] not null default '{}',
  chatwoot_url text,
  chatwoot_token text,
  asaas_key text,
  google_calendar_id text,
  agent_tone text not null default 'friendly' check (agent_tone in ('formal', 'friendly')),
  max_conversations_month integer not null default 600,
  conversations_used integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =============================================
-- USER PROFILES (vincula auth.users a orgs)
-- =============================================
create table user_profiles (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid references organizations(id) on delete cascade,
  role text not null default 'client' check (role in ('admin', 'client')),
  created_at timestamptz not null default now(),
  unique(user_id)
);

-- =============================================
-- AGENT SETTINGS (configurações por clínica)
-- =============================================
create table agent_settings (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references organizations(id) on delete cascade unique,
  agent_name text not null default 'Assistente',
  greeting_message text not null default 'Olá! Como posso ajudar?',
  tone text not null default 'friendly' check (tone in ('formal', 'friendly')),
  specialties text[] not null default '{}',
  working_hours jsonb,
  reminder_24h boolean not null default true,
  reminder_2h boolean not null default true,
  auto_send_pdf boolean not null default true,
  updated_at timestamptz not null default now()
);

-- =============================================
-- APPOINTMENTS (agendamentos feitos pelo agente)
-- =============================================
create table appointments (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references organizations(id) on delete cascade,
  patient_name text not null,
  patient_phone text not null,
  specialty text not null,
  doctor_name text,
  scheduled_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'confirmed', 'cancelled', 'completed')),
  google_event_id text,
  notes text,
  created_at timestamptz not null default now()
);

-- =============================================
-- CONVERSATIONS (histórico de conversas)
-- =============================================
create table conversations (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references organizations(id) on delete cascade,
  patient_phone text not null,
  patient_name text,
  started_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  message_count integer not null default 0,
  escalated_to_human boolean not null default false,
  chatwoot_conversation_id text
);

-- =============================================
-- KNOWLEDGE ITEMS (base de treinamento)
-- =============================================
create table knowledge_items (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references organizations(id) on delete cascade,
  type text not null check (type in ('faq', 'pdf', 'instruction')),
  title text not null,
  content text,
  file_url text,
  specialty text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- =============================================
-- ROW LEVEL SECURITY
-- =============================================

alter table organizations enable row level security;
alter table user_profiles enable row level security;
alter table agent_settings enable row level security;
alter table appointments enable row level security;
alter table conversations enable row level security;
alter table knowledge_items enable row level security;

-- user_profiles: cada usuário lê o próprio perfil
create policy "users read own profile"
  on user_profiles for select
  using (auth.uid() = user_id);

-- organizations: admin vê tudo, client vê só a própria
create policy "admin reads all orgs"
  on organizations for select
  using (
    exists (select 1 from user_profiles where user_id = auth.uid() and role = 'admin')
  );

create policy "client reads own org"
  on organizations for select
  using (
    exists (select 1 from user_profiles where user_id = auth.uid() and org_id = organizations.id)
  );

create policy "admin writes orgs"
  on organizations for all
  using (
    exists (select 1 from user_profiles where user_id = auth.uid() and role = 'admin')
  );

-- agent_settings: client lê/escreve a própria
create policy "client manages own agent settings"
  on agent_settings for all
  using (
    exists (select 1 from user_profiles where user_id = auth.uid() and org_id = agent_settings.org_id)
  );

create policy "admin manages all agent settings"
  on agent_settings for all
  using (
    exists (select 1 from user_profiles where user_id = auth.uid() and role = 'admin')
  );

-- appointments
create policy "client reads own appointments"
  on appointments for select
  using (
    exists (select 1 from user_profiles where user_id = auth.uid() and org_id = appointments.org_id)
  );

create policy "admin reads all appointments"
  on appointments for select
  using (
    exists (select 1 from user_profiles where user_id = auth.uid() and role = 'admin')
  );

-- conversations
create policy "client reads own conversations"
  on conversations for select
  using (
    exists (select 1 from user_profiles where user_id = auth.uid() and org_id = conversations.org_id)
  );

create policy "admin reads all conversations"
  on conversations for select
  using (
    exists (select 1 from user_profiles where user_id = auth.uid() and role = 'admin')
  );

-- knowledge_items
create policy "client manages own knowledge"
  on knowledge_items for all
  using (
    exists (select 1 from user_profiles where user_id = auth.uid() and org_id = knowledge_items.org_id)
  );

create policy "admin manages all knowledge"
  on knowledge_items for all
  using (
    exists (select 1 from user_profiles where user_id = auth.uid() and role = 'admin')
  );

-- =============================================
-- ÍNDICES
-- =============================================
create index on appointments (org_id, scheduled_at desc);
create index on conversations (org_id, last_message_at desc);
create index on knowledge_items (org_id, active);
create index on user_profiles (user_id);

-- =============================================
-- FUNÇÃO: atualiza updated_at automaticamente
-- =============================================
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger organizations_updated_at before update on organizations
  for each row execute function update_updated_at();

create trigger agent_settings_updated_at before update on agent_settings
  for each row execute function update_updated_at();
