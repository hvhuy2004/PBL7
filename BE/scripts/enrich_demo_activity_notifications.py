from datetime import datetime, timedelta
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.database import SessionLocal  # noqa: E402
from app import models  # noqa: E402


DEMO_MANAGER_EMAIL = "demo.manager@agileai-demo.com"
DEMO_NOTIFICATION_TITLES = [
    "Công việc sắp đến hạn",
    "AI đã tổng kết dự án",
    "Cảnh báo công việc tương tự",
    "Bạn được nhắc trong bình luận",
    "Công việc ưu tiên cao",
    "Checklist được cập nhật",
    "Thành viên cập nhật tiến độ",
    "Tài liệu demo đã sẵn sàng",
]


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


def add_manager_notifications(db) -> int:
    manager = db.query(models.User).filter(models.User.email == DEMO_MANAGER_EMAIL).first()
    if not manager:
        return 0

    db.query(models.Notification).filter(
        models.Notification.user_id == manager.id,
        (
            models.Notification.title.in_(DEMO_NOTIFICATION_TITLES)
            | models.Notification.title.like("[DEMO]%")
        ),
    ).delete(synchronize_session=False)

    task_rows = (
        db.query(models.Task, models.Project)
        .join(models.Project, models.Project.id == models.Task.project_id)
        .filter(
            models.Task.deleted_at.is_(None),
            models.Project.deleted_at.is_(None),
        )
        .order_by(models.Task.due_date.is_(None), models.Task.due_date.asc(), models.Task.id.desc())
        .limit(8)
        .all()
    )
    task_items = [
        {
            "task": task,
            "project": project,
            "link": f"/projects/{project.id}?task={task.id}",
        }
        for task, project in task_rows
    ]
    fallback_link = "/projects"
    now = vn_now_naive()
    demo_items = [
        (
            "Công việc sắp đến hạn",
            f"{task_items[0]['task'].title if task_items else 'Chuẩn bị demo hệ thống'} cần được kiểm tra tiến độ trước buổi họp.",
            task_items[0]["link"] if task_items else fallback_link,
            False,
            now - timedelta(minutes=18),
        ),
        (
            "AI đã tổng kết dự án",
            "Hệ thống vừa tạo nhận định rủi ro, workload và các hành động đề xuất cho dự án.",
            task_items[1]["link"] if len(task_items) > 1 else fallback_link,
            False,
            now - timedelta(hours=1, minutes=12),
        ),
        (
            "Cảnh báo công việc tương tự",
            "Một task mới có nội dung gần giống task đã tồn tại, cần kiểm tra trước khi lưu.",
            task_items[2]["link"] if len(task_items) > 2 else fallback_link,
            False,
            now - timedelta(hours=2, minutes=35),
        ),
        (
            "Bạn được nhắc trong bình luận",
            "Linh Nguyễn đã nhắc bạn rà lại kịch bản demo và checklist nghiệm thu.",
            task_items[3]["link"] if len(task_items) > 3 else fallback_link,
            True,
            now - timedelta(hours=4, minutes=5),
        ),
        (
            "Công việc ưu tiên cao",
            f"{task_items[4]['task'].title if len(task_items) > 4 else 'Hoàn thiện báo cáo chương triển khai'} đang ở mức ưu tiên cao.",
            task_items[4]["link"] if len(task_items) > 4 else fallback_link,
            True,
            now - timedelta(days=1, hours=1),
        ),
        (
            "Checklist được cập nhật",
            "Một mục checklist nghiệm thu vừa được hoàn thành trong dự án demo.",
            task_items[5]["link"] if len(task_items) > 5 else fallback_link,
            True,
            now - timedelta(days=1, hours=3, minutes=20),
        ),
        (
            "Thành viên cập nhật tiến độ",
            "Khoa Trần đã cập nhật tiến độ task backend, bạn có thể xem lại trên bảng Kanban.",
            task_items[6]["link"] if len(task_items) > 6 else fallback_link,
            True,
            now - timedelta(days=2, hours=2),
        ),
        (
            "Tài liệu demo đã sẵn sàng",
            "Trang Lê đã hoàn tất phần tài liệu hướng dẫn thao tác và ghi chú phản biện.",
            task_items[7]["link"] if len(task_items) > 7 else fallback_link,
            True,
            now - timedelta(days=2, hours=5, minutes=45),
        ),
    ]

    for title, content, link_url, is_read, created_at in demo_items:
        db.add(models.Notification(
            user_id=manager.id,
            title=title,
            content=content,
            link_url=link_url,
            is_read=is_read,
            created_at=created_at,
        ))
    return len(demo_items)


def main() -> None:
    with SessionLocal() as db:
        updated_logs = enrich_activity_times(db)
        notifications = add_manager_notifications(db)
        db.commit()
    print(f"Updated {updated_logs} activity log timestamps.")
    print(f"Inserted {notifications} demo notifications for Nguyen An.")


if __name__ == "__main__":
    main()
