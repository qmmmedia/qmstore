# Thiết lập thanh toán QM STORE

## 1. MB Bank qua VietQR — đã có sẵn

1. Đăng nhập tài khoản **admin** vào QM STORE.
2. Vào **Quản trị → Cấu hình thanh toán**.
3. Điền mã ngân hàng `MB`, số tài khoản, tên chủ tài khoản và tiền tố nội dung chuyển khoản.
4. Bấm **Lưu cấu hình thanh toán**. Khách sẽ thấy mã QR tại **Ví của tôi → Nạp tiền**.

Đây là luồng **chuyển khoản có biên lai và admin duyệt**. Nó không tự đọc lịch sử giao dịch MB Bank; một tài khoản MB Bank cá nhân thông thường không cung cấp API merchant công khai cho website.

## 2. MoMo bằng Payment Link — cấu hình ngay được

1. Chạy migration `20260912_momo_payment_option.sql` trong Supabase SQL Editor.
2. Đăng ký/đăng nhập cổng merchant MoMo và tạo Payment Link theo tài khoản doanh nghiệp của bạn.
3. Trong **Quản trị → Cấu hình thanh toán**, bật MoMo, dán Payment Link, viết hướng dẫn ngắn rồi lưu.
4. Khách mở **Ví của tôi → Nạp tiền → Mở MoMo**, thanh toán, sau đó gửi mã giao dịch/biên lai để admin duyệt.

Payment Link chỉ là luồng thủ công có hướng dẫn. Đừng dán `accessKey` hoặc `secretKey` vào trường cấu hình hay GitHub.

## 3. MoMo tự động — cần thông tin merchant

MoMo yêu cầu server của merchant gọi `POST /v2/gateway/api/create`, tạo chữ ký HMAC phía server, và nhận IPN để xác minh kết quả. `requestId` phải là duy nhất để kiểm soát idempotency. Số tiền cho One-Time Payment nằm trong phạm vi 1.000–50.000.000 VND. Xem tài liệu chính thức của MoMo: [One-Time Payments](https://developers.momo.vn/v3/docs/payment/api/wallet/onetime/) và [Collection Link](https://developers.momo.vn/v3/docs/payment/api/collection-link/).

Khi MoMo cấp thông tin sandbox/production, cần các giá trị sau:

- `partnerCode`, `accessKey`, `secretKey`, `storeId`
- URL website đã deploy (redirect URL)
- URL IPN công khai HTTPS
- tài khoản merchant đã được duyệt cho môi trường production

Đặt secrets trong **Supabase Edge Functions Secrets** hoặc **Vercel Environment Variables**, không đặt ở trình duyệt. Sau đó xây Edge Function để: tạo đơn thanh toán, kiểm tra chữ ký IPN, đối chiếu `orderId`/`amount`, và chỉ cộng ví một lần khi giao dịch hợp lệ.

## 4. MB Bank tự động

Muốn tự động cộng tiền MB Bank cũng cần một cổng/API có hợp đồng merchant hoặc dịch vụ đối soát được ngân hàng cho phép. Luồng an toàn tương tự: webhook server-side, xác minh chữ ký + mã giao dịch độc nhất, rồi gọi RPC cộng ví trong database. Không dùng scraping Internet Banking hoặc đưa thông tin đăng nhập ngân hàng cho website.
