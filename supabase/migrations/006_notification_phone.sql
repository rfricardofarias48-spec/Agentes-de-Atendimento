-- Número do profissional para receber avisos de escalada
ALTER TABLE agent_settings
  ADD COLUMN IF NOT EXISTS notification_phone text;
