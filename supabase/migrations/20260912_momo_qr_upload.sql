alter table public.store_settings add column if not exists momo_qr_path text;

insert into storage.buckets (id, name, public)
values ('payment-assets', 'payment-assets', true)
on conflict (id) do update set public = true;

drop policy if exists "payment assets: public read" on storage.objects;
drop policy if exists "payment assets: admins manage" on storage.objects;
create policy "payment assets: public read" on storage.objects for select
using (bucket_id = 'payment-assets');
create policy "payment assets: admins manage" on storage.objects for all to authenticated
using (bucket_id = 'payment-assets' and public.is_admin())
with check (bucket_id = 'payment-assets' and public.is_admin());
