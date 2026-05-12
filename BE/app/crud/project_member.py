from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from app import models, schemas


def get_member(db: Session, project_id: int, user_id: int) -> models.ProjectMember | None:
    return db.query(models.ProjectMember).filter(
        models.ProjectMember.project_id == project_id,
        models.ProjectMember.user_id == user_id
    ).first()


def get_members(db: Session, project_id: int) -> list[models.ProjectMember]:
    return db.query(models.ProjectMember).filter(
        models.ProjectMember.project_id == project_id
    ).all()


def add_member(db: Session, project_id: int, data: schemas.ProjectMemberCreate) -> models.ProjectMember:
    if data.project_role not in ['manager', 'developer', 'tester']:
        raise HTTPException(status_code=400, detail="Invalid role. Must be manager, developer, or tester")

    user = db.query(models.User).filter(models.User.id == data.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if get_member(db, project_id, data.user_id):
        raise HTTPException(status_code=400, detail="User is already a member of this project")

    member = models.ProjectMember(
        project_id=project_id,
        user_id=data.user_id,
        project_role=data.project_role
    )
    db.add(member)
    db.commit()
    db.refresh(member)
    return member


def update_member_role(db: Session, project_id: int, user_id: int, role: str) -> models.ProjectMember:
    if role not in ['manager', 'developer', 'tester']:
        raise HTTPException(status_code=400, detail="Invalid role. Must be manager, developer, or tester")

    member = get_member(db, project_id, user_id)
    if not member:
        raise HTTPException(status_code=404, detail="Member not found in this project")

    member.project_role = role
    db.commit()
    db.refresh(member)
    return member


def remove_member(db: Session, project_id: int, user_id: int, current_user_id: int) -> None:
    if current_user_id == user_id:
        raise HTTPException(status_code=400, detail="You cannot remove yourself")

    member = get_member(db, project_id, user_id)
    if not member:
        raise HTTPException(status_code=404, detail="Member not found in this project")

    db.delete(member)
    db.commit()
