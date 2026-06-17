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


def utc_now_naive() -> datetime:
    return datetime.utcnow().replace(second=0, microsecond=0)


def enrich_activity_times(db) -> int:
    logs = (
        db.query(models.ActivityLog)
        .order_by(models.ActivityLog.created_at.desc(), models.ActivityLog.id.desc())
        .limit(180)
        .all()
    )
    base = utc_now_naive() - timedelta(minutes=7)
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
            created_at=utc_now_naive() - timedelta(hours=1, minutes=18),
        ))
    return task


def ensure_project_message(db, project_id: int, author_email: str, content: str) -> models.ProjectMessage | None:
    author = db.query(models.User).filter(models.User.email == author_email).first()
    project = db.query(models.Project).filter(models.Project.id == project_id, models.Project.deleted_at.is_(None)).first()
    if not author or not project:
        return None
    message = db.query(models.ProjectMessage).filter(
        models.ProjectMessage.project_id == project_id,
        models.ProjectMessage.user_id == author.id,
        models.ProjectMessage.content == content,
        models.ProjectMessage.deleted_at.is_(None),
    ).first()
    if message:
        return message
    message = models.ProjectMessage(
        project_id=project_id,
        user_id=author.id,
        content=content,
        created_at=utc_now_naive() - timedelta(minutes=42),
        updated_at=utc_now_naive() - timedelta(minutes=42),
    )
    db.add(message)
    db.flush()
    return message


def ensure_task_window(db, task_title: str) -> models.Task | None:
    task = (
        db.query(models.Task)
        .filter(models.Task.title == task_title, models.Task.deleted_at.is_(None))
        .order_by(models.Task.id.desc())
        .first()
    )
    if not task:
        return None
    now = utc_now_naive()
    task.start_date = now - timedelta(hours=2)
    task.due_date = now + timedelta(days=1, hours=3)
    return task


def ensure_update_event(db, task_title: str, actor_email: str, assignee_email: str) -> models.Task | None:
    task = (
        db.query(models.Task)
        .filter(models.Task.title == task_title, models.Task.deleted_at.is_(None))
        .order_by(models.Task.id.desc())
        .first()
    )
    actor = db.query(models.User).filter(models.User.email == actor_email).first()
    assignee = db.query(models.User).filter(models.User.email == assignee_email).first()
    if not task or not actor or not assignee:
        return task
    task.assignee_id = assignee.id
    task.progress_percent = max(task.progress_percent or 0, 85)
    task.updated_at = utc_now_naive() - timedelta(minutes=56)
    exists = db.query(models.ActivityLog).filter(
        models.ActivityLog.project_id == task.project_id,
        models.ActivityLog.user_id == actor.id,
        models.ActivityLog.action_type == "UPDATED_TASK",
        models.ActivityLog.entity_id == task.id,
        models.ActivityLog.new_value == "progress_percent, due_date",
    ).first()
    if not exists:
        db.add(models.ActivityLog(
            project_id=task.project_id,
            user_id=actor.id,
            action_type="UPDATED_TASK",
            entity_id=task.id,
            new_value="progress_percent, due_date",
            created_at=utc_now_naive() - timedelta(minutes=56),
        ))
    return task


