from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from app import models, schemas


def get_workspace_or_404(db: Session, workspace_id: int) -> models.Workspace:
    ws = db.query(models.Workspace).filter(models.Workspace.id == workspace_id).first()
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found")
    return ws


def create_workspace(db: Session, data: schemas.WorkspaceCreate, owner_id: int) -> models.Workspace:
    ws = models.Workspace(name=data.name, description=data.description, owner_id=owner_id)
    db.add(ws)
    db.commit()
    db.refresh(ws)
    return ws


def get_workspaces_for_user(db: Session, user: models.User) -> list[models.Workspace]:
    if user.role == 'admin':
        return db.query(models.Workspace).all()

    owned = db.query(models.Workspace).filter(models.Workspace.owner_id == user.id).all()
    joined = db.query(models.Workspace).join(models.Project).join(models.ProjectMember).filter(
        models.ProjectMember.user_id == user.id
    ).all()
    return list({ws.id: ws for ws in owned + joined}.values())


def update_workspace(db: Session, workspace: models.Workspace, data: schemas.WorkspaceUpdate) -> models.Workspace:
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(workspace, key, value)
    db.commit()
    db.refresh(workspace)
    return workspace


def delete_workspace(db: Session, workspace: models.Workspace) -> None:
    db.delete(workspace)
    db.commit()
