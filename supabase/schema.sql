-- Run this file in Supabase SQL Editor before using the app with real data.
create type public.user_role as enum ('user', 'admin');
create type public.order_status as enum ('pending', 'processing', 'completed', 'failed', 'refunded');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  role public.user_role not null default 'user',
  wallet_balance numeric(14,0) not null default 0,
  created_at timestamptz not null default now()
);
create table public.services (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,
  description text,
  price numeric(14,0) not null check (price >= 0),
  unit text default '/ gói',
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  service_id uuid not null references public.services(id),
  quantity integer not null check (quantity > 0),
  unit_price numeric(14,0) not null,
  discount_amount numeric(14,0) not null default 0,
  total_amount numeric(14,0) not null,
  coupon_code text,
  note text,
  status public.order_status not null default 'pending',
  created_at timestamptz not null default now()
);
create table public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount numeric(14,0) not null,
  type text not null check (type in ('topup','payment','refund','commission','adjustment')),
  description text,
  created_at timestamptz not null default now()
);
create table public.coupons (
  code text primary key,
  discount_percent numeric(5,2),
  discount_amount numeric(14,0),
  max_discount numeric(14,0),
  min_order_amount numeric(14,0) not null default 0,
  is_active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.services enable row level security;
alter table public.orders enable row level security;
alter table public.wallet_transactions enable row level security;
alter table public.coupons enable row level security;

create policy "profiles: read own" on public.profiles for select using (auth.uid() = id);
create policy "profiles: update own" on public.profiles for update using (auth.uid() = id);
create policy "services: public read active" on public.services for select using (is_active = true or (select role from public.profiles where id = auth.uid()) = 'admin');
create policy "services: admin write" on public.services for all using ((select role from public.profiles where id = auth.uid()) = 'admin') with check ((select role from public.profiles where id = auth.uid()) = 'admin');
create policy "orders: read own" on public.orders for select using (auth.uid() = user_id or (select role from public.profiles where id = auth.uid()) = 'admin');
create policy "orders: insert own" on public.orders for insert with check (auth.uid() = user_id);
create policy "wallet: read own" on public.wallet_transactions for select using (auth.uid() = user_id or (select role from public.profiles where id = auth.uid()) = 'admin');
create policy "coupons: read active" on public.coupons for select using (is_active = true);

-- A user may only edit their own display name. Wallet balance is never writable from the browser.
revoke update on public.profiles from anon, authenticated;
grant update(full_name) on public.profiles to authenticated;

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email) values (new.id, new.raw_user_meta_data ->> 'full_name', new.email);
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

-- This is the only customer-facing path that creates an order. It reads the current service
-- price and wallet balance inside one database transaction instead of trusting browser values.
create or replace function public.create_order(
  p_service_id uuid,
  p_quantity integer,
  p_note text default null,
  p_coupon_code text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_price numeric(14,0);
  v_subtotal numeric(14,0);
  v_discount numeric(14,0) := 0;
  v_total numeric(14,0);
  v_balance numeric(14,0);
  v_order_id uuid;
  v_coupon public.coupons%rowtype;
begin
  if auth.uid() is null then raise exception 'Bạn cần đăng nhập để tạo đơn'; end if;
  if p_quantity is null or p_quantity < 1 then raise exception 'Số lượng không hợp lệ'; end if;
  select price into v_price from public.services where id = p_service_id and is_active = true;
  if v_price is null then raise exception 'Dịch vụ không tồn tại hoặc đã tạm ngừng'; end if;
  v_subtotal := v_price * p_quantity;
  if nullif(trim(p_coupon_code), '') is not null then
    select * into v_coupon from public.coupons where code = upper(trim(p_coupon_code)) and is_active = true
      and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at >= now());
    if not found then raise exception 'Mã giảm giá không hợp lệ'; end if;
    if v_subtotal < v_coupon.min_order_amount then raise exception 'Đơn hàng chưa đạt giá trị tối thiểu của mã'; end if;
    v_discount := coalesce(v_coupon.discount_amount, 0) + round(v_subtotal * coalesce(v_coupon.discount_percent, 0) / 100);
    if v_coupon.max_discount is not null then v_discount := least(v_discount, v_coupon.max_discount); end if;
    v_discount := least(v_discount, v_subtotal);
  end if;
  v_total := v_subtotal - v_discount;
  select wallet_balance into v_balance from public.profiles where id = auth.uid() for update;
  if v_balance is null then raise exception 'Không tìm thấy hồ sơ người dùng'; end if;
  if v_balance < v_total then raise exception 'Số dư chưa đủ'; end if;
  update public.profiles set wallet_balance = wallet_balance - v_total where id = auth.uid();
  insert into public.orders (user_id, service_id, quantity, unit_price, discount_amount, total_amount, coupon_code, note)
    values (auth.uid(), p_service_id, p_quantity, v_price, v_discount, v_total, nullif(upper(trim(p_coupon_code)), ''), p_note) returning id into v_order_id;
  insert into public.wallet_transactions (user_id, amount, type, description)
    values (auth.uid(), -v_total, 'payment', 'Thanh toán đơn hàng ' || v_order_id);
  return v_order_id;
end; $$;
revoke execute on function public.create_order(uuid, integer, text, text) from public;
grant execute on function public.create_order(uuid, integer, text, text) to authenticated;

insert into public.services (name, category, description, price, unit, sort_order) values
('Thiết kế website', 'Phát triển web', 'Website thương hiệu, landing page và tối ưu chuyển đổi.', 2500000, '/ dự án', 1),
('Quảng cáo số', 'Digital ads', 'Thiết lập, tối ưu và báo cáo hiệu quả chiến dịch.', 200000, '/ chiến dịch', 2),
('Quản trị nội dung', 'Content', 'Lập kế hoạch và sản xuất nội dung cho thương hiệu.', 850000, '/ gói', 3),
('Tư vấn thương hiệu', 'Strategy', 'Định vị, thông điệp và lộ trình phát triển kênh số.', 500000, '/ buổi', 4);
insert into public.coupons (code, discount_percent, max_discount, min_order_amount) values ('QM10', 10, 50000, 100000);

-- After registering your first account, promote it manually once:
-- update public.profiles set role = 'admin' where email = 'your-admin@email.com';

-- Backfill profiles when Auth users existed before this schema was installed.
insert into public.profiles (id, full_name, email)
select id, raw_user_meta_data ->> 'full_name', email
from auth.users
on conflict (id) do nothing;
