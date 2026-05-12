from sqlalchemy.orm import Session
from fastapi import HTTPException
from datetime import datetime, timezone
from app import models, schemas


def get_project_or_404(db: Session, project_id: int) -> models.Project:
    project = db.query(models.Project).filter(
        models.Project.id == project_id,
        models.Project.deleted_at.is_(None),
    ).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


def create_project(db: Session, data: schemas.ProjectCreate, current_user: models.User) -> models.Project:
    project = models.Project(
        workspace_id=None,
        owner_id=current_user.id,
        name=data.name,
        project_key=data.project_key,
        color=data.color,
        description=data.description,
        status=data.status or "Active",
        is_starred=bool(data.is_starred),
        is_archived=bool(data.is_archived),
        start_date=data.start_date,
        end_date=data.end_date,
    )
    db.add(project)
    db.flush()

    if not project.project_key:
        project.project_key = f"PRJ-{project.id}"

    # Người tạo làm manager
    db.add(models.ProjectMember(project_id=project.id, user_id=current_user.id, project_role="manager"))

    # Tạo board và 3 cột mặc định
    board = models.Board(project_id=project.id, name="Main Board", visibility='private', order_index=0)
    db.add(board)
    db.flush()

    db.add_all([
        models.BoardColumn(board_id=board.id, name="To Do", order_index=1),
        models.BoardColumn(board_id=board.id, name="In Progress", order_index=2),
        models.BoardColumn(board_id=board.id, name="Done", order_index=3),
    ])

    db.commit()
    db.refresh(project)
    return project


def get_projects_for_user(db: Session, user: models.User) -> list[models.Project]:
    if user.role == 'admin':
        return db.query(models.Project).filter(models.Project.deleted_at.is_(None)).all()

    owned = db.query(models.Project).filter(
        models.Project.owner_id == user.id,
        models.Project.deleted_at.is_(None),
    ).all()
    member = db.query(models.Project).join(models.ProjectMember).filter(
        models.ProjectMember.user_id == user.id,
        models.Project.deleted_at.is_(None),
    ).all()

    merged = {p.id: p for p in (owned + member)}
    return list(merged.values())


def get_projects_for_user_in_workspace(db: Session, workspace_id: int, user: models.User) -> list[models.Project]:
    # Deprecated: workspace no longer used in runtime flow.
    return get_projects_for_user(db, user)


def update_project(db: Session, project: models.Project, data: schemas.ProjectUpdate) -> models.Project:
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(project, key, value)
    db.commit()
    db.refresh(project)
    return project


def delete_project(db: Session, project: models.Project) -> None:
    """Soft delete: đánh dấu deleted_at, không xóa khỏi DB"""
    project.deleted_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.commit()
