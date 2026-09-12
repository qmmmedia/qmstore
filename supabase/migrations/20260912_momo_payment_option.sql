-- Public configuration only. Never put MoMo accessKey/secretKey in this table.
alter table public.store_settings
  add column if not exists momo_enabled boolean not null default false,
  add column if not exists momo_payment_url text,
  add column if not exists momo_instructions text;

comment on column public.store_settings.momo_payment_url is
  'A public MoMo payment link. API secrets belong only in server-side Edge Function/Vercel secrets.';
