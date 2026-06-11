from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app import schemas, models
from app.database import get_db
from app.core.deps import get_current_user, require_project_member
from app.crud import tag as crud_tag
from app.crud import task as crud_task

router = APIRouter(prefix="/tags", tags=["Tags"])


@router.post("/project/{project_id}", response_model=schemas.TagResponse, status_code=status.HTTP_201_CREATED)
def create_tag(
    project_id: int,
    data: schemas.TagCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_project_member)
):
    """Tạo Tag mới trong Project"""
    return crud_tag.create_tag(db, project_id, data)


@router.get("/project/{project_id}", response_model=List[schemas.TagResponse])
def get_tags(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_project_member)
):
    """Lấy danh sách Tag của Project"""
    return crud_tag.get_tags(db, project_id)


@router.put("/project/{project_id}/{tag_id}", response_model=schemas.TagResponse)
def update_tag(
    project_id: int,
    tag_id: int,
    data: schemas.TagUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_project_member),
):
    return crud_tag.update_tag(db, project_id, tag_id, data)


@router.delete("/project/{project_id}/{tag_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_tag(
    project_id: int,
    tag_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_project_member),
):
    crud_tag.delete_tag(db, project_id, tag_id)


def _verify_task_member(task_id: int, db: Session, current_user: models.User) -> models.Task:
    """Kiểm tra user là thành viên của project chứa task"""
    task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if current_user.role == 'admin':
        return task
    project = db.query(models.Project).filter(models.Project.id == task.project_id).first()
    if project and project.owner_id == current_user.id:
        return task
    member = db.query(models.ProjectMember).filter(
        models.ProjectMember.project_id == task.project_id,
        models.ProjectMember.user_id == current_user.id
    ).first()
    if not member:
        raise HTTPException(status_code=403, detail="You must be a member of this project")
    return task


@router.post("/task/{task_id}/add/{tag_id}", status_code=status.HTTP_201_CREATED)
def add_tag_to_task(
    task_id: int,
    tag_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Gắn Tag vào Task (chỉ thành viên project)"""
    task = _verify_task_member(task_id, db, current_user)
    crud_task._ensure_can_update_task(db, task, current_user.id)
    crud_tag.add_tag_to_task(db, task_id, tag_id)
    return {"message": "Tag assigned to task"}


@router.delete("/task/{task_id}/remove/{tag_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_tag_from_task(
    task_id: int,
    tag_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Gỡ Tag khỏi Task (chỉ thành viên project)"""
    task = _verify_task_member(task_id, db, current_user)
    crud_task._ensure_can_update_task(db, task, current_user.id)
    crud_tag.remove_tag_from_task(db, task_id, tag_id)
