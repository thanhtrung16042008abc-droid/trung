# ComputeCH | 3D Computer Store

Đồ án cửa hàng linh kiện máy tính bằng tiếng Việt, có sẵn 29 sản phẩm mẫu thuộc nhiều nhóm linh kiện và thiết bị. Giao diện có hiệu ứng chuyển động khi cuộn, hiệu ứng hover và hình ảnh 3D tại bước thanh toán; cài đặt giảm chuyển động của hệ điều hành được tôn trọng. Chạy trực tiếp bằng Node.js (không cần cài thư viện ngoài), mở thư mục này trong Visual Studio Code.

## Chạy nhanh

1. Cài Node.js 18 trở lên.
2. Giải nén ZIP và mở thư mục `computech-store` bằng VS Code.
3. Chọn **Terminal → New Terminal** rồi chạy `node server.js`.
4. Truy cập http://localhost:3000.
5. Trang quản trị: http://localhost:3000/#admin (mặc định `admin` / `change-this-before-demo`).

Có thể chạy qua **Terminal → Run Build Task** (Ctrl+Shift+B), nhờ task đã thiết lập trong `.vscode/tasks.json`. Không cần `npm install`.

Đổi mật khẩu admin trước khi trình diễn. Dữ liệu đơn hàng và sản phẩm được lưu trong `data/store.json`.

## Thanh toán

COD hoạt động ngay. Tích hợp VNPay có sẵn theo sandbox. Để cấu hình, sao chép `.env.example` thành `.env`, rồi điền `VNPAY_TMN_CODE`, `VNPAY_HASH_SECRET`, `VNPAY_RETURN_URL`; khởi động lại server. Trong cấu hình merchant VNPay, đặt IPN URL thành `https://<ten-mien>/api/payment/vnpay-ipn`. IPN kiểm tra chữ ký, mã đơn và số tiền trước khi xác nhận giao dịch; return URL chỉ báo kết quả cho người mua. Khi chạy trên localhost, VNPay không thể gọi ngược IPN, nên cần URL HTTPS công khai (hoặc tunnel được chấp nhận) để thử trọn luồng. Khi chưa cấu hình merchant, checkout thông báo rõ và không giả vờ rằng giao dịch đã được xác nhận. Không đưa secret vào mã phía trình duyệt. Thanh toán tiền thật cần tài khoản merchant được VNPay cấp quyền và cấu hình production riêng.

## Ghi chú

Ảnh chụp sản phẩm thật được tải từ các CDN của hãng/nhà bán, nên cần internet. Nếu một nguồn ảnh không phản hồi, hình vector dự phòng sẽ hiện thay thế. Mô hình PC ở trang đầu chạy bằng CSS nên vẫn chuyển động khi CDN không tải; mô hình xoay chi tiết trong cửa sổ sản phẩm dùng Three.js và cần internet. Trang thanh toán có thẻ 3D trang trí bằng CSS; đây chỉ là hình ảnh giao diện, không thu thập thông tin thẻ. Thanh toán VNPay được chuyển qua cổng VNPay khi merchant đã cấu hình. Khi ngoại tuyến, cửa hàng vẫn hiển thị và mua hàng bằng COD được.

Đăng nhập admin được kiểm tra ở server, cookie HttpOnly. Đây là nền tảng demo cục bộ; trước khi triển khai internet cần HTTPS, lưu trữ dữ liệu bền vững (SQLite/MySQL), sao lưu và rà soát bảo mật.
