# Checklist deploy AgileAI

## 1. Chuan bi tren VPS

Can co Docker Engine va Docker Compose. Khong can cai Node.js, Python hay MySQL truc tiep tren VPS.

```bash
git clone <repo-url> agileai
cd agileai
cp .env.example .env
cp BE/.env.example BE/.env
```

## 2. Dien bien moi truong

Trong `.env` o thu muc goc:

```env
MYSQL_PASSWORD=<mat-khau-db-manh>
MYSQL_ROOT_PASSWORD=<mat-khau-root-db-khac>
APP_ORIGIN=https://ten-mien-cua-ban
APP_PORT=80
GOOGLE_CLIENT_ID=<google-client-id-neu-dung>
AUTO_CREATE_SCHEMA=true
AUTO_SYNC_SCHEMA=true
```

Trong `BE/.env`, bat buoc thay:

```env
SECRET_KEY=<chuoi-ngau-nhien-it-nhat-32-ky-tu>
GOOGLE_CLIENT_ID=<cung-client-id-voi-frontend>
```

Chi dien cac API key AI thuc su su dung. Khong commit hai file `.env`.

Tao secret nhanh:

```bash
openssl rand -hex 32
```

## 3. Backup truoc deploy

Neu VPS da co du lieu:

```bash
docker compose exec mysql mysqldump -u root -p agile_ai_management > backup-before-deploy.sql
```

## 4. Build va khoi dong

```bash
docker compose config --quiet
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 backend
docker compose logs --tail=100 frontend
```

Lan dau co the de `AUTO_CREATE_SCHEMA=true` va `AUTO_SYNC_SCHEMA=true`. Sau khi schema da on dinh, nen doi ca hai thanh `false` va restart backend.

## 5. Smoke test sau deploy

```bash
curl -f https://ten-mien-cua-ban/api/health
curl -I https://ten-mien-cua-ban/
```

Kiem tra thu cong theo thu tu:

1. Dang ky, dang nhap thuong va Google login.
2. Tao project, moi thanh vien, phan quyen manager/developer/tester.
3. Tao task, sua task, keo tha, checklist, comment, tag va upload.
4. Mo Dashboard, Bao cao, Hoat dong, Thong bao, Luu tru va Quan tri.
5. Thu AI tao backlog, AI tong ket du an va phat hien task trung.
6. Mo hai trinh duyet de thu chat WebSocket.

## 6. Neu deploy loi

```bash
docker compose ps
docker compose logs --tail=200 mysql
docker compose logs --tail=200 backend
docker compose logs --tail=200 frontend
```

Loi thuong gap:

- Backend khong healthy: sai `SECRET_KEY`, DB chua healthy, hoac sai bien AI/Google.
- FE mo duoc nhung API loi: kiem tra `/api/health` va log backend.
- Google login loi: them dung domain HTTPS vao Authorized JavaScript origins.
- Upload mat sau restart: kiem tra volume `uploads_data`.
- WebSocket loi sau HTTPS: reverse proxy phai chuyen header `Upgrade` va `Connection`.
