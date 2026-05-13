-- Rastreia quando os lembretes foram enviados (evita duplicatas)
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS reminder_24h_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS reminder_2h_sent_at  timestamptz;
