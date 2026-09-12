-- Run this once in the SQL Editor of the QM STORE Supabase project.
-- Adds small service items (included work scopes) under each main service.

create table public.service_items (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete cascade,
  title text not null check (char_length(trim(title)) > 0),
  description text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.service_items enable row level security;

create policy "service items: read active service"
on public.service_items for select
using (exists (
  select 1 from public.services
  where services.id = service_items.service_id and services.is_active = true
));

create policy "service items: admin write"
on public.service_items for all
using ((select role from public.profiles where id = auth.uid()) = 'admin')
with check ((select role from public.profiles where id = auth.uid()) = 'admin');

