from sqlalchemy.orm import Session, selectinload
from sqlalchemy import func
from fastapi import HTTPException
from typing import Optional
from datetime import datetime, timezone
from app import models, schemas
from app.crud.notification import push_notification


def _utcnow() -> datetime:
    """Trả về datetime UTC hiện tại (naive, tương thích MySQL DateTime)"""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _normalize_timestamp(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is not None:
        value = value.astimezone(timezone.utc).replace(tzinfo=None)
    return value.replace(microsecond=0)


def _ensure_task_not_stale(task: models.Task, expected_updated_at: datetime | None) -> None:
    if expected_updated_at is None:
        return
    current = _normalize_timestamp(task.updated_at)
    expected = _normalize_timestamp(expected_updated_at)
    if current != expected:
        raise HTTPException(
            status_code=409,
            detail="Task vừa được người khác cập nhật. Vui lòng tải lại bảng.",
        )


def _get_task_with_tags(db: Session, task_id: int) -> models.Task | None:
    """Query task kèm eager-load tags — dùng sau commit để tránh lazy-load lỗi"""
    return (
        db.query(models.Task)
        .options(selectinload(models.Task.tags))
        .filter(models.Task.id == task_id, models.Task.deleted_at.is_(None))
        .first()
    )


def _ensure_column_in_project(db: Session, column_id: int, project_id: int) -> models.BoardColumn:
    column = (
        db.query(models.BoardColumn)
        .join(models.Board)
        .filter(
            models.BoardColumn.id == column_id,
            models.BoardColumn.deleted_at.is_(None),
            models.Board.id == models.BoardColumn.board_id,
            models.Board.project_id == project_id,
        )
        .first()
    )
    if not column:
        raise HTTPException(status_code=400, detail="Column does not belong to this project")
    return column


def _ensure_column_wip_allows_one_more_task(db: Session, column_id: int, project_id: int) -> None:
    """Chặn thêm / chuyển task vào cột nếu đã đạt wip_limit (chỉ đếm task chưa soft-delete)."""
    col = _ensure_column_in_project(db, column_id, project_id)
    if col.wip_limit is None:
        return
    cnt = (
        db.query(func.count(models.Task.id))
        .filter(
            models.Task.column_id == column_id,
            models.Task.deleted_at.is_(None),
        )
        .scalar()
        or 0
    )
    if cnt + 1 > col.wip_limit:
        raise HTTPException(
            status_code=400,
            detail="Đã đạt giới hạn WIP của cột này",
        )


def _ensure_assignee_in_project(db: Session, assignee_id: int | None, project_id: int) -> None:
    if assignee_id is None:
        return

    project = db.query(models.Project).filter(
        models.Project.id == project_id,
        models.Project.deleted_at.is_(None),
    ).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    is_owner = project.owner_id == assignee_id
    is_member = db.query(models.ProjectMember).filter(
        models.ProjectMember.project_id == project_id,
        models.ProjectMember.user_id == assignee_id,
    ).first() is not None
    if not is_owner and not is_member:
        raise HTTPException(status_code=400, detail="Assignee must be a project member")


def _can_assign_any_member(db: Session, user_id: int, project_id: int) -> bool:
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if user and user.role == 'admin':
        return True

    project = db.query(models.Project).filter(
        models.Project.id == project_id,
        models.Project.deleted_at.is_(None),
    ).first()
    if project and project.owner_id == user_id:
        return True

    membership = db.query(models.ProjectMember).filter(
        models.ProjectMember.project_id == project_id,
        models.ProjectMember.user_id == user_id,
    ).first()
    return bool(
        membership
        and (membership.project_role == 'manager' or membership.can_manage_tasks)
    )


def _ensure_assignee_allowed_for_actor(
    db: Session,
    assignee_id: int | None,
    project_id: int,
    actor_id: int,
) -> None:
    _ensure_assignee_in_project(db, assignee_id, project_id)
    if assignee_id is None or assignee_id == actor_id:
        return
    if _can_assign_any_member(db, actor_id, project_id):
        return
    raise HTTPException(status_code=403, detail="Bạn chỉ có thể giao task cho chính mình")


def _can_update_task(db: Session, task: models.Task, user_id: int) -> bool:
    if _can_assign_any_member(db, user_id, task.project_id):
        return True
    return task.assignee_id == user_id


def _ensure_can_update_task(db: Session, task: models.Task, user_id: int) -> None:
    if not _can_update_task(db, task, user_id):
        raise HTTPException(
            status_code=403,
            detail="Bạn chỉ có thể cập nhật task được giao cho mình",
        )


def get_task_or_404(db: Session, task_id: int, project_id: int) -> models.Task:
    task = (
        db.query(models.Task)
        .options(selectinload(models.Task.tags))
        .filter(
            models.Task.id == task_id,
            models.Task.project_id == project_id,
            models.Task.deleted_at.is_(None),
        )
        .first()
    )
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


def create_task(db: Session, data: schemas.TaskCreate, reporter_id: int) -> models.Task:
    payload = data.model_dump()
    _ensure_column_in_project(db, payload['column_id'], data.project_id)
    _ensure_column_wip_allows_one_more_task(db, payload['column_id'], data.project_id)
    _ensure_assignee_allowed_for_actor(db, payload.get('assignee_id'), data.project_id, reporter_id)
    if payload.get('start_date') and payload.get('due_date') and payload['start_date'] > payload['due_date']:
        raise HTTPException(status_code=400, detail="Ngày bắt đầu không được sau ngày kết thúc")

    payload['progress_percent'] = min(100, max(0, payload.get('progress_percent') or 0))
    if payload.get('checklist_total') is not None and payload.get('checklist_completed') is not None:
        payload['checklist_completed'] = min(payload['checklist_total'], max(0, payload['checklist_completed']))

    # Auto-increment order_index nếu client gửi 0 hoặc không hợp lệ
    if not payload.get('order_index'):
        max_order = db.query(func.max(models.Task.order_index)).filter(
            models.Task.column_id == payload['column_id']
        ).scalar() or 0
        payload['order_index'] = max_order + 1

    task = models.Task(**payload, reporter_id=reporter_id)
    db.add(task)
    db.flush()

    _log(db, project_id=data.project_id, user_id=reporter_id,
         action_type="CREATED_TASK", entity_id=task.id)

    # Notify assignee if different from reporter
    if task.assignee_id and task.assignee_id != reporter_id:
        project = db.query(models.Project).filter(models.Project.id == data.project_id).first()
        project_name = project.name if project else f"Project #{data.project_id}"
        push_notification(
            db,
            recipient_user_id=task.assignee_id,
            title="Được giao công việc mới",
            content=f"Được giao: '{task.title}' trong {project_name}",
            link_url=f"/projects/{data.project_id}?task={task.id}",
        )

    db.commit()
    # Reload với eager tags để tránh lazy-load lỗi khi serialize
    return _get_task_with_tags(db, task.id)


def get_tasks(
    db: Session,
    project_id: int,
    priority: Optional[str] = None,
    assignee_id: Optional[int] = None
) -> list[models.Task]:
    query = (
        db.query(models.Task)
        .options(selectinload(models.Task.tags))
        .filter(
            models.Task.project_id == project_id,
            models.Task.deleted_at.is_(None),  # soft delete filter
            models.Task.column.has(models.BoardColumn.deleted_at.is_(None)),
        )
    )
    if priority:
        query = query.filter(models.Task.priority == priority)
    if assignee_id:
        query = query.filter(models.Task.assignee_id == assignee_id)
    return query.all()


def move_task(
    db: Session,
    task: models.Task,
    new_column_id: int,
    user_id: int,
    expected_updated_at: datetime | None = None,
) -> models.Task:
    _ensure_can_update_task(db, task, user_id)
    _ensure_task_not_stale(task, expected_updated_at)
    target_column = _ensure_column_in_project(db, new_column_id, task.project_id)
    if new_column_id != task.column_id:
        _ensure_column_wip_allows_one_more_task(db, new_column_id, task.project_id)
    old_col = str(task.column_id)
    task.column_id = new_column_id

    # Đồng bộ trạng thái hoàn thành khi kéo task vào / ra cột Done.
    if target_column.is_done:
        task.progress_percent = 100
        if task.completed_at is None:
            task.completed_at = _utcnow()
    elif task.progress_percent >= 100:
        task.completed_at = None

    _log(db, project_id=task.project_id, user_id=user_id,
         action_type="MOVED_TASK", entity_id=task.id,
         old_value=old_col, new_value=str(new_column_id))

    db.commit()
    # Reload với eager tags để tránh lazy-load lỗi khi serialize
    return _get_task_with_tags(db, task.id)


def update_task(db: Session, task: models.Task, data: schemas.TaskUpdate, user_id: int) -> models.Task:
    _ensure_can_update_task(db, task, user_id)
    update_data = data.model_dump(exclude_unset=True)
    expected_updated_at = update_data.pop("expected_updated_at", None)
    _ensure_task_not_stale(task, expected_updated_at)
    next_start = update_data.get('start_date', task.start_date)
    next_due = update_data.get('due_date', task.due_date)
    if next_start and next_due and next_start > next_due:
        raise HTTPException(status_code=400, detail="Ngày bắt đầu không được sau ngày kết thúc")
    assignee_changed = 'assignee_id' in update_data and update_data.get('assignee_id') != task.assignee_id
    if assignee_changed:
        _ensure_assignee_allowed_for_actor(db, update_data.get('assignee_id'), task.project_id, user_id)

    if 'progress_percent' in update_data and update_data['progress_percent'] is not None:
        update_data['progress_percent'] = min(100, max(0, update_data['progress_percent']))
        if 'completed_at' not in update_data:
            if update_data['progress_percent'] == 100:
                if task.completed_at is None:
                    update_data['completed_at'] = _utcnow()
            else:
                update_data['completed_at'] = None

    if 'checklist_total' in update_data and update_data['checklist_total'] is not None and update_data['checklist_total'] < 0:
        update_data['checklist_total'] = 0

    if 'checklist_completed' in update_data and update_data['checklist_completed'] is not None:
        total = update_data.get('checklist_total', task.checklist_total or 0)
        update_data['checklist_completed'] = min(total, max(0, update_data['checklist_completed']))

    actual_changed_fields = [
        key for key, value in update_data.items()
        if getattr(task, key, None) != value
    ]
    if not actual_changed_fields:
        return _get_task_with_tags(db, task.id)

    for key, value in update_data.items():
        setattr(task, key, value)

    # Chỉ log tên các field thay đổi để tránh vượt VARCHAR(255)
    changed_fields = ", ".join(actual_changed_fields)
    _log(db, project_id=task.project_id, user_id=user_id,
         action_type="UPDATED_TASK", entity_id=task.id,
         new_value=changed_fields[:250])

    # Notify new assignee if assignee changed
    new_assignee_id = update_data.get('assignee_id')
    if assignee_changed and new_assignee_id and new_assignee_id != user_id:
        project = db.query(models.Project).filter(models.Project.id == task.project_id).first()
        project_name = project.name if project else f"Project #{task.project_id}"
        push_notification(
            db,
            recipient_user_id=new_assignee_id,
            title="Được giao công việc",
            content=f"Bạn vừa được giao: '{task.title}' trong {project_name}",
            link_url=f"/projects/{task.project_id}?task={task.id}",
        )
    else:
        meaningful_fields = [
            key for key in actual_changed_fields
            if key not in {"checklist_total", "checklist_completed", "completed_at"}
        ]
        if task.assignee_id and task.assignee_id != user_id and meaningful_fields:
            actor = db.query(models.User).filter(models.User.id == user_id).first()
            actor_name = actor.full_name if actor else f"User #{user_id}"
            push_notification(
                db,
                recipient_user_id=task.assignee_id,
                title="C\u00f4ng vi\u1ec7c \u0111\u01b0\u1ee3c c\u1eadp nh\u1eadt",
                content=f"{actor_name} \u0111\u00e3 c\u1eadp nh\u1eadt c\u00f4ng vi\u1ec7c: '{task.title}'",
                link_url=f"/projects/{task.project_id}?task={task.id}",
            )

    db.commit()
    # Reload với eager tags để tránh lazy-load lỗi khi serialize
    return _get_task_with_tags(db, task.id)


def list_checklist_items(db: Session, task: models.Task) -> list[models.TaskChecklistItem]:
    return db.query(models.TaskChecklistItem).filter(
        models.TaskChecklistItem.task_id == task.id
    ).order_by(models.TaskChecklistItem.order_index, models.TaskChecklistItem.id).all()


def get_checklist_item_or_404(db: Session, task: models.Task, item_id: int) -> models.TaskChecklistItem:
    item = db.query(models.TaskChecklistItem).filter(
        models.TaskChecklistItem.id == item_id,
        models.TaskChecklistItem.task_id == task.id
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Checklist item not found")
    return item


def create_checklist_item(
    db: Session,
    task: models.Task,
    data: schemas.TaskChecklistItemCreate,
    user_id: int
) -> models.TaskChecklistItem:
    _ensure_can_update_task(db, task, user_id)
    payload = data.model_dump()
    if payload.get('order_index') in (None, 0):
        max_order = db.query(func.max(models.TaskChecklistItem.order_index)).filter(
            models.TaskChecklistItem.task_id == task.id
        ).scalar() or 0
        payload['order_index'] = max_order + 1

    item = models.TaskChecklistItem(**payload, task_id=task.id)
    db.add(item)
    db.flush()

    _sync_checklist_counts(db, task)
    _log(db, project_id=task.project_id, user_id=user_id,
         action_type="ADDED_CHECKLIST_ITEM", entity_id=item.id)

    db.commit()
    db.refresh(item)
    return item


def update_checklist_item(
    db: Session,
    task: models.Task,
    item: models.TaskChecklistItem,
    data: schemas.TaskChecklistItemUpdate,
    user_id: int
) -> models.TaskChecklistItem:
    _ensure_can_update_task(db, task, user_id)
    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(item, key, value)

    _sync_checklist_counts(db, task)
    _log(db, project_id=task.project_id, user_id=user_id,
         action_type="UPDATED_CHECKLIST_ITEM", entity_id=item.id,
         new_value=", ".join(update_data.keys())[:250])

    db.commit()
    db.refresh(item)
    return item


def delete_checklist_item(
    db: Session,
    task: models.Task,
    item: models.TaskChecklistItem,
    user_id: int
) -> None:
    _ensure_can_update_task(db, task, user_id)
    db.delete(item)
    db.flush()
    _sync_checklist_counts(db, task)
    _log(db, project_id=task.project_id, user_id=user_id,
         action_type="DELETED_CHECKLIST_ITEM", entity_id=item.id)
    db.commit()


def _sync_checklist_counts(db: Session, task: models.Task) -> None:
    total = db.query(models.TaskChecklistItem).filter(
        models.TaskChecklistItem.task_id == task.id
    ).count()
    completed = db.query(models.TaskChecklistItem).filter(
        models.TaskChecklistItem.task_id == task.id,
        models.TaskChecklistItem.is_done.is_(True)
    ).count()
    task.checklist_total = total
    task.checklist_completed = completed
    if total > 0 and completed == total:
        # Tất cả items đều done → đánh dấu completed nếu chưa
        if task.completed_at is None:
            task.completed_at = _utcnow()
    else:
        # Chưa hoàn thành hết → xóa completed_at
        task.completed_at = None
    db.flush()


def delete_task(db: Session, task: models.Task, user_id: int) -> None:
    """Soft delete: đánh dấu deleted_at, không xóa khỏi DB"""
    task.deleted_at = _utcnow()
    _log(db, project_id=task.project_id, user_id=user_id,
         action_type="DELETED_TASK", entity_id=task.id)
    db.commit()


def restore_task(db: Session, task_id: int, project_id: int, user_id: int) -> models.Task:
    """Khôi phục task đã soft-delete; kiểm tra WIP cột đích."""
    task = (
        db.query(models.Task)
        .filter(
            models.Task.id == task_id,
            models.Task.project_id == project_id,
        )
        .first()
    )
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if task.deleted_at is None:
        return _get_task_with_tags(db, task.id)

    _ensure_column_wip_allows_one_more_task(db, task.column_id, project_id)

    task.deleted_at = None
    _log(
        db,
        project_id=task.project_id,
        user_id=user_id,
        action_type="RESTORED_TASK",
        entity_id=task.id,
    )
    db.commit()
    return _get_task_with_tags(db, task.id)


def _log(
    db: Session,
    project_id: int,
    user_id: int,
    action_type: str,
    entity_id: int,
    old_value: Optional[str] = None,
    new_value: Optional[str] = None
) -> None:
    """Helper nội bộ: ghi ActivityLog. Giá trị được truncate vào 250 ký tự để không vượt VARCHAR(255)."""
    db.add(models.ActivityLog(
        project_id=project_id,
        user_id=user_id,
        action_type=action_type,
        entity_id=entity_id,
        old_value=(old_value[:250] if old_value else None),
        new_value=(new_value[:250] if new_value else None),
    ))
