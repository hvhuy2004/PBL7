# Hướng dẫn đóng gói Docker và deploy AgileAI

Tài liệu này mô tả cách đóng gói và triển khai hệ thống AgileAI ra môi trường Internet theo hướng dễ làm, phù hợp đồ án tốt nghiệp.

## 1. Kiến trúc triển khai

Hệ thống hiện có 3 phần chính:

- `FE`: React + Vite
- `BE`: FastAPI + Uvicorn
- `DB`: MySQL

Luồng chạy khi deploy:

1. Trình duyệt tải giao diện từ FE.
2. FE gọi API sang BE qua `VITE_API_BASE`.
3. BE đọc/ghi dữ liệu vào MySQL qua `DATABASE_URL`.
4. Các tính năng AI gọi ra dịch vụ bên ngoài từ backend.

## 2. Cách deploy khuyến nghị

Với đồ án này, cách dễ quản lý nhất là:

- 1 VPS Ubuntu
- 1 container cho BE
- 1 container cho FE
- 1 container cho MySQL
- 1 reverse proxy như Nginx để public ra Internet

Cách này phù hợp vì:

- dễ debug hơn serverless
- giữ được upload file, WebSocket và API AI
- đơn giản để demo và bảo vệ

## 3. Biến môi trường cần có

### Backend

Tạo file `.env` cho BE, ví dụ:

```env
DATABASE_URL=mysql+pymysql://root:your_password@mysql:3306/agile_ai_management
SECRET_KEY=your_secret_key
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=43200
GOOGLE_CLIENT_ID=your_google_client_id

GITHUB_MODELS_TOKEN=your_github_models_token
GITHUB_MODELS_TASK_MODEL=openai/gpt-4o
GITHUB_MODELS_TASK_TIMEOUTS=8
GITHUB_MODELS_DAILY_LIMIT=50

OPENROUTER_API_KEY=
OPENROUTER_TASK_MODEL=openai/gpt-oss-20b:free
OPENROUTER_TASK_TIMEOUTS=8

GEMINI_API_KEY=
GEMINI_TASK_MODEL=gemini-2.5-flash-lite
GEMINI_TASK_TIMEOUT_SECONDS=8

OPENAI_API_KEY=
OPENAI_TASK_MODEL=gpt-4o-mini
OPENAI_TASK_TIMEOUT_SECONDS=8

AI_REQUEST_TIMEOUT_SECONDS=10
AI_MAX_TOKENS=300
OPENROUTER_SITE_URL=https://your-domain-or-ip
OPENROUTER_APP_NAME=AgileAI Prompt-to-Task
OPENROUTER_EMBEDDING_MODEL=openai/text-embedding-3-small
TASK_DUPLICATE_THRESHOLD=0.88
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
```

### Frontend

Tạo file `.env` cho FE:

```env
VITE_API_BASE=https://your-domain-or-ip/api
VITE_GOOGLE_CLIENT_ID=your_google_client_id
```

## 4. Những điểm cần nhớ khi deploy

- FE phải trỏ `VITE_API_BASE` sang URL backend public, không dùng `localhost`.
- Google Login phải dùng đúng `GOOGLE_CLIENT_ID` ở cả FE và BE.
- Nếu chạy qua HTTPS, WebSocket sẽ tự chuyển sang `wss://` nhờ hàm `toWebSocketUrl`.
- Upload file đang mount trong thư mục `uploads`, nên cần volume để không mất dữ liệu khi container restart.

## 5. Gợi ý cấu trúc Docker

Nên có 3 Dockerfile:

- `BE/Dockerfile`
- `FE/Dockerfile`
- một image MySQL dùng từ Docker Hub

Và một file `docker-compose.yml` ở thư mục gốc.

Mô hình service nên là:

```yaml
services:
  mysql:
  backend:
  frontend:
  nginx:
```

## 6. Luồng build

### Backend

