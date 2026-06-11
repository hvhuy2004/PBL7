from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app import schemas, models
from app.database import get_db
from app.core.deps import get_current_user
from app.crud import comment as crud_comment

router = APIRouter(prefix="/comments", tags=["Comments"])

def _verify_task_member(task_id: int, db: Session, current_user: models.User) -> models.Task:
    task = db.query(models.Task).filter(
        models.Task.id == task_id,
        models.Task.deleted_at.is_(None),
    ).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if current_user.role == "admin":
        return task
    project = db.query(models.Project).filter(
        models.Project.id == task.project_id,
        models.Project.deleted_at.is_(None),
    ).first()
    is_member = db.query(models.ProjectMember).filter(
        models.ProjectMember.project_id == task.project_id,
        models.ProjectMember.user_id == current_user.id,
    ).first()
    if not project or (project.owner_id != current_user.id and not is_member):
        raise HTTPException(status_code=403, detail="You must be a member of this project")
    return task


@router.post("/", response_model=schemas.CommentResponse, status_code=status.HTTP_201_CREATED)
def create_comment(
    data: schemas.CommentCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Bình luận vào một Task"""
    _verify_task_member(data.task_id, db, current_user)
    return crud_comment.create_comment(db, data, user_id=current_user.id)


@router.get("/task/{task_id}", response_model=List[schemas.CommentResponse])
def get_task_comments(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Lấy danh sách bình luận của một Task"""
    _verify_task_member(task_id, db, current_user)
    return crud_comment.get_task_comments(db, task_id)


@router.put("/{comment_id}", response_model=schemas.CommentResponse)
def update_comment(
    comment_id: int,
    data: schemas.CommentUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Sua binh luan (chi nguoi tao moi duoc sua)."""
    comment = db.query(models.Comment).filter(
        models.Comment.id == comment_id,
        models.Comment.deleted_at.is_(None),
    ).first()
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    _verify_task_member(comment.task_id, db, current_user)
    return crud_comment.update_comment(db, comment_id, data.content, current_user.id)


@router.delete("/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_comment(
    comment_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Xóa bình luận (chỉ người tạo mới được xóa)"""
    comment = db.query(models.Comment).filter(
        models.Comment.id == comment_id,
        models.Comment.deleted_at.is_(None),
    ).first()
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    _verify_task_member(comment.task_id, db, current_user)
    crud_comment.delete_comment(db, comment_id, user_id=current_user.id)
