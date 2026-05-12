from sqlalchemy.orm import Session
from fastapi import HTTPException
from app import models, schemas


def create_tag(db: Session, project_id: int, data: schemas.TagCreate) -> models.Tag:
    tag = models.Tag(project_id=project_id, name=data.name, color_hex=data.color_hex or "#E2E8F0")
    db.add(tag)
    db.commit()
    db.refresh(tag)
    return tag


def get_tags(db: Session, project_id: int) -> list[models.Tag]:
    return db.query(models.Tag).filter(models.Tag.project_id == project_id).all()


def add_tag_to_task(db: Session, task_id: int, tag_id: int) -> None:
    existing = db.query(models.TaskTag).filter(
        models.TaskTag.task_id == task_id,
        models.TaskTag.tag_id == tag_id
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Tag already assigned to this task")
    db.add(models.TaskTag(task_id=task_id, tag_id=tag_id))
    db.commit()


def remove_tag_from_task(db: Session, task_id: int, tag_id: int) -> None:
    tt = db.query(models.TaskTag).filter(
        models.TaskTag.task_id == task_id,
        models.TaskTag.tag_id == tag_id
    ).first()
    if not tt:
        raise HTTPException(status_code=404, detail="Tag not found on this task")
    db.delete(tt)
    db.commit()
