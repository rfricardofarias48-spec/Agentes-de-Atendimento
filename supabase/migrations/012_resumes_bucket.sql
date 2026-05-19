-- =============================================
-- Storage: bucket resumes para currículos
-- =============================================

-- Cria o bucket (se ainda não existir)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'resumes',
  'resumes',
  false,
  10485760,   -- 10 MB
  array['application/pdf', 'application/octet-stream']
)
on conflict (id) do nothing;

-- Política: service_role pode fazer tudo (leitura, escrita, remoção)
-- O frontend usa URLs assinadas (createSignedUrl) para leitura segura

create policy "resumes_service_all" on storage.objects
  for all
  using (bucket_id = 'resumes');
