import os
import uuid
import shutil
from sqlalchemy.orm import Session
from fastapi import HTTPException, UploadFile
from app import models

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)


def upload_attachment(db: Session, task_id: int, uploader_id: int, file: UploadFile) -> models.Attachment:
    task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    ext = os.path.splitext(file.filename)[1]
    unique_name = f"{uuid.uuid4()}{ext}"
    file_path = os.path.join(UPLOAD_DIR, unique_name)

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    attachment = models.Attachment(
        task_id=task_id,
        uploader_id=uploader_id,
        file_name=file.filename,
        file_url=f"/uploads/{unique_name}",
        file_size=os.path.getsize(file_path)
    )
    db.add(attachment)
    db.commit()
    db.refresh(attachment)
    return attachment


def get_task_attachments(db: Session, task_id: int) -> list[models.Attachment]:
    return db.query(models.Attachment).filter(models.Attachment.task_id == task_id).all()


def delete_attachment(db: Session, attachment_id: int, user_id: int, allow_manager: bool = False) -> None:
    attachment = db.query(models.Attachment).filter(models.Attachment.id == attachment_id).first()
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")
    if attachment.uploader_id != user_id and not allow_manager:
        raise HTTPException(status_code=403, detail="You can only delete your own attachments")

    file_path = os.path.join(UPLOAD_DIR, os.path.basename(attachment.file_url))
    if os.path.exists(file_path):
        os.remove(file_path)

    db.delete(attachment)
    db.commit()
