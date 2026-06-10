from __future__ import annotations

import json
from datetime import datetime, timedelta
from pathlib import Path
import sys

from sqlalchemy import inspect, text

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app import models  # noqa: E402
from app.core.security import get_password_hash  # noqa: E402
from app.database import SessionLocal, engine  # noqa: E402


PASSWORD = "123456"
NOW = datetime(2026, 6, 7, 9, 0)

TABLES = [
    "task_tags",
    "ai_prediction_logs",
    "attachments",
    "comments",
    "task_checklist_items",
    "project_messages",
    "activity_logs",
    "notifications",
    "tasks",
    "tags",
    "board_columns",
    "boards",
    "project_members",
    "projects",
    "workspaces",
    "users",
]

MODEL_BY_TABLE = {
    "users": models.User,
    "workspaces": models.Workspace,
    "projects": models.Project,
    "project_members": models.ProjectMember,
    "boards": models.Board,
    "board_columns": models.BoardColumn,
    "tasks": models.Task,
    "task_checklist_items": models.TaskChecklistItem,
    "comments": models.Comment,
    "project_messages": models.ProjectMessage,
    "attachments": models.Attachment,
    "tags": models.Tag,
    "task_tags": models.TaskTag,
    "notifications": models.Notification,
    "activity_logs": models.ActivityLog,
    "ai_prediction_logs": models.AIPredictionLog,
}

COLUMNS = [
    ("Backlog", "#94a3b8", False),
    ("To Do", "#3b82f6", False),
    ("In Progress", "#f59e0b", False),
    ("Review / Testing", "#8b5cf6", False),
    ("Done", "#22c55e", True),
]

TAG_COLORS = {
    "Yeu cau": "#dbeafe",
    "Giao dien": "#ede9fe",
    "Backend": "#dcfce7",
    "Kiem thu": "#fee2e2",
    "Tai lieu": "#fef3c7",
    "Bao cao": "#e0f2fe",
    "Du lieu": "#f1f5f9",
    "AI": "#ede9fe",
}

TYPE_TAG = {
    "Feature": "Yeu cau",
    "Bug": "Kiem thu",
    "Docs": "Tai lieu",
    "Task": "Bao cao",
}


def backup_database() -> Path:
    backup_dir = ROOT / "backups"
    backup_dir.mkdir(exist_ok=True)
    backup_path = backup_dir / f"demo_seed_backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"

    snapshot = {}
    with SessionLocal() as db:
        for table, model in MODEL_BY_TABLE.items():
            mapper = inspect(model)
            cols = [col.key for col in mapper.columns]
            rows = []
            for obj in db.query(model).all():
                row = {}
                for col in cols:
                    value = getattr(obj, col)
                    row[col] = value.isoformat() if isinstance(value, datetime) else value
                rows.append(row)
            snapshot[table] = rows

    backup_path.write_text(
        json.dumps(snapshot, ensure_ascii=False, indent=2, default=str),
        encoding="utf-8",
    )
    return backup_path


def truncate_database() -> None:
    with engine.begin() as conn:
        conn.execute(text("SET FOREIGN_KEY_CHECKS=0"))
        for table in TABLES:
            conn.execute(text(f"TRUNCATE TABLE {table}"))
        conn.execute(text("SET FOREIGN_KEY_CHECKS=1"))


def add_user(db, full_name: str, email: str, role: str = "user", avatar: str | None = None) -> models.User:
    user = models.User(
        full_name=full_name,
        email=email,
        password_hash=get_password_hash(PASSWORD),
        role=role,
        auth_provider="password",
        avatar_url=avatar,
        created_at=NOW - timedelta(days=25),
    )
    db.add(user)
    db.flush()
    return user


def make_task(
    title: str,
    assignee: str,
    task_type: str,
    priority: str,
    column: str,
    start_offset: int,
    due_offset: int,
    hours: float,
    description: str,
    tags: list[str] | None = None,
    ai: bool = False,
) -> dict:
    return {
        "title": title,
        "assignee": assignee,
        "task_type": task_type,
        "priority": priority,
        "column": column,
        "start_offset": start_offset,
        "due_offset": due_offset,
        "hours": hours,
        "description": description,
        "tags": tags or [],
        "ai": ai,
    }


