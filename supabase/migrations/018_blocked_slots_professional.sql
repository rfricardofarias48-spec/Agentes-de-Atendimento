-- =============================================
-- Bloqueios de agenda por profissional
-- =============================================

alter table blocked_slots
  add column if not exists professional_id uuid references professionals(id) on delete cascade;

create index if not exists blocked_slots_professional_id_idx on blocked_slots(professional_id);

comment on column blocked_slots.professional_id is 'Profissional específico afetado pelo bloqueio. Null = bloqueia a clínica inteira (todos os profissionais), comportamento padrão de antes desta coluna existir.';
