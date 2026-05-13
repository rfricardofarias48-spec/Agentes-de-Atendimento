-- Duração padrão do atendimento por org (em minutos)
ALTER TABLE agent_settings
  ADD COLUMN IF NOT EXISTS appointment_duration integer NOT NULL DEFAULT 60;

-- Duração salva por agendamento (preserva histórico quando a regra muda)
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS duration_minutes integer NOT NULL DEFAULT 60;
