-- Run once after 20260912_service_items.sql.
-- Allows service items to contain child items, creating a nested category tree.

alter table public.service_items
  add column if not exists parent_id uuid references public.service_items(id) on delete cascade;

create index if not exists service_items_service_parent_idx
  on public.service_items(service_id, parent_id, sort_order);

create or replace function public.ensure_service_item_parent_matches_service()
returns trigger language plpgsql as $$
begin
  if new.parent_id is not null and not exists (
    select 1 from public.service_items parent
    where parent.id = new.parent_id and parent.service_id = new.service_id
  ) then
    raise exception 'Danh mục cha phải thuộc cùng một dịch vụ';
  end if;
  return new;
end;
$$;

drop trigger if exists service_item_parent_matches_service on public.service_items;
create trigger service_item_parent_matches_service
before insert or update of service_id, parent_id on public.service_items
for each row execute procedure public.ensure_service_item_parent_matches_service();
