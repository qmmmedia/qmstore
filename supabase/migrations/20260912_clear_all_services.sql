-- Permanent catalog reset. Run only when you want to remove every service and its nested categories.
-- This protects order history: it will stop if any order exists.

do $$
begin
  if exists (select 1 from public.orders) then
    raise exception 'Không thể xóa toàn bộ dịch vụ vì đã có đơn hàng. Hãy giữ/ẩn các dịch vụ đã có đơn để bảo toàn lịch sử.';
  end if;

  delete from public.services;
end;
$$;

