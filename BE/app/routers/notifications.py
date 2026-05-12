from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from typing import List

from app import schemas, models
from app.database import get_db
from app.core.deps import get_current_user
from app.crud import notification as crud_notification

router = APIRouter(prefix="/notifications", tags=["Notifications"])


@router.get("/", response_model=List[schemas.NotificationResponse])
def get_my_notifications(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Lấy danh sách thông báo của user đang đăng nhập"""
    return crud_notification.get_notifications(db, current_user.id)


@router.put("/mark_all_read", status_code=status.HTTP_204_NO_CONTENT)
def mark_all_as_read(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Đánh dấu tất cả thông báo là đã đọc"""
    crud_notification.mark_all_as_read(db, current_user.id)


@router.put("/{notification_id}/read", status_code=status.HTTP_204_NO_CONTENT)
def mark_as_read(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Đánh dấu 1 thông báo là đã đọc"""
    crud_notification.mark_as_read(db, notification_id, current_user.id)
