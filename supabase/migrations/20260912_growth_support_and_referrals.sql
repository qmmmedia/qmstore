-- Run once in the QM STORE Supabase SQL Editor.
-- Adds tickets, notifications, promotions, content, refunds, referrals and member tiers.

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

alter table public.profiles add column if not exists referral_code text;
alter table public.profiles add column if not exists referred_by uuid references public.profiles(id);
alter table public.profiles add column if not exists membership_tier text not null default 'Đồng';
update public.profiles set referral_code = 'QM' || upper(substr(replace(id::text, '-', ''), 1, 8)) where referral_code is null;
create unique index if not exists profiles_referral_code_unique on public.profiles (referral_code);

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
declare v_referrer uuid;
begin
  select id into v_referrer from public.profiles where upper(referral_code) = upper(trim(new.raw_user_meta_data ->> 'referral_code'));
  insert into public.profiles (id, full_name, email, referral_code, referred_by)
  values (new.id, new.raw_user_meta_data ->> 'full_name', new.email, 'QM' || upper(substr(replace(new.id::text, '-', ''), 1, 8)), v_referrer);
  return new;
end; $$;

alter table public.orders add column if not exists referral_commission_paid boolean not null default false;
alter table public.orders add column if not exists referral_commission_amount numeric(14,0) not null default 0;

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  subject text not null check (char_length(subject) between 3 and 160),
  message text not null check (char_length(message) between 3 and 5000),
  status text not null default 'open' check (status in ('open', 'answered', 'closed')),
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.support_tickets enable row level security;
drop policy if exists "tickets: owner or admin read" on public.support_tickets;
drop policy if exists "tickets: owner create" on public.support_tickets;
drop policy if exists "tickets: admin update" on public.support_tickets;
create policy "tickets: owner or admin read" on public.support_tickets for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "tickets: owner create" on public.support_tickets for insert to authenticated with check (user_id = auth.uid());
create policy "tickets: admin update" on public.support_tickets for update to authenticated using (public.is_admin()) with check (public.is_admin());

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  body text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.notifications enable row level security;
drop policy if exists "notifications: own read" on public.notifications;
drop policy if exists "notifications: own update" on public.notifications;
create policy "notifications: own read" on public.notifications for select to authenticated using (user_id = auth.uid());
create policy "notifications: own update" on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists public.content_posts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  excerpt text,
  content text,
  image_path text,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  author_id uuid references public.profiles(id)
);
alter table public.content_posts enable row level security;
drop policy if exists "posts: public published read" on public.content_posts;
drop policy if exists "posts: admin manage" on public.content_posts;
create policy "posts: public published read" on public.content_posts for select using (is_published or public.is_admin());
create policy "posts: admin manage" on public.content_posts for all to authenticated using (public.is_admin()) with check (public.is_admin());

insert into storage.buckets (id, name, public) values ('content-images', 'content-images', true) on conflict (id) do nothing;
drop policy if exists "content images: public read" on storage.objects;
drop policy if exists "content images: admin upload" on storage.objects;
drop policy if exists "content images: admin delete" on storage.objects;
create policy "content images: public read" on storage.objects for select using (bucket_id = 'content-images');
create policy "content images: admin upload" on storage.objects for insert to authenticated with check (bucket_id = 'content-images' and public.is_admin());
create policy "content images: admin delete" on storage.objects for delete to authenticated using (bucket_id = 'content-images' and public.is_admin());

drop policy if exists "coupons: admin manage" on public.coupons;
create policy "coupons: admin manage" on public.coupons for all to authenticated using (public.is_admin()) with check (public.is_admin());

create or replace function public.apply_referral_code(p_code text) returns void
language plpgsql security definer set search_path = public as $$
declare v_referrer uuid;
begin
  if auth.uid() is null then raise exception 'Bạn cần đăng nhập'; end if;
  select id into v_referrer from public.profiles where upper(referral_code) = upper(trim(p_code));
  if v_referrer is null then raise exception 'Mã giới thiệu không hợp lệ'; end if;
  if v_referrer = auth.uid() then raise exception 'Không thể dùng mã của chính bạn'; end if;
  update public.profiles set referred_by = v_referrer where id = auth.uid() and referred_by is null;
  if not found then raise exception 'Tài khoản này đã có người giới thiệu'; end if;
