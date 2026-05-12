from sqlalchemy.orm import Session
from fastapi import HTTPException
from app import models


def get_notifications(db: Session, user_id: int) -> list[models.Notification]:
    return db.query(models.Notification).filter(
        models.Notification.user_id == user_id
    ).order_by(models.Notification.created_at.desc()).limit(100).all()


def mark_as_read(db: Session, notification_id: int, user_id: int) -> None:
    noti = db.query(models.Notification).filter(
        models.Notification.id == notification_id,
        models.Notification.user_id == user_id
    ).first()
    if not noti:
        raise HTTPException(status_code=404, detail="Notification not found")
    noti.is_read = True
    db.commit()


def mark_all_as_read(db: Session, user_id: int) -> None:
    db.query(models.Notification).filter(
        models.Notification.user_id == user_id
    ).update({"is_read": True})
    db.commit()


def push_notification(
    db: Session,
    recipient_user_id: int,
    title: str,
    content: str,
    link_url: str | None = None,
) -> None:
    """Tạo một thông báo cho user_id chỉ định.
    Không raise exception để tránh làm hỏng luồng chính.
    """
    try:
        noti = models.Notification(
            user_id=recipient_user_id,
            title=title[:100],
            content=content[:255],
            link_url=link_url,
            is_read=False,
        )
        db.add(noti)
        # Không commit ở đây — để caller commit chung 1 transaction
    except Exception:
        pass  # Notification failure must NOT break main flow