1. Cài dependency từ `requirements.txt`.
2. Chạy Uvicorn trên `0.0.0.0:8000`.
3. Đảm bảo BE đọc `.env` từ môi trường container.

### Frontend

1. Cài dependency bằng npm.
2. Chạy `npm run build`.
3. Serve thư mục `dist` bằng Nginx hoặc một container static riêng.

## 7. Tài liệu Docker Compose mẫu

Đây là cấu trúc tham khảo để bạn hình dung:

```yaml
version: "3.9"

services:
  mysql:
    image: mysql:8.0
    restart: always
    environment:
      MYSQL_ROOT_PASSWORD: your_password
      MYSQL_DATABASE: agile_ai_management
    ports:
      - "3306:3306"
    volumes:
      - mysql_data:/var/lib/mysql

  backend:
    build: ./BE
    restart: always
    env_file:
      - ./BE/.env
    depends_on:
      - mysql
    ports:
      - "8000:8000"

  frontend:
    build: ./FE
    restart: always
    depends_on:
      - backend
    ports:
      - "80:80"

volumes:
  mysql_data:
```

## 8. Cách deploy từng bước

### Bước 1: Chuẩn bị VPS

- Cài Ubuntu 22.04
- cập nhật hệ thống
- cài `docker`, `docker compose`, `git`

### Bước 2: Đưa source lên VPS

- clone repo từ GitHub
- kiểm tra `BE`, `FE`, file env và các thư mục cần thiết

### Bước 3: Tạo biến môi trường

- điền `.env` cho BE
- điền `.env` cho FE

### Bước 4: Build và chạy

- chạy `docker compose up -d --build`
- kiểm tra log BE/FE/DB

### Bước 5: Kiểm thử

- đăng nhập
- mở board dự án
- tạo/sửa/xóa task
- test AI phân rã task
- test AI tổng kết
- test chống trùng
- test Google login
- test chat nếu đã bật

## 9. Cấu hình Google Login

Trong Google Cloud Console:

- thêm domain FE public vào `Authorized JavaScript origins`
- thêm domain public của app nếu cần kiểm tra OAuth Web
- lấy đúng `Client ID`

Với code hiện tại, luồng Google Sign-In ở frontend dùng Google Identity Services và backend verify credential bằng `GOOGLE_CLIENT_ID`.

## 10. DB và dữ liệu

Khi deploy:

- dữ liệu thật sẽ nằm ở MySQL trên VPS hoặc service MySQL bên ngoài
- DB trên máy cá nhân chỉ là môi trường dev
- nếu muốn giữ dữ liệu lâu dài, phải gắn volume cho MySQL

## 11. Lưu ý production

- `Base.metadata.create_all()` và `sync_schema()` rất tiện cho demo/dev, nhưng khi deploy thật nên cẩn thận kiểm tra trước khi chạy trên DB production.
- Nếu đã có dữ liệu thật, nên backup trước khi cập nhật schema.
- CORS production nên giới hạn domain FE thật, không để `*` nếu muốn chặt chẽ hơn.

## 12. Checklist trước khi demo

- FE mở được từ Internet
- BE trả `/docs` hoặc `/health` từ Internet
- Login thường chạy được
- Google login chạy được
- Board và kéo thả hoạt động
- AI phân rã sinh được `start_date` và `due_date`
- AI tổng kết trả kết quả trong thời gian chấp nhận được
- Upload và chat không lỗi

## 13. Mức độ khả thi

Với đồ án của bạn, triển khai theo VPS + Docker là hoàn toàn khả thi. Nếu chuẩn bị trước `.env`, image Docker và một MySQL ổn định thì phần deploy thường chỉ còn là:

- cấu hình host
- chạy compose
- kiểm thử lại lần cuối

Nếu muốn, có thể bổ sung thêm:

- HTTPS bằng Nginx + Let’s Encrypt
- backup DB tự động
- script `deploy.sh` để chạy một lệnh là lên toàn bộ hệ thống
