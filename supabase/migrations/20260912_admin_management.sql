-- Run this once in the SQL Editor of the QM STORE Supabase project.
-- It enables status changes from the Admin dashboard and adds more services.

create policy "orders: admin update"
on public.orders for update
using ((select role from public.profiles where id = auth.uid()) = 'admin')
with check ((select role from public.profiles where id = auth.uid()) = 'admin');

insert into public.services (name, category, description, price, unit, sort_order)
select v.name, v.category, v.description, v.price, v.unit, v.sort_order
from (values
  ('SEO & tối ưu tìm kiếm', 'SEO', 'Nghiên cứu từ khóa, tối ưu kỹ thuật và báo cáo tăng trưởng.', 1500000::numeric, '/ tháng', 5),
  ('Thiết kế landing page', 'Phát triển web', 'Trang đích tập trung chuyển đổi cho chiến dịch và sản phẩm.', 1200000::numeric, '/ trang', 6),
  ('Thiết kế nhận diện thương hiệu', 'Branding', 'Logo, màu sắc và bộ nhận diện nhất quán cho thương hiệu.', 1800000::numeric, '/ gói', 7),
  ('Quản trị mạng xã hội', 'Social media', 'Lập lịch, đăng bài và theo dõi tương tác Facebook, TikTok.', 1200000::numeric, '/ tháng', 8),
  ('Sản xuất video ngắn', 'Video', 'Kịch bản, dựng video Reels/TikTok phù hợp mục tiêu truyền thông.', 700000::numeric, '/ video', 9),
  ('Audit marketing', 'Strategy', 'Đánh giá kênh hiện tại và đề xuất kế hoạch cải thiện rõ ràng.', 900000::numeric, '/ buổi', 10)
) as v(name, category, description, price, unit, sort_order)
where not exists (select 1 from public.services s where s.name = v.name);