end; $$;
grant execute on function public.apply_referral_code(text) to authenticated;

create or replace function public.notify_order_and_rewards() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_referrer uuid; v_commission numeric(14,0); v_spend numeric(14,0);
begin
  if tg_op = 'INSERT' then
    insert into public.notifications (user_id, title, body) values (new.user_id, 'Đơn hàng đã tạo', 'Đơn #' || substr(new.id::text, 1, 8) || ' đang chờ xử lý.');
  elsif new.status is distinct from old.status then
    insert into public.notifications (user_id, title, body) values (new.user_id, 'Đơn hàng cập nhật', 'Đơn #' || substr(new.id::text, 1, 8) || ' đã chuyển sang: ' || new.status);
    if new.status = 'completed' and not new.referral_commission_paid then
      select referred_by into v_referrer from public.profiles where id = new.user_id;
      if v_referrer is not null then
        v_commission := round(new.total_amount * 0.05);
        update public.profiles set wallet_balance = wallet_balance + v_commission where id = v_referrer;
        insert into public.wallet_transactions (user_id, amount, type, description) values (v_referrer, v_commission, 'commission', 'Hoa hồng giới thiệu từ đơn #' || substr(new.id::text, 1, 8));
        update public.orders set referral_commission_paid = true, referral_commission_amount = v_commission where id = new.id;
      end if;
    end if;
    select coalesce(sum(total_amount), 0) into v_spend from public.orders where user_id = new.user_id and status = 'completed';
    update public.profiles set membership_tier = case when v_spend >= 10000000 then 'Kim cương' when v_spend >= 5000000 then 'Vàng' when v_spend >= 1000000 then 'Bạc' else 'Đồng' end where id = new.user_id;
  end if;
  return new;
end; $$;
drop trigger if exists orders_notify_and_rewards on public.orders;
create trigger orders_notify_and_rewards after insert or update of status on public.orders for each row execute procedure public.notify_order_and_rewards();

create or replace function public.notify_topup_status() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    insert into public.notifications (user_id, title, body) values (new.user_id, 'Yêu cầu nạp tiền cập nhật', case when new.status = 'approved' then 'Yêu cầu nạp ' || new.amount || 'đ đã được duyệt.' else 'Yêu cầu nạp tiền đã bị từ chối.' end);
  end if;
  return new;
end; $$;
drop trigger if exists topups_notify_status on public.wallet_topup_requests;
create trigger topups_notify_status after update of status on public.wallet_topup_requests for each row execute procedure public.notify_topup_status();

create or replace function public.admin_refund_order(p_order_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_order public.orders%rowtype; v_referrer uuid;
begin
  if not public.is_admin() then raise exception 'Chỉ quản trị viên có thể hoàn tiền'; end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Không tìm thấy đơn hàng'; end if;
  if v_order.status = 'refunded' then raise exception 'Đơn hàng đã hoàn tiền'; end if;
  update public.profiles set wallet_balance = wallet_balance + v_order.total_amount where id = v_order.user_id;
  insert into public.wallet_transactions (user_id, amount, type, description) values (v_order.user_id, v_order.total_amount, 'refund', 'Hoàn tiền đơn #' || substr(v_order.id::text, 1, 8));
  if v_order.referral_commission_paid and v_order.referral_commission_amount > 0 then
    select referred_by into v_referrer from public.profiles where id = v_order.user_id;
    if v_referrer is not null then
      update public.profiles set wallet_balance = greatest(0, wallet_balance - v_order.referral_commission_amount) where id = v_referrer;
      insert into public.wallet_transactions (user_id, amount, type, description) values (v_referrer, -v_order.referral_commission_amount, 'commission', 'Điều chỉnh hoa hồng do hoàn đơn #' || substr(v_order.id::text, 1, 8));
    end if;
  end if;
  update public.orders set status = 'refunded' where id = v_order.id;
end; $$;
grant execute on function public.admin_refund_order(uuid) to authenticated;
