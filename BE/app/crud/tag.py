from sqlalchemy.orm import Session
from fastapi import HTTPException
from app import models, schemas


def create_tag(db: Session, project_id: int, data: schemas.TagCreate) -> models.Tag:
    project = db.query(models.Project).filter(
        models.Project.id == project_id,
        models.Project.deleted_at.is_(None),
    ).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    tag = models.Tag(project_id=project_id, name=data.name, color_hex=data.color_hex or "#E2E8F0")
    db.add(tag)
    db.commit()
    db.refresh(tag)
    return tag


def get_tags(db: Session, project_id: int) -> list[models.Tag]:
    return db.query(models.Tag).filter(models.Tag.project_id == project_id).all()


def add_tag_to_task(db: Session, task_id: int, tag_id: int) -> None:
    task = db.query(models.Task).filter(
        models.Task.id == task_id,
        models.Task.deleted_at.is_(None),
    ).first()
    tag = db.query(models.Tag).filter(models.Tag.id == tag_id).first()
    if not task or not tag:
        raise HTTPException(status_code=404, detail="Task or tag not found")
    if task.project_id != tag.project_id:
        raise HTTPException(status_code=400, detail="Tag does not belong to this project")

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
