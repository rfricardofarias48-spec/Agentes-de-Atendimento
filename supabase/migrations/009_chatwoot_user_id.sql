-- Armazena o ID do usuário criado no Chatwoot via Platform API durante o setup.
-- Necessário para deletar o usuário ao remover a organização.
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS chatwoot_user_id INTEGER DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS chatwoot_login_email TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS chatwoot_login_password TEXT DEFAULT NULL;
