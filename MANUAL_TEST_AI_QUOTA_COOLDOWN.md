# Manual test: AI Quota Guard và Cooldown

## 1. Mục đích

Tính năng AI Quota Guard và Cooldown được bổ sung để hạn chế việc người dùng gọi AI liên tục, tránh lãng phí quota của các provider như GitHub Models, Gemini, OpenRouter hoặc OpenAI.

Hệ thống không chỉ gọi AI rồi hiển thị kết quả, mà còn có lớp kiểm soát vận hành:

- Giới hạn số lượt gọi AI theo từng người dùng, từng chức năng và từng ngày.
- Chặn các thao tác gọi AI quá nhanh trong vài giây.
- Theo dõi riêng các chức năng AI như tạo task, tạo nhiều task, tổng kết dự án và kiểm tra trùng task.
- Từ chối request trước khi gọi provider thật, giúp không tốn token/quota bên ngoài.

## 2. Các biến cấu hình

Các biến có thể cấu hình trong backend:

| Biến | Giá trị mặc định | Ý nghĩa |
| --- | ---: | --- |
| `AI_USER_DAILY_LIMIT` | `30` | Số lượt AI/ngày cho user thường ở các chức năng AI nặng |
| `AI_ADMIN_DAILY_LIMIT` | `80` | Số lượt AI/ngày cho admin |
| `AI_USER_COOLDOWN_SECONDS` | `8` | Khoảng chờ giữa hai lần gọi AI nặng |
| `AI_DUPLICATE_DAILY_LIMIT` | `120` | Số lượt kiểm tra trùng task/ngày |
| `AI_DUPLICATE_COOLDOWN_SECONDS` | `0` | Cooldown cho kiểm tra trùng, mặc định tắt để không phá luồng tạo nhiều draft |

File runtime dùng để đếm lượt gọi:

```text
BE/.ai_rate_limits.json
```

File này không commit lên Git vì chỉ là dữ liệu vận hành.

## 3. Các chức năng được bảo vệ

| Chức năng | Endpoint | Guard |
| --- | --- | --- |
| AI tạo một task | `POST /projects/{project_id}/ai/parse-task` | Daily quota + cooldown |
| AI tạo nhiều draft task | `POST /projects/{project_id}/ai/parse-tasks` | Daily quota + cooldown |
| AI tổng kết dự án | `POST /projects/{project_id}/ai/project-summary` | Daily quota + cooldown |
| AI kiểm tra trùng task | `POST /projects/{project_id}/tasks/check-duplicate` | Daily quota |

## 4. Manual test trên giao diện

### Test 1: Cooldown khi tạo task bằng AI

1. Đăng nhập bằng tài khoản Nguyễn An.
2. Vào dự án `Đồ án quản lý công việc nhóm`.
3. Bấm `Thêm công việc`.
4. Ở phần Trợ lý AI, nhập prompt:

```text
Tạo các công việc cho module quota AI gồm API kiểm tra hạn mức, giao diện cảnh báo và kiểm thử cooldown.
```

5. Bấm `Tạo draft`.
6. Ngay lập tức bấm `Tạo draft` lần nữa.

Kết quả mong đợi:

- Lần đầu hệ thống trả danh sách draft task.
- Lần thứ hai hệ thống báo lỗi dạng: `Bạn đang gọi AI quá nhanh. Vui lòng thử lại sau ... giây.`

### Test 2: Kiểm tra trùng task vẫn hoạt động

1. Trong modal tạo công việc, nhập tiêu đề:

```text
Hoàn thiện màn hình admin AI usage
```

2. Nhập mô tả:

```text
Hiển thị số lượt gọi model, token và provider trong ngày.
```

3. Rời khỏi ô nhập hoặc bấm tạo công việc.

Kết quả mong đợi:

- Hệ thống hiển thị cảnh báo công việc tương tự đã tồn tại.
- Người dùng có thể chọn kiểm tra lại hoặc vẫn tạo công việc.

### Test 3: AI tổng kết dự án

1. Vào board của dự án.
2. Bấm nút `Tổng kết`.
3. Đợi hệ thống trả kết quả.

Kết quả mong đợi:

- Modal hiển thị điểm sức khỏe dự án.
- Có mức rủi ro.
- Có danh sách rủi ro, thành viên cần theo dõi, công việc ưu tiên và hành động đề xuất.
- Nếu bấm tổng kết liên tục quá nhanh, hệ thống báo cooldown.

## 5. Manual test bằng API

Đăng nhập:

```bash
curl -X POST http://127.0.0.1:8000/auth/login \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=demo.manager@agileai-demo.com&password=123456"
```

Gọi AI tạo draft:

```bash
curl -X POST http://127.0.0.1:8000/projects/5/ai/parse-tasks \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d "{\"prompt\":\"Tạo 2 công việc cho module quota AI: viết API kiểm tra hạn mức và kiểm thử cooldown.\"}"
```

Gọi lại ngay lệnh trên.

Kết quả mong đợi:

```json
{
  "detail": "Bạn đang gọi AI quá nhanh. Vui lòng thử lại sau ... giây."
}
```

Kiểm tra trùng task:

```bash
curl -X POST http://127.0.0.1:8000/projects/5/tasks/check-duplicate \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d "{\"title\":\"Hoàn thiện màn hình admin AI usage\",\"description\":\"Hiển thị số lượt gọi model, token và provider trong ngày.\"}"
```

Kết quả mong đợi:

```json
{
  "duplicate_found": true,
  "method": "embedding_hybrid"
}
```

## 6. Cách giải thích khi phản biện

Nếu thầy cô hỏi: "Nếu người dùng spam gọi AI thì sao?"

Trả lời:

> Hệ thống có lớp AI Quota Guard ở backend. Trước khi gửi request đến GitHub Models hoặc Gemini, backend kiểm tra số lượt gọi theo user, feature và ngày. Nếu người dùng gọi quá nhanh hoặc vượt hạn mức, hệ thống trả lỗi 429 ngay, không gửi request ra provider nên không tốn token/quota.

Nếu hỏi: "Chống trùng task có gọi AI liên tục không?"

Trả lời:

> Frontend không kiểm tra trên từng ký tự. Hệ thống chỉ kiểm tra khi người dùng rời ô nhập hoặc khi bấm tạo task. Kết quả được cache theo title và description hiện tại. Với nhiều draft AI, hệ thống chỉ kiểm tra các draft được chọn trước khi lưu.

Nếu hỏi: "Vì sao duplicate-check không có cooldown?"

Trả lời:

> Duplicate-check có daily quota riêng nhưng không đặt cooldown mặc định, vì khi người dùng tạo nhiều draft task cùng lúc, hệ thống cần kiểm tra nhiều task song song. Nếu đặt cooldown cho duplicate-check thì sẽ làm hỏng trải nghiệm hợp lệ. Các chức năng AI nặng như sinh task và tổng kết dự án mới cần cooldown.

## 7. Ý nghĩa trong đồ án

Tính năng này giúp hệ thống vượt khỏi CRUD cơ bản:

- Có kiểm soát tài nguyên AI.
- Có chống abuse/spam.
- Có phân biệt loại chức năng AI nặng và nhẹ.
- Có phản hồi lỗi rõ ràng cho người dùng.
- Có dữ liệu vận hành để admin theo dõi và cấu hình hạn mức.
