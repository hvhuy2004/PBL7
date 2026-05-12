from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from typing import List

from app import schemas, models
from app.database import get_db
from app.core.deps import get_current_user
from app.crud import comment as crud_comment

router = APIRouter(prefix="/comments", tags=["Comments"])


@router.post("/", response_model=schemas.CommentResponse, status_code=status.HTTP_201_CREATED)
def create_comment(
    data: schemas.CommentCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Bình luận vào một Task"""
    return crud_comment.create_comment(db, data, user_id=current_user.id)


@router.get("/task/{task_id}", response_model=List[schemas.CommentResponse])
def get_task_comments(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Lấy danh sách bình luận của một Task"""
    return crud_comment.get_task_comments(db, task_id)


@router.delete("/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_comment(
    comment_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Xóa bình luận (chỉ người tạo mới được xóa)"""
    crud_comment.delete_comment(db, comment_id, user_id=current_user.id)
