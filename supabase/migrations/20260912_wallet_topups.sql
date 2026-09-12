-- Run once in the QM STORE Supabase SQL Editor.
-- Customers create a request; only an admin can credit the wallet after verification.

create table if not exists public.wallet_topup_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount numeric(14,0) not null check (amount > 0),
  payment_reference text not null,
  note text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.wallet_topup_requests enable row level security;

create policy "topups: read own or admin" on public.wallet_topup_requests for select
  using (auth.uid() = user_id or (select role from public.profiles where id = auth.uid()) = 'admin');
create policy "topups: create own" on public.wallet_topup_requests for insert
  with check (auth.uid() = user_id and status = 'pending');

create or replace function public.review_wallet_topup_request(
  p_request_id uuid,
  p_status text
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_request public.wallet_topup_requests%rowtype;
begin
  if (select role from public.profiles where id = auth.uid()) <> 'admin' then
    raise exception 'Chỉ quản trị viên có thể duyệt nạp tiền';
  end if;
  if p_status not in ('approved', 'rejected') then
    raise exception 'Trạng thái không hợp lệ';
  end if;
  select * into v_request from public.wallet_topup_requests where id = p_request_id for update;
  if not found then raise exception 'Không tìm thấy yêu cầu'; end if;
  if v_request.status <> 'pending' then raise exception 'Yêu cầu này đã được xử lý'; end if;
  update public.wallet_topup_requests
    set status = p_status, reviewed_by = auth.uid(), reviewed_at = now()
    where id = p_request_id;
  if p_status = 'approved' then
    update public.profiles set wallet_balance = wallet_balance + v_request.amount where id = v_request.user_id;
    insert into public.wallet_transactions (user_id, amount, type, description)
      values (v_request.user_id, v_request.amount, 'topup', 'Nạp tiền đã duyệt: ' || v_request.payment_reference);
  end if;
end; $$;

grant execute on function public.review_wallet_topup_request(uuid, text) to authenticated;
