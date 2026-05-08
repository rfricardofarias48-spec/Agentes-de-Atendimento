-- =============================================
-- Fix: add INSERT/UPDATE/DELETE policies for
-- appointments and conversations tables.
-- Previously only SELECT was allowed for clients.
-- =============================================

-- Drop the read-only client policy on appointments
drop policy if exists "client reads own appointments" on appointments;
drop policy if exists "admin reads all appointments" on appointments;

-- Replace with full-access policies
create policy "client manages own appointments"
  on appointments for all
  using (
    exists (select 1 from user_profiles where user_id = auth.uid() and org_id = appointments.org_id)
  )
  with check (
    exists (select 1 from user_profiles where user_id = auth.uid() and org_id = appointments.org_id)
  );

create policy "admin manages all appointments"
  on appointments for all
  using (
    exists (select 1 from user_profiles where user_id = auth.uid() and role = 'admin')
  )
  with check (
    exists (select 1 from user_profiles where user_id = auth.uid() and role = 'admin')
  );

-- Also fix conversations (same issue — clients can only read, not write)
drop policy if exists "client reads own conversations" on conversations;
drop policy if exists "admin reads all conversations" on conversations;

create policy "client manages own conversations"
  on conversations for all
  using (
    exists (select 1 from user_profiles where user_id = auth.uid() and org_id = conversations.org_id)
  )
  with check (
    exists (select 1 from user_profiles where user_id = auth.uid() and org_id = conversations.org_id)
  );

create policy "admin manages all conversations"
  on conversations for all
  using (
    exists (select 1 from user_profiles where user_id = auth.uid() and role = 'admin')
  )
  with check (
    exists (select 1 from user_profiles where user_id = auth.uid() and role = 'admin')
  );
