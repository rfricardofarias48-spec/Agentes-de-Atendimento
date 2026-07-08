-- =============================================
-- Reverte o pivot de recrutamento: remove todas as
-- tabelas e o bucket criados para o fluxo de vagas/
-- candidatos/entrevistas. App volta a ser 100% clínica.
-- =============================================

drop table if exists interview_bookings cascade;
drop table if exists recruitment_sessions cascade;
drop table if exists recruiter_availability cascade;
drop table if exists interviews cascade;
drop table if exists candidates cascade;
drop table if exists jobs cascade;
drop table if exists niches cascade;

-- Nota: o bucket de storage "resumes" (currículos em PDF) não pode ser
-- removido via SQL direto (storage.protect_delete bloqueia DELETE em
-- storage.objects/buckets). Remover manualmente pelo painel do Supabase
-- (Storage → resumes → Delete bucket), se ainda existir.
drop policy if exists "resumes_service_all" on storage.objects;
