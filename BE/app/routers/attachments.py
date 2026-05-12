from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy.orm import Session
from typing import List

from app import schemas, models
from app.database import get_db
from app.core.deps import get_current_user
from app.crud import attachment as crud_attachment

router = APIRouter(prefix="/attachments", tags=["Attachments"])


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


@router.post("/task/{task_id}", response_model=schemas.AttachmentResponse, status_code=status.HTTP_201_CREATED)
def upload_file(
    task_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """(Thành viên) Upload file đính kèm vào Task"""
    _verify_task_member(task_id, db, current_user)
    return crud_attachment.upload_attachment(db, task_id, uploader_id=current_user.id, file=file)


@router.get("/task/{task_id}", response_model=List[schemas.AttachmentResponse])
def get_task_attachments(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """(Thành viên) Lấy danh sách file đính kèm của Task"""
    _verify_task_member(task_id, db, current_user)
    return crud_attachment.get_task_attachments(db, task_id)


@router.delete("/{attachment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_attachment(
    attachment_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Xóa file đính kèm (chỉ người upload hoặc manager)"""
    crud_attachment.delete_attachment(db, attachment_id, user_id=current_user.id)
