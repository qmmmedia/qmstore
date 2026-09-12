-- Run once in the QM STORE Supabase SQL Editor.
-- Adds pricing to child packages and preserves which package was ordered.

alter table public.service_items
  add column if not exists price numeric(14,0) not null default 0 check (price >= 0),
  add column if not exists unit text not null default '/ gói';

alter table public.orders
  add column if not exists service_item_id uuid references public.service_items(id);

create or replace function public.create_order(
  p_service_id uuid,
  p_quantity integer,
  p_note text default null,
  p_coupon_code text default null,
  p_service_item_id uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_price numeric(14,0);
  v_subtotal numeric(14,0);
  v_discount numeric(14,0) := 0;
  v_total numeric(14,0);
  v_balance numeric(14,0);
  v_order_id uuid;
  v_coupon public.coupons%rowtype;
  v_item public.service_items%rowtype;
begin
  if auth.uid() is null then raise exception 'Bạn cần đăng nhập để tạo đơn'; end if;
  if p_quantity is null or p_quantity < 1 then raise exception 'Số lượng không hợp lệ'; end if;
  select price into v_price from public.services where id = p_service_id and is_active = true;
  if v_price is null then raise exception 'Dịch vụ không tồn tại hoặc đã tạm ngừng'; end if;
  if p_service_item_id is not null then
    select * into v_item from public.service_items where id = p_service_item_id and service_id = p_service_id;
    if not found then raise exception 'Gói dịch vụ không hợp lệ'; end if;
    if v_item.price > 0 then v_price := v_item.price; end if;
  end if;
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
  insert into public.orders (user_id, service_id, service_item_id, quantity, unit_price, discount_amount, total_amount, coupon_code, note)
    values (auth.uid(), p_service_id, p_service_item_id, p_quantity, v_price, v_discount, v_total, nullif(upper(trim(p_coupon_code)), ''), p_note) returning id into v_order_id;
  insert into public.wallet_transactions (user_id, amount, type, description)
    values (auth.uid(), -v_total, 'payment', 'Thanh toán đơn hàng ' || v_order_id);
  return v_order_id;
end; $$;

grant execute on function public.create_order(uuid, integer, text, text, uuid) to authenticated;

