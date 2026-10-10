# ComputeCH — cửa hàng linh kiện 3D

Website tiếng Việt có 29 sản phẩm mẫu, ảnh sản phẩm, mô hình 3D, giỏ hàng, đặt hàng COD, khu vực quản trị, quản lý kho và thống kê doanh thu. Dự án chạy ở máy cá nhân bằng Node.js hoặc triển khai lên Cloudflare Pages qua GitHub.

## Chạy trên máy với VS Code

1. Cài Node.js 18 trở lên.
2. Mở thư mục dự án `computech-store` trong Visual Studio Code.
3. Chọn **Terminal → New Terminal**.
4. Nhập `node server.js` rồi nhấn Enter.
5. Mở `http://localhost:3000` trong trình duyệt.
6. Mở trang quản trị ở `http://localhost:3000/#admin`. Tài khoản demo cục bộ là `admin`; mật khẩu là `change-this-before-demo`.

Máy chủ cục bộ lưu sản phẩm và đơn hàng trong `data/store.json`. Tệp này được bỏ qua khi tải lên GitHub để không đưa dữ liệu khách hàng lên kho mã nguồn.

## Đưa lên Cloudflare Pages bằng GitHub

Repo hiện dùng: `https://github.com/thanhtrung16042008abc-droid/trung`, nhánh `main`.

1. Trong Cloudflare, mở **Workers & Pages** → **Create application** → **Pages** → **Connect to Git**.
2. Kết nối GitHub nếu Cloudflare hỏi, rồi chọn repo `trung` và nhánh `main`.
3. Cấu hình bản dựng:
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Root directory: để trống
4. Tạo dự án **D1 SQL Database** trong Cloudflare, ví dụ đặt tên `computech-store`.
5. Mở dự án Pages → **Settings** → **Functions** → **D1 database bindings**. Thêm binding có tên biến `DB` và chọn database vừa tạo. Lưu rồi chạy lại deployment.
6. Trong **Settings → Variables and Secrets**, thêm các biến môi trường:
   - `ADMIN_USER`: tên đăng nhập quản trị do bạn tự chọn.
   - `ADMIN_PASSWORD`: mật khẩu quản trị mạnh, riêng tư.
   - `SESSION_SECRET`: chuỗi ngẫu nhiên dài, tối thiểu 32 ký tự.
   - Có thể thêm `VNPAY_TMN_CODE` và `VNPAY_HASH_SECRET` khi VNPay cấp thông tin merchant.
7. Lưu Secrets và tạo deployment mới. Khi mở trang lần đầu, API sẽ tự tạo bảng và nạp 29 sản phẩm mẫu vào D1.

Các Secrets chỉ nhập trong trang cài đặt Cloudflare; không ghi chúng vào GitHub, mã trình duyệt hoặc gửi trong cuộc trò chuyện này. Nếu chưa gắn D1, API sẽ báo cần cấu hình D1; website không tự giả vờ lưu đơn hàng thành công.

## Thanh toán

COD dùng được sau khi D1 hoạt động. VNPay chỉ bật khi đã khai báo `VNPAY_TMN_CODE` và `VNPAY_HASH_SECRET` trong Cloudflare Secrets. URL trả kết quả mặc định tự lấy tên miền đang chạy; trong cấu hình merchant, dùng `https://TEN-MIEN/api/payment/vnpay-return` làm Return URL và `https://TEN-MIEN/api/payment/vnpay-ipn` làm IPN URL. Thử nghiệm và thanh toán tiền thật đều cần tài khoản merchant được VNPay cấp quyền và thông tin khóa tương ứng. Không đưa thông tin thẻ vào trang này; khách được chuyển sang cổng VNPay.

## Hình ảnh và chuyển động

Hình ảnh sản phẩm lấy từ nguồn ảnh hãng/nhà bán; mô hình xoay 3D chi tiết tải Three.js qua CDN. Trang đầu, hiệu ứng cuộn, hover và thẻ thanh toán 3D được tạo bằng giao diện web. Cần internet để tải font, ảnh, mô hình Three.js và cổng VNPay.
