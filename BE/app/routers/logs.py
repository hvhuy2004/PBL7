from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import desc
from sqlalchemy.orm import Session

from app import models
from app.core.deps import require_project_member
from app.database import get_db

router = APIRouter(prefix="/logs", tags=["Activity Logs"])


ACTION_LABELS = {
    "CREATED_TASK": "đã tạo task",
    "UPDATED_TASK": "đã cập nhật task",
    "DELETED_TASK": "đã xóa task",
    "RESTORED_TASK": "đã khôi phục task",
    "MOVED_TASK": "đã chuyển task",
    "ADDED_COMMENT": "đã bình luận vào task",
    "ADDED_CHECKLIST_ITEM": "đã thêm checklist vào task",
    "UPDATED_CHECKLIST_ITEM": "đã cập nhật checklist",
    "DELETED_CHECKLIST_ITEM": "đã xóa checklist",
    "POSTED_PROJECT_MESSAGE": "đã gửi tin nhắn dự án",
    "DELETED_PROJECT_MESSAGE": "đã xóa tin nhắn dự án",
}

TASK_ACTIONS = {
    "CREATED_TASK",
    "UPDATED_TASK",
    "DELETED_TASK",
    "RESTORED_TASK",
    "MOVED_TASK",
    "ADDED_COMMENT",
    "ADDED_CHECKLIST_ITEM",
    "UPDATED_CHECKLIST_ITEM",
    "DELETED_CHECKLIST_ITEM",
}

CHECKLIST_ACTIONS = {
    "ADDED_CHECKLIST_ITEM",
    "UPDATED_CHECKLIST_ITEM",
    "DELETED_CHECKLIST_ITEM",
}


def _task_title_for_log(db: Session, log: models.ActivityLog) -> str | None:
    if log.action_type not in TASK_ACTIONS:
        return None

    task_id = log.entity_id
    if log.action_type in CHECKLIST_ACTIONS:
        item = db.query(models.TaskChecklistItem).filter(
            models.TaskChecklistItem.id == log.entity_id
        ).first()
        if item:
            task_id = item.task_id
        elif log.old_value and log.old_value.isdigit():
            task_id = int(log.old_value)
        else:
            return f"Checklist #{log.entity_id}"

    task = db.query(models.Task).filter(models.Task.id == task_id).first()
    return task.title if task else f"Task #{task_id}"


@router.get("/project/{project_id}")
def get_project_logs(
    project_id: int,
    task_id: Optional[int] = Query(None, description="Lọc log theo task cụ thể"),
    limit: int = Query(100, le=200),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_project_member),
):
    q = db.query(models.ActivityLog).filter(models.ActivityLog.project_id == project_id)
    if task_id:
        q = q.filter(models.ActivityLog.entity_id == task_id)

    logs = q.order_by(desc(models.ActivityLog.created_at)).limit(limit).all()
    result = []

    for log in logs:
        user = db.query(models.User).filter(models.User.id == log.user_id).first()
        user_name = user.full_name if user else f"User #{log.user_id}"

        task_title = _task_title_for_log(db, log)

        action_label = ACTION_LABELS.get(log.action_type, log.action_type)
        try:
            if log.action_type == "MOVED_TASK" and log.old_value and log.new_value:
                old_col_id = int(log.old_value) if log.old_value.isdigit() else None
                new_col_id = int(log.new_value) if log.new_value.isdigit() else None
                old_col = db.query(models.BoardColumn).filter(models.BoardColumn.id == old_col_id).first() if old_col_id else None
                new_col = db.query(models.BoardColumn).filter(models.BoardColumn.id == new_col_id).first() if new_col_id else None
                old_name = old_col.name if old_col else f"Cột #{log.old_value}"
                new_name = new_col.name if new_col else f"Cột #{log.new_value}"
                description = f"{user_name} đã chuyển '{task_title or 'task'}' từ '{old_name}' sang '{new_name}'"
            elif task_title:
                description = f"{user_name} {action_label} '{task_title}'"
            else:
                description = f"{user_name} {action_label}"
        except Exception:
            description = f"{user_name} {action_label}"

        result.append({
            "id": log.id,
            "project_id": log.project_id,
            "user_id": log.user_id,
            "user_name": user_name,
            "action_type": log.action_type,
            "entity_id": log.entity_id,
            "task_title": task_title,
            "description": description,
            "old_value": log.old_value,
            "new_value": log.new_value,
            "created_at": log.created_at.isoformat() if log.created_at else None,
        })

    return result
