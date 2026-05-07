-- Campos de integração por organização
alter table organizations
  add column if not exists evolution_instance text,
  add column if not exists evolution_token text,
  add column if not exists chatwoot_account_id integer,
  add column if not exists chatwoot_inbox_id integer;
