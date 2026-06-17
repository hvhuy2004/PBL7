from __future__ import annotations

from datetime import datetime, timedelta
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.database import SessionLocal  # noqa: E402
from app import models  # noqa: E402


DEMO_MANAGER_EMAIL = "demo.manager@agileai-demo.com"


def vn_now_naive() -> datetime:
    return (datetime.utcnow() + timedelta(hours=7)).replace(second=0, microsecond=0)


def enrich_activity_times(db) -> int:
    logs = (
        db.query(models.ActivityLog)
        .order_by(models.ActivityLog.created_at.desc(), models.ActivityLog.id.desc())
        .limit(180)
        .all()
    )
    base = vn_now_naive() - timedelta(minutes=7)
    updated = 0
    minute_steps = [0, 13, 27, 41, 58, 74, 96, 118, 143, 171, 205, 239]
    for index, log in enumerate(logs):
        day_offset = index // 28
        minute_offset = minute_steps[index % len(minute_steps)] + (index // len(minute_steps)) * 23
        new_time = base - timedelta(days=day_offset, minutes=minute_offset)
        if log.created_at != new_time:
            log.created_at = new_time
            updated += 1
    return updated


def task_link(db, title: str, fallback: str = "/projects") -> str:
    task = (
        db.query(models.Task)
        .filter(models.Task.title == title, models.Task.deleted_at.is_(None))
        .order_by(models.Task.id.desc())
        .first()
    )
    if not task:
        return fallback
    return f"/projects/{task.project_id}?task={task.id}"


def add_manager_notifications(db) -> int:
    manager = db.query(models.User).filter(models.User.email == DEMO_MANAGER_EMAIL).first()
    if not manager:
        return 0

    # Keep demo notifications concise and action-driven for the defense.
    db.query(models.Notification).filter(models.Notification.user_id == manager.id).delete(synchronize_session=False)

    now = vn_now_naive()
    items = [
        {
            "title": "Công việc sắp đến hạn",
            "content": "Tổng kiểm tra dữ liệu trước ngày bảo vệ cần được rà soát tiến độ trong hôm nay.",
            "link_url": task_link(db, "Tổng kiểm tra dữ liệu trước ngày bảo vệ", "/projects/5"),
            "is_read": False,
            "created_at": now - timedelta(minutes=24),
        },
        {
            "title": "Bạn được nhắc trong bình luận",
            "content": "Linh Nguyễn nhắc bạn kiểm tra lại kịch bản demo hội đồng và checklist phản biện.",
            "link_url": task_link(db, "Chuẩn bị kịch bản demo hội đồng", "/projects/5"),
            "is_read": False,
            "created_at": now - timedelta(hours=1, minutes=18),
        },
        {
            "title": "Checklist được cập nhật",
            "content": "Một mục nghiệm thu của công việc kiểm thử chống trùng task bằng embedding vừa được hoàn thành.",
            "link_url": task_link(db, "Kiểm thử chống trùng task bằng embedding", "/projects/5"),
            "is_read": True,
            "created_at": now - timedelta(hours=3, minutes=5),
        },
        {
            "title": "Thành viên cập nhật tiến độ",
            "content": "Khoa Trần đã cập nhật tiến độ phần Docker Compose, bạn có thể xem lại trên bảng Kanban.",
            "link_url": task_link(db, "Đóng gói Docker Compose cho deploy", "/projects/5"),
            "is_read": True,
            "created_at": now - timedelta(days=1, hours=2),
        },
        {
            "title": "Yêu cầu đặt lịch cần xử lý",
            "content": "Dự án Website đặt lịch phòng học có màn hình duyệt lịch cần được kiểm tra trước khi demo.",
            "link_url": task_link(db, "Thiết kế màn hình duyệt lịch cho quản lý", "/projects/1"),
            "is_read": True,
            "created_at": now - timedelta(days=1, hours=5, minutes=30),
        },
    ]

    for item in items:
        db.add(models.Notification(user_id=manager.id, **item))
    return len(items)


def main() -> None:
    with SessionLocal() as db:
        updated_logs = enrich_activity_times(db)
        notifications = add_manager_notifications(db)
        db.commit()
    print(f"Updated {updated_logs} activity log timestamps.")
    print(f"Inserted {notifications} clean demo notifications for Nguyen An.")


if __name__ == "__main__":
    main()
