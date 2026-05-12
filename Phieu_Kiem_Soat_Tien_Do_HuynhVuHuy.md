PHIẾU KIỂM SOÁT TIẾN ĐỘ LÀM ĐỒ ÁN TỐT NGHIỆP
(Phiếu dành cho người hướng dẫn/sinh viên)

Họ tên sinh viên: Huỳnh Vũ Huy                    Số thẻ SV: 102220321

Tên đề tài ĐATN: Xây dựng hệ thống hỗ trợ quản lý tiến độ công việc có tích hợp trợ lý AI

Họ tên người HD: ThS. Nguyễn Công Danh    Đơn vị: Khoa Công nghệ Thông tin

═══════════════════════════════════════════════════════════════════════

TUẦN 1 | Ngày: 28/3 – 3/4

ĐÃ THỰC HIỆN:
- Đọc tài liệu về FastAPI, ReactJS, SQLAlchemy, MySQL, Pydantic.
  Nghiên cứu mô hình Agile/Kanban và các hệ thống tương tự (Jira, Trello).
- Phân tích yêu cầu đề tài, xác định các nhóm người dùng
  (Admin, Manager, Developer, Tester) và luồng nghiệp vụ chính.
- Thiết kế kiến trúc tổng thể hệ thống: Backend REST API (FastAPI) –
  Frontend SPA (ReactJS) – Cơ sở dữ liệu quan hệ (MySQL).
- Thiết kế ERD cơ sở dữ liệu với 13 bảng: users, projects, boards,
  board_columns, tasks, task_checklist_items, comments, tags, task_tags,
  attachments, notifications, activity_logs, project_members. (5%)

TIẾP TỤC THỰC HIỆN:
- Cài đặt môi trường phát triển, khởi tạo dự án FastAPI và ReactJS.
- Triển khai chi tiết SQLAlchemy ORM models và Pydantic schemas.
- Xây dựng API xác thực JWT (đăng ký / đăng nhập).

═══════════════════════════════════════════════════════════════════════

TUẦN 2 | Ngày: 4/4 – 17/4

ĐÃ THỰC HIỆN:
- Cài đặt môi trường FastAPI, SQLAlchemy, PyMySQL, python-jose (JWT).
- Triển khai toàn bộ SQLAlchemy ORM models theo thiết kế ERD.
- Xây dựng hệ thống xác thực JWT: đăng ký (POST /auth/register),
  đăng nhập (POST /auth/login), bảo vệ route bằng dependency
  get_current_user.
- Xây dựng hệ thống phân quyền RBAC 3 cấp:
  require_project_member / require_project_manager / require_admin.
- Tổ chức CRUD layer tách biệt cho từng entity (crud/user.py,
  crud/task.py, crud/board.py, crud/comment.py, crud/attachment.py,
  crud/project_member.py) theo chuẩn kiến trúc FastAPI.
- Xây dựng schema_sync.py – tự động ALTER TABLE khi startup
  để đồng bộ schema DB với model mà không cần migration thủ công.
- Triển khai đầy đủ REST API endpoints:
    POST/GET/PUT/DELETE /projects/            – CRUD dự án
    GET/POST /boards/project/{id}             – Quản lý Kanban board
    POST/PUT/DELETE /boards/.../columns       – Cột Kanban, WIP limit
    GET/POST/PUT/DELETE /projects/{id}/tasks  – CRUD task
    GET/POST/PUT/DELETE .../tasks/{id}/checklist – Checklist của task
    GET/POST/DELETE /comments/task/{id}       – Bình luận trên task
    GET/POST/PUT/DELETE /tags/project/{id}    – Tag và gắn tag vào task
    POST/GET/DELETE /attachments/task/{id}    – Upload file đính kèm
    GET/PUT /projects/{id}/members            – Quản lý thành viên
    GET /projects/{id}/activity_logs          – Lịch sử hoạt động (20%)

TIẾP TỤC THỰC HIỆN:
- Xây dựng Frontend ReactJS: các màn hình chính và kết nối API.
- Xây dựng Kanban board với tính năng kéo-thả task.

═══════════════════════════════════════════════════════════════════════

TUẦN 3 | Ngày: 18/4 – 24/4

ĐÃ THỰC HIỆN:
- Khởi tạo dự án ReactJS (Vite), thiết lập React Router v6, AuthContext
  (JWT lưu localStorage, auto-redirect khi hết hạn token).
- Xây dựng hệ thống CSS design tokens: dark mode, biến màu, typography
  dùng Google Fonts Inter. Tích hợp lucide-react làm icon set chuẩn.

Xây dựng các màn hình Frontend:
  • LoginPage: form đăng nhập JWT, validation, hiển thị lỗi toast.
  • DashboardPage: thống kê tổng quan (project, task hoàn thành/đang
    làm/quá hạn), danh sách project, widget "Việc của tôi" (My Tasks).
  • ProjectsPage: CRUD dự án, tìm kiếm, lọc, starred, menu ngữ cảnh.
  • BoardPage (Kanban): kéo-thả task giữa cột (HTML5 Drag & Drop API),
    hiển thị WIP limit, badge loại/ưu tiên trên task card.
  • TaskDetailModal: form chỉnh sửa task đầy đủ (tiêu đề, mô tả,
    loại, ưu tiên, ngày bắt đầu/kết thúc, tiến độ %, người nhận);
    Checklist (thêm/xóa/đánh dấu, tự động sync checklist_total);
    Tệp đính kèm (upload/xem/xóa); Tags (toggle gắn/gỡ tag dự án);
    Bình luận (thêm/xóa, avatar chữ cái đầu tên người dùng).
  • TasksPage: danh sách task theo dự án, lọc theo priority/type,
    progress bar, badge cảnh báo quá hạn.
  • NotificationsPage: xem thông báo, đánh dấu đã đọc/đọc tất cả.
  • MembersPage: danh sách thành viên dự án, badge role màu sắc.
  • SettingsPage: cập nhật họ tên, đổi mật khẩu (xác thực phía server).
  • Sidebar: điều hướng chính với badge số thông báo chưa đọc
    (polling 60 giây).

Bổ sung Backend:
  GET  /users/me                – Lấy thông tin profile hiện tại
  PUT  /users/me                – Cập nhật họ tên, avatar_url
  PUT  /users/me/password       – Đổi mật khẩu (kiểm tra mật khẩu cũ)
  GET  /notifications/          – Danh sách thông báo
  PUT  /notifications/{id}/read – Đánh dấu đã đọc
  PUT  /notifications/read_all  – Đánh dấu tất cả đã đọc (35%)

TIẾP TỤC THỰC HIỆN:
- Kiểm tra và sửa lỗi logic backend (timezone, completed_at, eager-load).
- Tăng cường bảo mật access control cho attachments, tags, activity_logs.
- Xây dựng module AI: thu thập dữ liệu, huấn luyện mô hình phân loại
  task (SVM/Random Forest), tích hợp LLM API (Prompt-to-Task,
  Semantic Duplicate Detection).

═══════════════════════════════════════════════════════════════════════

TUẦN 4 | (Duyệt lần 1)

Duyệt lần 1: Đánh giá khối lượng hoàn thành 35%
Được tiếp tục làm ĐATN  ☑        Không tiếp tục thực hiện ĐATN  ☐

═══════════════════════════════════════════════════════════════════════

Đà Nẵng, ngày 03 tháng 05 năm 2026

     XÁC NHẬN CỦA NGƯỜI HƯỚNG DẪN          SINH VIÊN THỰC HIỆN
          (Ký và ghi rõ họ tên)                (Ký và ghi rõ họ tên)
