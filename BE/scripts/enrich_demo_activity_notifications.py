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


def ensure_comment(db, task_title: str, author_email: str, content: str) -> models.Task | None:
    task = (
        db.query(models.Task)
        .filter(models.Task.title == task_title, models.Task.deleted_at.is_(None))
        .order_by(models.Task.id.desc())
        .first()
    )
    author = db.query(models.User).filter(models.User.email == author_email).first()
    if not task or not author:
        return task

    exists = db.query(models.Comment).filter(
        models.Comment.task_id == task.id,
        models.Comment.user_id == author.id,
        models.Comment.content == content,
        models.Comment.deleted_at.is_(None),
    ).first()
    if not exists:
        db.add(models.Comment(
            task_id=task.id,
            user_id=author.id,
            content=content,
            created_at=vn_now_naive() - timedelta(hours=1, minutes=18),
        ))
    return task


def add_manager_notifications(db) -> int:
    manager = db.query(models.User).filter(models.User.email == DEMO_MANAGER_EMAIL).first()
    if not manager:
        return 0

    # Keep demo notifications concise and action-driven for the defense.
    db.query(models.Notification).filter(models.Notification.user_id == manager.id).delete(synchronize_session=False)

    now = vn_now_naive()
    mention_comment = "@demo.manager kiểm tra lại kịch bản demo hội đồng và checklist phản biện giúp mình nhé."
    mention_task = ensure_comment(
        db,
        "Chuẩn bị kịch bản demo hội đồng",
        "linh.tester@agileai-demo.com",
        mention_comment,
    )
    assigned_link = task_link(db, "Tổng kiểm tra dữ liệu trước ngày bảo vệ", "/projects/5")
    items = [
        {
            "title": "Được giao công việc",
            "content": "Bạn được giao công việc 'Tổng kiểm tra dữ liệu trước ngày bảo vệ'.",
            "link_url": assigned_link,
            "is_read": False,
            "created_at": now - timedelta(minutes=24),
        },
        {
            "title": "Bạn được nhắc trong bình luận",
            "content": "Linh Nguyễn nhắc bạn kiểm tra lại kịch bản demo hội đồng và checklist phản biện.",
            "link_url": f"/projects/{mention_task.project_id}?task={mention_task.id}" if mention_task else "/projects/5",
            "is_read": False,
            "created_at": now - timedelta(hours=1, minutes=18),
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