def task_sets() -> list[dict]:
    return [
        {
            "name": "Website đặt lịch phòng học",
            "key": "DLH",
            "color": "#4f8ef7",
            "description": "Dự án môn Công nghệ phần mềm: quản lý đặt lịch phòng học, duyệt lịch và thông báo cho sinh viên.",
            "start": datetime(2026, 5, 25, 8, 0),
            "end": datetime(2026, 6, 28, 17, 0),
            "members": {
                "manager": ["manager"],
                "huy": ["developer"],
                "an": ["developer"],
                "khoa": ["developer"],
                "minh": ["developer"],
                "linh": ["tester"],
                "phuc": ["tester"],
                "trang": ["developer"],
            },
            "boards": [
                {
                    "name": "Sprint 1 - Đăng nhập và đặt lịch",
                    "description": "Tập trung đăng nhập, danh sách phòng và quy trình tạo lịch.",
                    "tasks": [
                        make_task("Khảo sát quy trình đặt phòng hiện tại", "manager", "Docs", "Medium", "Done", 0, 2, 3, "Tổng hợp các bước đặt phòng, duyệt lịch và hủy lịch đang dùng.", ["Tai lieu"]),
                        make_task("Thiết kế giao diện form đăng nhập", "minh", "Feature", "Medium", "Review / Testing", 2, 5, 5, "Thiết kế màn hình đăng nhập rõ ràng, có trạng thái lỗi và loading.", ["Giao dien"]),
                        make_task("Xây dựng API đăng nhập JWT", "huy", "Feature", "High", "In Progress", 3, 7, 8, "Tạo endpoint đăng nhập, refresh token và validate thông tin người dùng.", ["Backend"]),
                        make_task("Tạo màn hình danh sách phòng học", "minh", "Feature", "Medium", "To Do", 5, 10, 6, "Hiển thị phòng học, sức chứa, thiết bị và trạng thái khả dụng.", ["Giao dien"], True),
                        make_task("Xử lý kiểm tra trùng lịch đặt phòng", "khoa", "Feature", "High", "To Do", 7, 13, 8, "Kiểm tra khung giờ bị trùng trước khi gửi yêu cầu đặt phòng.", ["Backend"]),
                        make_task("Kiểm thử luồng đăng nhập và phân quyền", "linh", "Bug", "High", "Review / Testing", 6, 11, 4, "Kiểm thử đăng nhập đúng/sai mật khẩu, hết phiên và quyền người dùng.", ["Kiem thu"]),
                        make_task("Viết tài liệu hướng dẫn đặt lịch", "trang", "Docs", "Low", "Backlog", 12, 18, 3, "Viết hướng dẫn thao tác tạo lịch, sửa lịch và xem lịch cá nhân.", ["Tai lieu"]),
                        make_task("Sửa lỗi hiển thị lịch khi đổi tuần", "an", "Bug", "Medium", "In Progress", 8, 15, 5, "Lịch bị lệch ngày khi chuyển tuần trên màn hình nhỏ.", ["Giao dien", "Kiem thu"]),
                        make_task("Chuẩn bị dữ liệu phòng học mẫu", "manager", "Task", "Medium", "Done", 1, 4, 2, "Tạo danh sách phòng, ca học và giảng đường để demo.", ["Du lieu"]),
                        make_task("Review kế hoạch demo sprint 1", "manager", "Task", "Medium", "Done", 9, 12, 2, "Rà soát luồng demo chính và phân công người trình bày.", ["Bao cao"]),
                        make_task("Cấu hình thông báo khi lịch được duyệt", "khoa", "Feature", "Medium", "Backlog", 14, 21, 6, "Gửi thông báo khi lịch đặt phòng được duyệt hoặc từ chối.", ["Backend"]),
                        make_task("Kiểm thử hủy lịch và đặt lại lịch", "phuc", "Bug", "Medium", "Review / Testing", 11, 17, 4, "Kiểm thử các trường hợp hủy lịch, đặt lại và kiểm tra trạng thái.", ["Kiem thu"]),
                    ],
                },
                {
                    "name": "Sprint 2 - Duyệt lịch và báo cáo",
                    "description": "Hoàn thiện duyệt lịch, thống kê và tài liệu nghiệm thu.",
                    "tasks": [
                        make_task("Thiết kế màn hình duyệt lịch cho quản lý", "minh", "Feature", "High", "To Do", 14, 20, 6, "Màn hình xem yêu cầu, lọc theo phòng và duyệt/từ chối lịch.", ["Giao dien"], True),
                        make_task("Xây dựng API duyệt yêu cầu đặt phòng", "huy", "Feature", "High", "In Progress", 15, 22, 8, "Endpoint duyệt, từ chối và ghi nhận người xử lý yêu cầu.", ["Backend"]),
                        make_task("Tạo báo cáo số lượt đặt phòng theo tuần", "an", "Feature", "Medium", "Backlog", 19, 27, 6, "Thống kê số lượt đặt theo phòng, theo tuần và theo trạng thái.", ["Bao cao"]),
                        make_task("Kiểm thử quyền duyệt lịch của quản lý", "linh", "Bug", "High", "Review / Testing", 18, 24, 4, "Đảm bảo chỉ người có quyền mới duyệt hoặc hủy lịch của nhóm.", ["Kiem thu"]),
                        make_task("Viết checklist nghiệm thu chức năng đặt lịch", "phuc", "Docs", "Medium", "Done", 13, 18, 3, "Checklist cho các luồng tạo, sửa, hủy và duyệt lịch.", ["Tai lieu", "Kiem thu"]),
                        make_task("Sửa lỗi lọc phòng theo sức chứa", "khoa", "Bug", "Medium", "In Progress", 17, 23, 5, "Bộ lọc sức chứa trả sai danh sách khi nhập giá trị biên.", ["Backend"]),
                        make_task("Chuẩn bị kịch bản demo đặt lịch", "trang", "Docs", "Medium", "Done", 20, 24, 3, "Soạn kịch bản demo từ đăng nhập đến duyệt lịch.", ["Bao cao"]),
                        make_task("Tối ưu form tạo lịch trên mobile", "minh", "Task", "Low", "Backlog", 22, 30, 4, "Điều chỉnh spacing và thứ tự field trên màn hình nhỏ.", ["Giao dien"]),
                        make_task("Đồng bộ trạng thái lịch sau khi duyệt", "huy", "Feature", "High", "To Do", 24, 31, 7, "Cập nhật realtime trạng thái yêu cầu trên màn hình người đặt.", ["Backend"]),
                        make_task("Tổng hợp phản hồi người dùng thử", "manager", "Docs", "Medium", "Review / Testing", 25, 32, 3, "Ghi nhận phản hồi sau buổi chạy thử và ưu tiên chỉnh sửa.", ["Tai lieu"]),
                    ],
                },
            ],
        },
        {
            "name": "Ứng dụng quản lý thư viện mini",
            "key": "TVM",
            "color": "#22c55e",
            "description": "Dự án môn Cơ sở dữ liệu: quản lý sách, độc giả, mượn trả và thống kê quá hạn.",
            "start": datetime(2026, 5, 28, 8, 0),
            "end": datetime(2026, 6, 30, 17, 0),
            "members": {
                "manager": ["manager"],
                "huy": ["developer"],
                "khoa": ["developer"],
                "trang": ["developer"],
                "linh": ["tester"],
                "an": ["developer"],
            },
            "boards": [
                {
                    "name": "MVP - Mượn trả sách",
                    "description": "Xây dựng phiên bản đầu cho nghiệp vụ sách, độc giả và phiếu mượn.",
                    "tasks": [
                        make_task("Chuẩn hóa danh mục sách mẫu", "trang", "Docs", "Medium", "Done", 0, 3, 3, "Nhập dữ liệu sách, tác giả, thể loại và mã phân loại.", ["Du lieu"]),
                        make_task("Thiết kế ERD quản lý mượn trả", "manager", "Docs", "High", "Done", 1, 4, 4, "Hoàn thiện ERD và quan hệ sách, độc giả, phiếu mượn.", ["Tai lieu"]),
                        make_task("Xây dựng API CRUD sách", "khoa", "Feature", "High", "In Progress", 3, 9, 8, "Tạo API thêm, sửa, xóa mềm, tìm kiếm và lọc sách.", ["Backend"], True),
                        make_task("Tạo giao diện danh sách sách", "an", "Feature", "Medium", "To Do", 5, 11, 6, "Hiển thị sách theo dạng bảng, có tìm kiếm và phân trang.", ["Giao dien"]),
                        make_task("Xây dựng API tạo phiếu mượn", "huy", "Feature", "High", "In Progress", 6, 13, 8, "Kiểm tra tồn kho và tạo phiếu mượn cho độc giả.", ["Backend"]),
                        make_task("Kiểm thử trả sách quá hạn", "linh", "Bug", "High", "Review / Testing", 10, 16, 4, "Kiểm thử ngày trả, phí quá hạn và trạng thái phiếu mượn.", ["Kiem thu"]),
                        make_task("Viết tài liệu nghiệp vụ mượn trả", "trang", "Docs", "Medium", "Backlog", 12, 20, 3, "Mô tả quy trình thêm sách, mượn sách, trả sách.", ["Tai lieu"]),
                        make_task("Sửa lỗi tìm kiếm sách có dấu tiếng Việt", "khoa", "Bug", "Medium", "To Do", 13, 19, 5, "Tìm kiếm chưa khớp khi nhập không dấu hoặc khác hoa thường.", ["Backend"]),
                        make_task("Tạo báo cáo sách đang được mượn", "manager", "Feature", "Medium", "Backlog", 16, 25, 5, "Thống kê sách đang mượn, quá hạn và độc giả mượn nhiều.", ["Bao cao"]),
                        make_task("Kiểm thử nhập dữ liệu sách hàng loạt", "linh", "Bug", "Medium", "Review / Testing", 15, 22, 4, "Kiểm tra file mẫu, lỗi dữ liệu và thông báo sau khi import.", ["Kiem thu"]),
                        make_task("Thiết kế màn hình chi tiết độc giả", "an", "Feature", "Low", "Backlog", 18, 28, 4, "Hiển thị thông tin độc giả và lịch sử mượn sách.", ["Giao dien"]),
                        make_task("Review dữ liệu demo thư viện", "manager", "Task", "Medium", "Done", 20, 23, 2, "Rà lại dữ liệu sách, độc giả và phiếu mượn cho buổi demo.", ["Du lieu"]),
                    ],
                }
            ],
        },
        {
            "name": "Hệ thống khảo sát sinh viên",
            "key": "KSSV",
            "color": "#a78bfa",
            "description": "Dự án môn Phân tích thiết kế hệ thống: tạo khảo sát, thu thập phản hồi và tổng hợp kết quả.",
            "start": datetime(2026, 6, 1, 8, 0),
            "end": datetime(2026, 7, 5, 17, 0),
            "members": {
                "manager": ["manager"],
                "an": ["developer"],
                "trang": ["developer"],
                "minh": ["developer"],
                "phuc": ["tester"],
                "linh": ["tester"],
            },
            "boards": [
                {
                    "name": "Giai đoạn 1 - Tạo khảo sát",
                    "description": "Tập trung form khảo sát, câu hỏi và quyền chia sẻ.",
                    "tasks": [
                        make_task("Phân tích yêu cầu tạo mẫu khảo sát", "manager", "Docs", "High", "Done", 0, 4, 4, "Xác định các loại câu hỏi, nhóm đối tượng và quyền chỉnh sửa.", ["Tai lieu"]),
                        make_task("Thiết kế giao diện tạo câu hỏi", "minh", "Feature", "Medium", "In Progress", 2, 8, 6, "Form tạo câu hỏi trắc nghiệm, nhập văn bản và thang điểm.", ["Giao dien"]),
                        make_task("Xây dựng API lưu mẫu khảo sát", "an", "Feature", "High", "To Do", 4, 12, 8, "Lưu survey, câu hỏi và thứ tự hiển thị.", ["Backend"]),
                        make_task("Tạo dữ liệu mẫu cho khảo sát môn học", "trang", "Docs", "Medium", "Done", 3, 6, 3, "Chuẩn bị bộ câu hỏi khảo sát giảng viên và học phần.", ["Du lieu"]),
                        make_task("Kiểm thử validate câu hỏi bắt buộc", "phuc", "Bug", "Medium", "Review / Testing", 7, 13, 4, "Kiểm thử câu hỏi rỗng, duplicate option và thứ tự câu hỏi.", ["Kiem thu"]),
                        make_task("Tạo chức năng chia sẻ link khảo sát", "an", "Feature", "High", "Backlog", 9, 18, 7, "Sinh link chia sẻ và giới hạn quyền truy cập.", ["Backend"]),
                        make_task("Viết hướng dẫn tạo khảo sát nhanh", "trang", "Docs", "Low", "Backlog", 12, 20, 3, "Hướng dẫn tạo khảo sát, thêm câu hỏi và gửi link.", ["Tai lieu"]),
                        make_task("Sửa lỗi kéo thả thứ tự câu hỏi", "minh", "Bug", "Medium", "In Progress", 10, 17, 5, "Thứ tự câu hỏi không cập nhật khi kéo nhanh nhiều lần.", ["Giao dien"]),
                        make_task("Kiểm thử quyền xem khảo sát nháp", "linh", "Bug", "Medium", "Review / Testing", 11, 16, 4, "Đảm bảo khảo sát nháp không mở được bằng link công khai.", ["Kiem thu"]),
                        make_task("Review checklist chức năng tạo khảo sát", "manager", "Task", "Medium", "Done", 14, 16, 2, "Rà lại các luồng chính trước khi chuyển sang báo cáo kết quả.", ["Bao cao"]),
                    ],
                },
                {
                    "name": "Giai đoạn 2 - Báo cáo kết quả",
                    "description": "Tổng hợp phản hồi, thống kê và xuất báo cáo.",
                    "tasks": [
                        make_task("Thiết kế biểu đồ kết quả khảo sát", "minh", "Feature", "Medium", "To Do", 16, 23, 6, "Biểu đồ số lượt trả lời, tỷ lệ lựa chọn và điểm trung bình.", ["Giao dien"]),
                        make_task("Xây dựng API thống kê phản hồi", "an", "Feature", "High", "In Progress", 17, 25, 8, "Tổng hợp dữ liệu trả lời theo câu hỏi và nhóm đối tượng.", ["Backend"], True),
                        make_task("Kiểm thử xuất file báo cáo CSV", "linh", "Bug", "Medium", "Review / Testing", 22, 28, 4, "Kiểm tra encoding tiếng Việt và dữ liệu nhiều dòng.", ["Kiem thu"]),
                        make_task("Viết phần nhận xét kết quả mẫu", "trang", "Docs", "Medium", "Backlog", 24, 31, 4, "Soạn nhận xét cho báo cáo kết quả khảo sát demo.", ["Bao cao"]),
                        make_task("Sửa lỗi tính điểm trung bình", "phuc", "Bug", "High", "To Do", 25, 32, 5, "Điểm trung bình sai khi câu hỏi không có phản hồi.", ["Kiem thu"]),
                        make_task("Tạo màn hình lọc kết quả theo lớp", "minh", "Feature", "Medium", "Backlog", 28, 36, 5, "Lọc kết quả theo lớp, học phần và khoảng thời gian.", ["Giao dien"]),
                        make_task("Chuẩn bị dữ liệu phản hồi mẫu", "manager", "Task", "Medium", "Done", 19, 23, 3, "Tạo dữ liệu trả lời đủ đa dạng cho phần báo cáo.", ["Du lieu"]),
                        make_task("Review quyền truy cập báo cáo", "phuc", "Bug", "Medium", "Review / Testing", 29, 34, 4, "Kiểm thử phân quyền người tạo khảo sát và người xem báo cáo.", ["Kiem thu"]),
                        make_task("Tối ưu truy vấn tổng hợp kết quả", "an", "Task", "Medium", "In Progress", 30, 38, 5, "Giảm thời gian tải khi số lượng phản hồi lớn.", ["Backend"]),
                        make_task("Hoàn thiện tài liệu nghiệm thu khảo sát", "trang", "Docs", "Medium", "Backlog", 34, 42, 4, "Tổng hợp chức năng, dữ liệu test và ảnh màn hình.", ["Tai lieu"]),
                    ],
                },
            ],
        },
        {
            "name": "Cổng thông tin CLB Tin học",
            "key": "CLB",
            "color": "#f0883e",
            "description": "Dự án môn Lập trình Web: quản lý tin tức, sự kiện và đăng ký tham gia CLB.",
            "start": datetime(2026, 6, 3, 8, 0),
            "end": datetime(2026, 7, 10, 17, 0),
            "members": {
                "manager": ["manager"],
                "trang": ["developer"],
                "minh": ["developer"],
                "an": ["developer"],
                "linh": ["tester"],
                "khoa": ["developer"],
            },
            "boards": [
                {
                    "name": "Nội dung và sự kiện",
                    "description": "Xây dựng luồng tin tức, sự kiện và đăng ký tham gia.",
                    "tasks": [
                        make_task("Lập danh sách chuyên mục tin tức", "trang", "Docs", "Medium", "Done", 0, 3, 3, "Phân loại tin hoạt động, tuyển thành viên và tài nguyên học tập.", ["Tai lieu"]),
                        make_task("Thiết kế trang chủ CLB", "minh", "Feature", "High", "In Progress", 2, 9, 7, "Trang chủ hiển thị banner, sự kiện sắp diễn ra và tin nổi bật.", ["Giao dien"]),
                        make_task("Xây dựng API bài viết", "an", "Feature", "High", "To Do", 4, 12, 8, "CRUD bài viết, trạng thái nháp/xuất bản và ảnh đại diện.", ["Backend"], True),
                        make_task("Tạo form đăng ký tham gia sự kiện", "khoa", "Feature", "Medium", "In Progress", 7, 14, 6, "Form đăng ký, giới hạn số lượng và lưu thông tin người tham gia.", ["Backend"]),
                        make_task("Kiểm thử đăng ký sự kiện quá số lượng", "linh", "Bug", "High", "Review / Testing", 10, 16, 4, "Đảm bảo không vượt quá số lượng và hiển thị thông báo rõ.", ["Kiem thu"]),
                        make_task("Viết nội dung giới thiệu CLB", "trang", "Docs", "Low", "Backlog", 12, 20, 3, "Soạn phần giới thiệu, mục tiêu và hoạt động nổi bật.", ["Tai lieu"]),
                        make_task("Sửa lỗi ảnh bài viết bị méo", "minh", "Bug", "Medium", "To Do", 13, 19, 4, "Ảnh đại diện bị méo trên màn hình rộng.", ["Giao dien"]),
                        make_task("Tạo báo cáo danh sách người đăng ký", "manager", "Feature", "Medium", "Backlog", 15, 24, 5, "Xuất danh sách đăng ký theo sự kiện và trạng thái xác nhận.", ["Bao cao"]),
                        make_task("Kiểm thử quyền duyệt bài viết", "linh", "Bug", "Medium", "Review / Testing", 17, 23, 4, "Kiểm thử quyền admin CLB duyệt và gỡ bài viết.", ["Kiem thu"]),
                        make_task("Chuẩn bị dữ liệu sự kiện mẫu", "trang", "Task", "Medium", "Done", 18, 21, 2, "Tạo dữ liệu sự kiện workshop, seminar và tuyển thành viên.", ["Du lieu"]),
                        make_task("Tối ưu tìm kiếm bài viết", "an", "Task", "Low", "Backlog", 22, 32, 4, "Tìm kiếm theo tiêu đề, tag và thời gian đăng.", ["Backend"]),
                        make_task("Review kịch bản demo CLB", "manager", "Task", "Medium", "Done", 24, 27, 2, "Chuẩn bị luồng demo tin tức, sự kiện và đăng ký.", ["Bao cao"]),
                    ],
                }
            ],
        },
        {
            "name": "Đồ án quản lý công việc nhóm",
            "key": "QLCV",
            "color": "#0ea5e9",
            "description": "Dự án đồ án tốt nghiệp: quản lý công việc theo Kanban, hỗ trợ AI phân rã task, chống trùng và tổng kết tiến độ.",
            "start": datetime(2026, 5, 20, 8, 0),
            "end": datetime(2026, 7, 15, 17, 0),
            "members": {
                "manager": ["manager"],
                "huy": ["developer"],
                "khoa": ["developer"],
                "minh": ["developer"],
                "linh": ["tester"],
                "phuc": ["tester"],
                "an": ["developer"],
                "trang": ["developer"],
            },
            "boards": [
                {
                    "name": "Chuẩn bị bảo vệ đồ án",
                    "description": "Hoàn thiện chức năng, dữ liệu demo, báo cáo và kịch bản bảo vệ.",
                    "tasks": [
                        make_task("Dọn dữ liệu demo cho các dự án", "manager", "Task", "High", "In Progress", 0, 5, 5, "Làm sạch user, project, board và task để demo mạch lạc.", ["Du lieu"]),
                        make_task("Kiểm thử AI phân rã task nhiều người", "linh", "Bug", "High", "Review / Testing", 1, 6, 4, "Prompt tạo nhiều task, chia người nhận và deadline theo tuần.", ["AI", "Kiem thu"], True),
                        make_task("Kiểm thử chống trùng task bằng embedding", "phuc", "Bug", "High", "Review / Testing", 2, 7, 4, "Nhập task gần giống để kiểm tra cảnh báo trùng lặp.", ["AI", "Kiem thu"]),
                        make_task("Hoàn thiện màn hình admin AI usage", "huy", "Feature", "Medium", "Done", 1, 4, 6, "Hiển thị số lượt gọi model, token và provider trong ngày.", ["AI", "Backend"]),
                        make_task("Viết báo cáo chương triển khai hệ thống", "trang", "Docs", "High", "To Do", 5, 12, 6, "Mô tả kiến trúc FE/BE/DB, Docker và các API chính.", ["Tai lieu", "Bao cao"]),
                        make_task("Chuẩn bị kịch bản demo hội đồng", "manager", "Docs", "High", "To Do", 6, 11, 4, "Sắp xếp thứ tự demo dashboard, Kanban, AI, admin và realtime.", ["Bao cao"]),
                        make_task("Tối ưu giao diện sáng và dễ nhìn", "minh", "Task", "Medium", "Done", 0, 3, 5, "Giảm cảm giác màu mè, tăng độ đọc của board và modal.", ["Giao dien"]),
                        make_task("Sửa lỗi đăng nhập giữ token cũ", "khoa", "Bug", "High", "Done", 2, 4, 3, "Đảm bảo login bằng account mới không bị dùng token cũ.", ["Backend"]),
                        make_task("Kiểm thử tin nhắn realtime bằng WebSocket", "phuc", "Bug", "Medium", "Review / Testing", 5, 9, 4, "Tạo/xóa tin nhắn và kiểm tra event realtime ở nhiều tab.", ["Kiem thu"]),
                        make_task("Thiết kế slide giới thiệu tính năng AI", "trang", "Docs", "Medium", "Backlog", 10, 18, 4, "Slide giải thích phân rã task, chống trùng và tổng kết dự án.", ["Bao cao", "AI"]),
                        make_task("Đóng gói Docker Compose cho deploy", "huy", "Task", "High", "Backlog", 12, 20, 8, "Chuẩn bị Dockerfile, compose, nginx và env production.", ["Backend"]),
                        make_task("Tổng kiểm tra dữ liệu trước ngày bảo vệ", "manager", "Task", "High", "Backlog", 18, 24, 3, "Rà soát account demo, dữ liệu sạch, API key và đường dẫn deploy.", ["Bao cao"]),
                    ],
                }
            ],
        },
    ]


