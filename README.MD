Miễn trừ trách nhiệm:
```text
Dự án có sử dụng - ZCA-JS
Là một thư viện cung cấp các API (unofficial) hỗ trợ bạn xây dựng 1 bot chat Zalo bằng chính tài khoản cá nhân của bạn.

Lưu ý: việc sử dụng thư viện này đồng nghĩa với việc bạn đang làm trái với chính sách của Zalo và nó có thể khiến cho tài khoản của bạn bị vô hiệu hóa. Chúng tôi sẽ không chịu trách nhiệm nếu điều đó xảy ra, vậy nên hãy cân nhắc trước khi sử dụng.
```

A- CÀI ĐẶT

1. Tải toàn bộ mã nguồn về để trong thư mục (zalo-api-server)

2. Mở Terminal tại thư mục (zalo-api-server) và chạy lệnh:
```CLI
Đổi pass mặc định trong file routes-ui.js
User:admin / Pass: 123456 / 
chạy lệnh sau để build
docker build -t zalo-server .
```
3. Sau khi build xong, bạn có thể chạy container bằng lệnh:
```CLI
docker-compose up -d
```
4. Truy cập localhost:3000 để sử dụng

5. Nếu chạy Docker trên NAS hay VPS thì đặt biến môi trường:
CONTAINER_IP=xxx.xxx.xxx.xxx
CONTAINER_PORT=yyyy
và ánh xạ port "yyyy:3000"


B- SỬ DỤNG

1. Cập nhật Webhook (POST) - copy từ n8n
2. Bấm Đăng nhập qua QR Code
3. Thêm Proxy nếu cần và Bấm đăng nhập
4. Dùng Zalo quét mã QR hiện ra để đăng nhập
5. Sau khi đăng nhập thành công, mọi sự kiện sẽ được đẩy về Webhook
6. Đọc tài liệu API để biết cách gửi Message, Photo, Sticker,...

![Image](https://github.com/user-attachments/assets/ab3eb30e-681a-4c7f-a199-148f62b5eae9)
![Image](https://github.com/user-attachments/assets/f448ae38-c17a-4263-b121-e878b922309e)
