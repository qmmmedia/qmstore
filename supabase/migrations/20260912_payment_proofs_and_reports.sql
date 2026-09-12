-- Run once in the QM STORE Supabase SQL Editor.
-- Adds bank/QR configuration and private proof-of-payment uploads.

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create table if not exists public.store_settings (
  id smallint primary key default 1 check (id = 1),
  bank_code text,
  bank_account_number text,
  bank_account_name text,
  transfer_prefix text not null default 'QMSTORE',
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);

insert into public.store_settings (id) values (1) on conflict (id) do nothing;

alter table public.store_settings enable row level security;
drop policy if exists "settings: signed in users can read" on public.store_settings;
drop policy if exists "settings: admins manage" on public.store_settings;
create policy "settings: signed in users can read" on public.store_settings for select to authenticated using (true);
create policy "settings: admins manage" on public.store_settings for all to authenticated using (public.is_admin()) with check (public.is_admin());

alter table public.wallet_topup_requests add column if not exists proof_path text;

insert into storage.buckets (id, name, public)
values ('topup-proofs', 'topup-proofs', false)
on conflict (id) do nothing;

drop policy if exists "topup proofs: users read own or admin" on storage.objects;
drop policy if exists "topup proofs: users upload own" on storage.objects;
drop policy if exists "topup proofs: users delete own or admin" on storage.objects;
create policy "topup proofs: users read own or admin" on storage.objects for select to authenticated
using (bucket_id = 'topup-proofs' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
create policy "topup proofs: users upload own" on storage.objects for insert to authenticated
with check (bucket_id = 'topup-proofs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "topup proofs: users delete own or admin" on storage.objects for delete to authenticated
using (bucket_id = 'topup-proofs' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
