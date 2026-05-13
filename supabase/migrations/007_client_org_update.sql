-- Adiciona coluna phone na tabela organizations
alter table organizations
  add column if not exists phone text;

-- Permite que o client atualize os dados básicos da própria organização
create policy "client updates own org"
  on organizations for update
  using (
    exists (select 1 from user_profiles where user_id = auth.uid() and org_id = organizations.id)
  );
