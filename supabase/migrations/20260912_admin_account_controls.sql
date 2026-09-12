-- Run once in the QM STORE Supabase SQL Editor.
-- Provides reversible customer suspension and admin-only order-history deletion.

alter table public.profiles
  add column if not exists is_suspended boolean not null default false,
  add column if not exists deleted_at timestamptz;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.admin_set_account_state(
  p_user_id uuid,
  p_action text
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Chỉ quản trị viên được phép quản lý tài khoản'; end if;
  if p_user_id = auth.uid() then raise exception 'Không thể khóa hoặc xóa chính tài khoản admin đang đăng nhập'; end if;
  if p_action = 'suspend' then
    update public.profiles set is_suspended = true where id = p_user_id;
  elsif p_action = 'activate' then
    update public.profiles set is_suspended = false, deleted_at = null where id = p_user_id;
  elsif p_action = 'delete' then
    update public.profiles set is_suspended = true, deleted_at = now() where id = p_user_id;
  else
    raise exception 'Thao tác không hợp lệ';
  end if;
end; $$;

grant execute on function public.admin_set_account_state(uuid, text) to authenticated;

create policy "orders: admin delete" on public.orders for delete using (public.is_admin());

-- A reviewed top-up is only an audit record. Deleting it never reverses wallet credit.
create policy "topups: admin delete reviewed" on public.wallet_topup_requests
for delete using (public.is_admin() and status in ('approved', 'rejected'));
