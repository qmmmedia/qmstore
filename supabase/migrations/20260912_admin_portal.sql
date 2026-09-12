-- Run once in the QM STORE Supabase SQL Editor.
-- Lets admins view customer information needed for the admin portal.

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create policy "profiles: admin read all" on public.profiles for select
  using (public.is_admin());
