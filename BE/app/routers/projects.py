from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List
from datetime import datetime, timedelta, timezone

from app import schemas, models
from app.database import get_db
from app.core.deps import get_current_user, require_project_member
from app.crud import project as crud_project

router = APIRouter(prefix="/projects", tags=["Projects"])
VN_TIMEZONE = timezone(timedelta(hours=7))


@router.post("/", response_model=schemas.ProjectResponse, status_code=status.HTTP_201_CREATED)
def create_project(
    data: schemas.ProjectCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """(Logged-in user) Tạo Project mới (workspace-less), kèm Board + 3 cột mặc định."""
    return crud_project.create_project(db, data, current_user=current_user)


@router.get("/me", response_model=List[schemas.ProjectResponse])
def get_my_projects(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Lấy tất cả Project mà current user có quyền truy cập."""
    return crud_project.get_projects_for_user(db, current_user)


@router.get("/workspace/{workspace_id}", response_model=List[schemas.ProjectResponse])
def get_projects_by_workspace(
    workspace_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Deprecated: workspace no longer used. Kept for backward compatibility."""
    return crud_project.get_projects_for_user_in_workspace(db, workspace_id, current_user)


@router.get("/archived/all", response_model=list[schemas.ProjectResponse])
def get_archived_projects(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Lấy danh sách các project đã xóa mềm mà user có quyền truy cập"""
    if current_user.role == 'admin':
        projects = db.query(models.Project).filter(models.Project.deleted_at.is_not(None)).all()
        return projects

    owned = db.query(models.Project).filter(
        models.Project.owner_id == current_user.id,
        models.Project.deleted_at.is_not(None),
    ).all()
    member_projects = db.query(models.Project).join(models.ProjectMember).filter(
        models.ProjectMember.user_id == current_user.id,
        models.Project.deleted_at.is_not(None),
    ).all()

    merged = {p.id: p for p in (owned + member_projects)}
    return list(merged.values())


@router.get("/{project_id}", response_model=schemas.ProjectResponse)
def get_project(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Lấy thông tin 1 Project (chỉ thành viên/owner/admin)"""
    project = crud_project.get_project_or_404(db, project_id)
    if current_user.role != 'admin' and project.owner_id != current_user.id:
        is_member = any(m.user_id == current_user.id for m in project.members)
        if not is_member:
            raise HTTPException(status_code=403, detail="You are not a member of this project")
    return project


@router.put("/{project_id}", response_model=schemas.ProjectResponse)
def update_project(
    project_id: int,
    data: schemas.ProjectUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """(Manager/Admin) Cập nhật Project"""
    project = crud_project.get_project_or_404(db, project_id)
    # Check: phải là owner hoặc manager của project hoặc admin
    member = next((m for m in project.members if m.user_id == current_user.id), None)
    is_manager = bool(member and member.project_role == 'manager')
    if current_user.role != 'admin' and current_user.id != project.owner_id and not is_manager:
        raise HTTPException(status_code=403, detail="Only project owner/manager can update this project")
    return crud_project.update_project(db, project, data)


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """(Manager/Admin) Xóa Project"""
    project = crud_project.get_project_or_404(db, project_id)
    member = next((m for m in project.members if m.user_id == current_user.id), None)
    is_manager = bool(member and member.project_role == 'manager')
    if current_user.role != 'admin' and current_user.id != project.owner_id and not is_manager:
        raise HTTPException(status_code=403, detail="Only project owner/manager can delete this project")
    crud_project.delete_project(db, project)

@router.put("/{project_id}/restore", response_model=schemas.ProjectResponse)
def restore_project(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """(Manager/Admin) Khôi phục Project"""
    # Không dùng get_project_or_404 vì nó có thể đã filter deleted_at (nếu có)
    # Tạm thời query tay
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    member = next((m for m in project.members if m.user_id == current_user.id), None)
    is_manager = bool(member and member.project_role == 'manager')
    if current_user.role != 'admin' and current_user.id != project.owner_id and not is_manager:
        raise HTTPException(status_code=403, detail="Only project owner/manager can restore this project")
    
    project.deleted_at = None
    db.commit()
    db.refresh(project)
    return project

@router.get("/{project_id}/archived")
def get_archived_items(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_project_member)
):
    """Lấy danh sách các task và column đã xóa mềm trong project"""
    # Check quyền truy cập project
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    archived_tasks = db.query(models.Task).filter(
        models.Task.project_id == project_id,
        models.Task.deleted_at.is_not(None)
    ).all()

    # Archived columns (nằm trong các boards của project)
    board_ids = [b.id for b in project.boards]
    if board_ids:
        archived_columns = db.query(models.BoardColumn).filter(
            models.BoardColumn.board_id.in_(board_ids),
            models.BoardColumn.deleted_at.is_not(None)
        ).all()
    else:
        archived_columns = []

    # Serialize
    return {
        "tasks": [schemas.TaskResponse.model_validate(t) for t in archived_tasks],
        "columns": [schemas.BoardColumnResponse.model_validate(c) for c in archived_columns]
    }



@router.get("/{project_id}/stats")
def get_project_stats(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_project_member)
):
    """Thống kê task cho Dashboard: phân loại theo priority, 7 ngày hoàn thành, assignee breakdown"""
    # Access check
    project = db.query(models.Project).filter(
        models.Project.id == project_id,
        models.Project.deleted_at.is_(None)
    ).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    base_q = db.query(models.Task).filter(
        models.Task.project_id == project_id,
        models.Task.deleted_at.is_(None)
    )
    total = base_q.count()
    by_priority = {
        row.priority: row.cnt
        for row in db.query(
            models.Task.priority,
            func.count(models.Task.id).label('cnt')
        ).filter(
            models.Task.project_id == project_id,
            models.Task.deleted_at.is_(None)
        ).group_by(models.Task.priority).all()
    }
    overdue = base_q.filter(
        models.Task.due_date < datetime.utcnow(),
        models.Task.progress_percent < 100
    ).count()
    done = base_q.filter(models.Task.progress_percent == 100).count()

    # 7-day completion trend
    today = datetime.now(VN_TIMEZONE).date()
    trend = []
    for i in range(6, -1, -1):
        day = today - timedelta(days=i)
        local_start = datetime(day.year, day.month, day.day, 0, 0, 0, tzinfo=VN_TIMEZONE)
        local_end = local_start + timedelta(days=1)
        day_start = local_start.astimezone(timezone.utc).replace(tzinfo=None)
        day_end = local_end.astimezone(timezone.utc).replace(tzinfo=None)
        cnt = db.query(func.count(models.Task.id)).filter(
            models.Task.project_id == project_id,
            models.Task.deleted_at.is_(None),
            models.Task.completed_at >= day_start,
            models.Task.completed_at < day_end,
        ).scalar() or 0
        trend.append({"date": day.strftime("%d/%m"), "count": cnt})

    # Assignee breakdown (top 5)
    assignee_rows = db.query(
        models.Task.assignee_id,
        func.count(models.Task.id).label('cnt')
    ).filter(
        models.Task.project_id == project_id,
        models.Task.deleted_at.is_(None),
        models.Task.assignee_id.is_not(None)
    ).group_by(models.Task.assignee_id).order_by(func.count(models.Task.id).desc()).limit(5).all()

    assignee_stats = []
    for row in assignee_rows:
        u = db.query(models.User).filter(models.User.id == row.assignee_id).first()
        assignee_stats.append({
            "user_id": row.assignee_id,
            "name": u.full_name if u else f"User #{row.assignee_id}",
            "count": row.cnt
        })

    # Column breakdown
    column_rows = db.query(
        models.Task.column_id,
        models.BoardColumn.name.label('column_name'),
        func.count(models.Task.id).label('cnt')
    ).join(
        models.BoardColumn, models.Task.column_id == models.BoardColumn.id
    ).filter(
        models.Task.project_id == project_id,
        models.Task.deleted_at.is_(None)
    ).group_by(models.Task.column_id, models.BoardColumn.name).all()

    by_column = []
    for row in column_rows:
        by_column.append({
            "column_id": row.column_id,
            "column_name": row.column_name,
            "count": row.cnt
        })

    return {
        "total": total,
        "done": done,
        "overdue": overdue,
        "by_priority": by_priority,
        "trend_7days": trend,
        "assignee_stats": assignee_stats,
        "by_column": by_column,
    }
