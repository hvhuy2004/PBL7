from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional

from app import schemas, models
from app.database import get_db
from app.core import deps
from app.crud import task as crud_task

router = APIRouter(tags=["Tasks & Kanban"])


@router.post("/projects/{project_id}/tasks", response_model=schemas.TaskResponse)
def create_task(
    project_id: int,
    data: schemas.TaskCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.require_project_member)
):
    """(Thành viên) Tạo Task mới trong project"""
    if data.project_id != project_id:
        raise HTTPException(status_code=400, detail="Path project_id and body project_id mismatch")
    return crud_task.create_task(db, data, reporter_id=current_user.id)


@router.get("/projects/{project_id}/tasks", response_model=List[schemas.TaskResponse])
def get_tasks(
    project_id: int,
    priority: Optional[str] = Query(None, description="Lọc theo priority"),
    assignee_id: Optional[int] = Query(None, description="Lọc theo người được giao"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.require_project_member)
):
    """(Thành viên) Lấy danh sách Task, hỗ trợ filter"""
    return crud_task.get_tasks(db, project_id, priority=priority, assignee_id=assignee_id)


@router.put("/projects/{project_id}/tasks/{task_id}/move", response_model=schemas.TaskResponse)
def move_task(
    project_id: int,
    task_id: int,
    new_column_id: int = Query(..., description="ID cột đích"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.require_project_member)
):
    """(Thành viên) Kéo thả Task sang cột khác trên Kanban"""
    task = crud_task.get_task_or_404(db, task_id, project_id)
    return crud_task.move_task(db, task, new_column_id, user_id=current_user.id)


@router.put("/projects/{project_id}/tasks/{task_id}", response_model=schemas.TaskResponse)
def update_task(
    project_id: int,
    task_id: int,
    data: schemas.TaskUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.require_project_member)
):
    """(Thành viên) Cập nhật chi tiết Task"""
    task = crud_task.get_task_or_404(db, task_id, project_id)
    return crud_task.update_task(db, task, data, user_id=current_user.id)


@router.get("/projects/{project_id}/tasks/{task_id}/checklist", response_model=List[schemas.TaskChecklistItemResponse])
def get_task_checklist(
    project_id: int,
    task_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.require_project_member)
):
    """(Thành viên) Lấy danh sách checklist của task"""
    task = crud_task.get_task_or_404(db, task_id, project_id)
    return crud_task.list_checklist_items(db, task)


@router.post("/projects/{project_id}/tasks/{task_id}/checklist", response_model=schemas.TaskChecklistItemResponse)
def create_task_checklist_item(
    project_id: int,
    task_id: int,
    data: schemas.TaskChecklistItemCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.require_project_member)
):
    """(Thành viên) Tạo checklist item mới"""
    task = crud_task.get_task_or_404(db, task_id, project_id)
    return crud_task.create_checklist_item(db, task, data, user_id=current_user.id)


@router.put("/projects/{project_id}/tasks/{task_id}/checklist/{item_id}", response_model=schemas.TaskChecklistItemResponse)
def update_task_checklist_item(
    project_id: int,
    task_id: int,
    item_id: int,
    data: schemas.TaskChecklistItemUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.require_project_member)
):
    """(Thành viên) Cập nhật checklist item"""
    task = crud_task.get_task_or_404(db, task_id, project_id)
    item = crud_task.get_checklist_item_or_404(db, task, item_id)
    return crud_task.update_checklist_item(db, task, item, data, user_id=current_user.id)


@router.delete("/projects/{project_id}/tasks/{task_id}/checklist/{item_id}", status_code=204)
def delete_task_checklist_item(
    project_id: int,
    task_id: int,
    item_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.require_project_member)
):
    """(Thành viên) Xóa checklist item"""
    task = crud_task.get_task_or_404(db, task_id, project_id)
    item = crud_task.get_checklist_item_or_404(db, task, item_id)
    crud_task.delete_checklist_item(db, task, item, user_id=current_user.id)


@router.delete("/projects/{project_id}/tasks/{task_id}", status_code=204)
def delete_task(
    project_id: int,
    task_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.require_project_manager)
):
    """(Manager) Xóa Task"""
    task = crud_task.get_task_or_404(db, task_id, project_id)
    crud_task.delete_task(db, task, user_id=current_user.id)

@router.put("/projects/{project_id}/tasks/{task_id}/restore", response_model=schemas.TaskResponse)
def restore_task(
    project_id: int,
    task_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.require_project_manager)
):
    """(Manager) Khôi phục Task"""
    return crud_task.restore_task(db, task_id, project_id, user_id=current_user.id)
