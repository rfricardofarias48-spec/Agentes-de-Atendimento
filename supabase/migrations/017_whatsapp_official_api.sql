-- =============================================
-- Suporte dual: Evolution API (hoje) + WhatsApp Business API
-- oficial da Meta (quando migrado). Credenciais da API oficial
-- são globais (env vars: META_ACCESS_TOKEN, META_GRAPH_API_VERSION,
-- WHATSAPP_VERIFY_TOKEN) — não ficam por organização, pra migrar
-- um cliente exigir só o Phone Number ID.
-- =============================================

alter table organizations
  add column if not exists whatsapp_provider text not null default 'evolution',
  add column if not exists whatsapp_phone_number_id text,
  add column if not exists whatsapp_business_account_id text;

create unique index if not exists organizations_whatsapp_phone_number_id_idx
  on organizations (whatsapp_phone_number_id) where whatsapp_phone_number_id is not null;

comment on column organizations.whatsapp_provider is 'Canal usado pra mandar/receber WhatsApp: evolution (não-oficial, hoje) ou official (Meta Cloud API, quando migrado). Credenciais da API oficial são globais (env vars), não por org.';
comment on column organizations.whatsapp_phone_number_id is 'Phone Number ID da Meta Cloud API — único campo que o admin precisa preencher pra migrar essa org pra API oficial.';
comment on column organizations.whatsapp_business_account_id is 'WABA ID — preenchido automaticamente ao validar o phone_number_id via Graph API, não digitado manualmente.';
