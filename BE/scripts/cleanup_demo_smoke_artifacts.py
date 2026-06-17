from __future__ import annotations

from pathlib import Path
import sys

from sqlalchemy import or_


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app import models  # noqa: E402
from app.database import SessionLocal  # noqa: E402


SMOKE_PATTERNS = [
    "%SMOKE%",
    "%Smoke%",
    "%smoke%",
    "%Extended smoke%",
    "%QA delete smoke%",
    "%[SMOKE TEST]%",
]


def like_any(column):
    return or_(*[column.like(pattern) for pattern in SMOKE_PATTERNS])


def main() -> None:
    with SessionLocal() as db:
        demo_admin = db.query(models.User).filter(models.User.email == "demo.admin@agileai-demo.com").first()

        log_filters = [
            like_any(models.ActivityLog.new_value),
            like_any(models.ActivityLog.old_value),
        ]
        if demo_admin:
            log_filters.append(models.ActivityLog.user_id == demo_admin.id)

        smoke_task_ids = [
            row.id
            for row in db.query(models.Task.id)
            .filter(like_any(models.Task.title))
            .all()
        ]
        if smoke_task_ids:
            log_filters.append(models.ActivityLog.entity_id.in_(smoke_task_ids))

        deleted_logs = db.query(models.ActivityLog).filter(or_(*log_filters)).delete(synchronize_session=False)

        deleted_messages = db.query(models.ProjectMessage).filter(
            like_any(models.ProjectMessage.content)
        ).delete(synchronize_session=False)

        deleted_comments = db.query(models.Comment).filter(
            like_any(models.Comment.content)
        ).delete(synchronize_session=False)

        db.commit()

    print(f"Deleted {deleted_logs} smoke activity log(s).")
    print(f"Deleted {deleted_messages} smoke project message(s).")
    print(f"Deleted {deleted_comments} smoke comment(s).")


if __name__ == "__main__":
    main()
