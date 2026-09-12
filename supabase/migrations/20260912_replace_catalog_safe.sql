-- Run once in the QM STORE Supabase SQL Editor.
-- Keeps historical records safe by hiding the old catalog rather than deleting it.

update public.services set is_active = false;

insert into public.services (name, category, description, price, unit, is_active, sort_order)
select v.name, v.category, v.description, v.price, v.unit, true, v.sort_order
from (values
  ('Tăng trưởng mạng xã hội', 'Social media', 'Xây cộng đồng, nội dung và quảng cáo hợp lệ cho kênh của khách hàng.', 900000::numeric, '/ gói', 1),
  ('Website các loại', 'Phát triển web', 'Landing page, website doanh nghiệp và cửa hàng trực tuyến.', 2500000::numeric, '/ dự án', 2),
  ('Chạy quảng cáo', 'Digital ads', 'Thiết lập, tối ưu và báo cáo quảng cáo theo chính sách nền tảng.', 500000::numeric, '/ chiến dịch', 3),
  ('Nội dung & video', 'Content', 'Kế hoạch nội dung, thiết kế và video ngắn cho thương hiệu.', 750000::numeric, '/ gói', 4),
  ('Tự động hóa kênh sở hữu', 'Automation', 'Chatbot và quy trình tự động cho fanpage, website hoặc CRM của khách.', 1200000::numeric, '/ gói', 5),
  ('Tư vấn chiến lược số', 'Strategy', 'Đánh giá kênh và xây lộ trình tăng trưởng bền vững.', 600000::numeric, '/ buổi', 6)
) as v(name, category, description, price, unit, sort_order)
where not exists (select 1 from public.services s where s.name = v.name);

-- A three-level example for the social-growth service.
insert into public.service_items (service_id, title, description, sort_order)
select s.id, v.title, v.description, v.sort_order
from public.services s
cross join (values
  ('Facebook', 'Nội dung, cộng đồng và quảng cáo Facebook.', 1),
  ('TikTok', 'Nội dung video ngắn và quảng cáo TikTok.', 2),
  ('Instagram', 'Nội dung hình ảnh và xây dựng cộng đồng Instagram.', 3)
) as v(title, description, sort_order)
where s.name = 'Tăng trưởng mạng xã hội'
  and not exists (select 1 from public.service_items i where i.service_id = s.id and i.title = v.title and i.parent_id is null);

insert into public.service_items (service_id, parent_id, title, description, sort_order)
select s.id, parent.id, v.title, v.description, v.sort_order
from public.services s
join public.service_items parent on parent.service_id = s.id and parent.title = 'Facebook' and parent.parent_id is null
cross join (values
  ('Kế hoạch nội dung', 'Lịch nội dung và định hướng bài đăng theo mục tiêu.', 1),
  ('Quản trị cộng đồng', 'Theo dõi phản hồi và chăm sóc cộng đồng minh bạch.', 2),
  ('Quảng cáo theo chính sách', 'Thiết lập chiến dịch quảng cáo phù hợp nền tảng.', 3)
) as v(title, description, sort_order)
where s.name = 'Tăng trưởng mạng xã hội'
  and not exists (select 1 from public.service_items i where i.service_id = s.id and i.title = v.title and i.parent_id = parent.id);