def add_manager_notifications(db) -> int:
    manager = db.query(models.User).filter(models.User.email == DEMO_MANAGER_EMAIL).first()
    if not manager:
        return 0

    # Keep demo notifications tied to real backend flows only.
    db.query(models.Notification).filter(models.Notification.user_id == manager.id).delete(synchronize_session=False)

    now = utc_now_naive()
    mention_comment = "@demo.manager ki\u1ec3m tra l\u1ea1i k\u1ecbch b\u1ea3n demo h\u1ed9i \u0111\u1ed3ng v\u00e0 checklist ph\u1ea3n bi\u1ec7n gi\u00fap m\u00ecnh nh\u00e9."
    mention_task = ensure_comment(
        db,
        "Chu\u1ea9n b\u1ecb k\u1ecbch b\u1ea3n demo h\u1ed9i \u0111\u1ed3ng",
        "linh.tester@agileai-demo.com",
        mention_comment,
    )
    assigned_task = ensure_task_window(db, "T\u1ed5ng ki\u1ec3m tra d\u1eef li\u1ec7u tr\u01b0\u1edbc ng\u00e0y b\u1ea3o v\u1ec7")
    assigned_link = (
        f"/projects/{assigned_task.project_id}?task={assigned_task.id}"
        if assigned_task else "/projects/5"
    )
    review_comment = "M\u00ecnh \u0111\u00e3 r\u00e0 l\u1ea1i checklist, nh\u1edd @demo.manager xem ph\u1ea7n k\u1ebft lu\u1eadn tr\u01b0\u1edbc khi ch\u1ed1t demo."
    review_task = ensure_comment(
        db,
        "Ki\u1ec3m th\u1eed ch\u1ed1ng tr\u00f9ng task b\u1eb1ng embedding",
        "khoa.backend@agileai-demo.com",
        review_comment,
    )
    project_message = ensure_project_message(
        db,
        5,
        "linh.tester@agileai-demo.com",
        "M\u1ecdi ng\u01b0\u1eddi th\u1ed1ng nh\u1ea5t d\u00f9ng lu\u1ed3ng AI t\u1ea1o task v\u00e0 ch\u1ed1ng tr\u00f9ng l\u1eb7p cho ph\u1ea7n demo ch\u00ednh nh\u00e9.",
    )
    updated_task = ensure_update_event(
        db,
        "T\u1ed5ng ki\u1ec3m tra d\u1eef li\u1ec7u tr\u01b0\u1edbc ng\u00e0y b\u1ea3o v\u1ec7",
        "linh.tester@agileai-demo.com",
        DEMO_MANAGER_EMAIL,
    )

    items = [
        {
            "title": "\u0110\u01b0\u1ee3c giao c\u00f4ng vi\u1ec7c",
            "content": "B\u1ea1n \u0111\u01b0\u1ee3c giao c\u00f4ng vi\u1ec7c 'T\u1ed5ng ki\u1ec3m tra d\u1eef li\u1ec7u tr\u01b0\u1edbc ng\u00e0y b\u1ea3o v\u1ec7'.",
            "link_url": assigned_link,
            "is_read": False,
            "created_at": now - timedelta(minutes=18),
        },
        {
            "title": "Tin nh\u1eafn d\u1ef1 \u00e1n m\u1edbi",
            "content": "Linh Nguy\u1ec5n: M\u1ecdi ng\u01b0\u1eddi th\u1ed1ng nh\u1ea5t d\u00f9ng lu\u1ed3ng AI t\u1ea1o task v\u00e0 ch\u1ed1ng tr\u00f9ng l\u1eb7p cho ph\u1ea7n demo ch\u00ednh nh\u00e9.",
            "link_url": f"/messages?projectId={project_message.project_id}" if project_message else "/messages",
            "is_read": False,
            "created_at": now - timedelta(minutes=42),
        },
        {
            "title": "C\u00f4ng vi\u1ec7c \u0111\u01b0\u1ee3c c\u1eadp nh\u1eadt",
            "content": "Linh Nguy\u1ec5n \u0111\u00e3 c\u1eadp nh\u1eadt ti\u1ebfn \u0111\u1ed9 v\u00e0 h\u1ea1n c\u1ee7a c\u00f4ng vi\u1ec7c b\u1ea1n \u0111ang nh\u1eadn.",
            "link_url": f"/projects/{updated_task.project_id}?task={updated_task.id}" if updated_task else "/projects/5",
            "is_read": False,
            "created_at": now - timedelta(minutes=56),
        },
        {
            "title": "B\u1ea1n \u0111\u01b0\u1ee3c nh\u1eafc trong b\u00ecnh lu\u1eadn",
            "content": "Linh Nguy\u1ec5n nh\u1eafc b\u1ea1n ki\u1ec3m tra l\u1ea1i k\u1ecbch b\u1ea3n demo h\u1ed9i \u0111\u1ed3ng v\u00e0 checklist ph\u1ea3n bi\u1ec7n.",
            "link_url": f"/projects/{mention_task.project_id}?task={mention_task.id}" if mention_task else "/projects/5",
            "is_read": False,
            "created_at": now - timedelta(hours=1, minutes=18),
        },
        {
            "title": "B\u00ecnh lu\u1eadn m\u1edbi tr\u00ean c\u00f4ng vi\u1ec7c c\u1ee7a b\u1ea1n",
            "content": "Khoa Tr\u1ea7n \u0111\u00e3 b\u00ecnh lu\u1eadn trong c\u00f4ng vi\u1ec7c ki\u1ec3m th\u1eed ch\u1ed1ng tr\u00f9ng task b\u1eb1ng embedding.",
            "link_url": f"/projects/{review_task.project_id}?task={review_task.id}" if review_task else "/projects/5",
            "is_read": True,
            "created_at": now - timedelta(hours=2, minutes=4),
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