def seed_database() -> dict:
    truncate_database()
    with SessionLocal() as db:
        users = {
            "admin": add_user(db, "Demo Admin", "demo.admin@agileai-demo.com", "admin"),
            "manager": add_user(db, "Nguyễn An", "demo.manager@agileai-demo.com"),
            "huy": add_user(db, "Huy Huỳnh", "huy.huynh@agileai-demo.com"),
            "an": add_user(db, "An Trần", "an.tran@agileai-demo.com"),
            "linh": add_user(db, "Linh Tester", "linh.tester@agileai-demo.com"),
            "minh": add_user(db, "Minh Thiết kế", "minh.designer@agileai-demo.com"),
            "khoa": add_user(db, "Khoa Backend", "khoa.backend@agileai-demo.com"),
            "trang": add_user(db, "Trang Nội dung", "trang.content@agileai-demo.com"),
            "phuc": add_user(db, "Phúc QA", "phuc.qa@agileai-demo.com"),
        }

        stats = {"users": len(users), "projects": 0, "boards": 0, "tasks": 0}

        for project_order, spec in enumerate(task_sets(), start=1):
            project = models.Project(
                owner_id=users["manager"].id,
                workspace_id=None,
                name=spec["name"],
                project_key=spec["key"],
                color=spec["color"],
                description=spec["description"],
                status="Active",
                is_starred=project_order <= 2,
                is_archived=False,
                start_date=spec["start"],
                end_date=spec["end"],
                created_at=spec["start"] - timedelta(days=2),
            )
            db.add(project)
            db.flush()
            stats["projects"] += 1

            for user_key, roles in spec["members"].items():
                for role in roles:
                    db.add(models.ProjectMember(project_id=project.id, user_id=users[user_key].id, project_role=role))

            tags = {}
            for tag_name, color in TAG_COLORS.items():
                tag = models.Tag(project_id=project.id, name=tag_name, color_hex=color)
                db.add(tag)
                db.flush()
                tags[tag_name] = tag

            for board_index, board_spec in enumerate(spec["boards"]):
                board = models.Board(
                    project_id=project.id,
                    name=board_spec["name"],
                    description=board_spec["description"],
                    visibility="private",
                    order_index=board_index,
                    is_archived=False,
                    created_at=project.created_at + timedelta(days=board_index),
                )
                db.add(board)
                db.flush()
                stats["boards"] += 1

                column_by_name = {}
                for col_index, (col_name, color, is_done) in enumerate(COLUMNS, start=1):
                    col = models.BoardColumn(
                        board_id=board.id,
                        name=col_name,
                        order_index=col_index,
                        color=color,
                        wip_limit=20,
                        is_done=is_done,
                    )
                    db.add(col)
                    db.flush()
                    column_by_name[col_name] = col

                order_by_column = {name: 0 for name, *_ in COLUMNS}
                for raw in board_spec["tasks"]:
                    col = column_by_name[raw["column"]]
                    order_by_column[raw["column"]] += 1
                    done = raw["column"] == "Done"
                    if done:
                        progress = 100
                    elif raw["column"] == "Review / Testing":
                        progress = 75 if raw["priority"] != "High" else 85
                    elif raw["column"] == "In Progress":
                        progress = 45 if raw["priority"] != "High" else 60
                    elif raw["column"] == "To Do":
                        progress = 10
                    else:
                        progress = 0

                    start_date = spec["start"] + timedelta(days=raw["start_offset"], hours=9)
                    due_date = spec["start"] + timedelta(days=raw["due_offset"], hours=17)
                    checklist_total = 2
                    checklist_completed = 2 if done else (1 if progress >= 45 else 0)

                    task = models.Task(
                        project_id=project.id,
                        column_id=col.id,
                        title=raw["title"],
                        description=raw["description"],
                        priority=raw["priority"],
                        task_type=raw["task_type"],
                        assignee_id=users[raw["assignee"]].id,
                        reporter_id=users["manager"].id,
                        start_date=start_date,
                        due_date=due_date,
                        estimated_hours=raw["hours"],
                        progress_percent=progress,
                        checklist_total=checklist_total,
                        checklist_completed=checklist_completed,
                        completed_at=due_date - timedelta(hours=2) if done else None,
                        order_index=order_by_column[raw["column"]],
                        is_ai_generated=raw["ai"],
                        created_at=start_date - timedelta(days=1),
                        updated_at=NOW,
                    )
                    db.add(task)
                    db.flush()
                    stats["tasks"] += 1

                    tag_names = set(raw["tags"])
                    tag_names.add(TYPE_TAG.get(raw["task_type"], "Bao cao"))
                    for tag_name in tag_names:
                        tag = tags.get(tag_name)
                        if tag:
                            task.tags.append(tag)

                    checklist_titles = [
                        "Xác nhận yêu cầu và dữ liệu đầu vào",
                        "Kiểm tra kết quả trên dữ liệu demo",
                    ]
                    if raw["task_type"] == "Docs":
                        checklist_titles = ["Soạn nội dung chính", "Review lại trước khi demo"]
                    elif raw["task_type"] == "Bug":
                        checklist_titles = ["Tái hiện lỗi", "Kiểm thử lại sau khi sửa"]

                    for idx, item_title in enumerate(checklist_titles):
                        db.add(models.TaskChecklistItem(
                            task_id=task.id,
                            title=item_title,
                            is_done=idx < checklist_completed,
                            order_index=idx,
                            created_at=task.created_at,
                            updated_at=NOW,
                        ))

                    db.add(models.ActivityLog(
                        project_id=project.id,
                        user_id=users["manager"].id,
                        action_type="create_task",
                        entity_id=task.id,
                        old_value=None,
                        new_value=task.title[:255],
                        created_at=task.created_at,
                    ))

                    if raw["priority"] == "High" and raw["column"] in {"To Do", "In Progress", "Review / Testing"}:
                        db.add(models.Notification(
                            user_id=task.assignee_id,
                            title="Task ưu tiên cao",
                            content=f"{task.title} cần được theo dõi sát deadline.",
                            link_url=f"/projects/{project.id}",
                            is_read=False,
                            created_at=NOW - timedelta(days=1),
                        ))

                    if stats["tasks"] % 5 == 0:
                        db.add(models.Comment(
                            task_id=task.id,
                            user_id=users["manager"].id,
                            content="Đã rà lại nội dung, cập nhật tiến độ giúp nhóm trước buổi họp tiếp theo.",
                            created_at=NOW - timedelta(hours=stats["tasks"] % 7 + 1),
                        ))

                messages = [
                    "Mọi người cập nhật tiến độ trước buổi họp nhóm nhé.",
                    "Các task kiểm thử nên ghi rõ dữ liệu test để cuối sprint dễ nghiệm thu.",
                    "Phần demo ưu tiên luồng chính, các chỉnh sửa nhỏ đưa vào backlog.",
                ]
                for idx, content in enumerate(messages):
                    db.add(models.ProjectMessage(
                        project_id=project.id,
                        user_id=users["manager"].id if idx == 0 else users["linh"].id,
                        content=content,
                        created_at=NOW - timedelta(days=3 - idx, hours=idx),
                        updated_at=NOW - timedelta(days=3 - idx, hours=idx),
                    ))

        db.commit()
        return stats


def main() -> None:
    backup_path = backup_database()
    stats = seed_database()
    print("Backup:", backup_path)
    print("Seed complete:", stats)
    print("Demo accounts:")
    print("  Admin   demo.admin@agileai-demo.com / 123456")
    print("  Manager demo.manager@agileai-demo.com / 123456")
    print("  Users   huy.huynh@agileai-demo.com, linh.tester@agileai-demo.com, ... / 123456")


if __name__ == "__main__":
    main()
