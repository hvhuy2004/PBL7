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


def _get_project_or_404(db: Session, project_id: int) -> models.Project:
    project = db.query(models.Project).filter(
        models.Project.id == project_id,
        models.Project.deleted_at.is_(None),
    ).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


def _is_project_owner_or_admin(project: models.Project, current_user: models.User) -> bool:
    return current_user.role == "admin" or project.owner_id == current_user.id


def add_member(db: Session, project_id: int, data: schemas.ProjectMemberCreate, current_user: models.User) -> models.ProjectMember:
    if data.project_role not in ['manager', 'developer', 'tester']:
        raise HTTPException(status_code=400, detail="Invalid role. Must be manager, developer, or tester")

    project = _get_project_or_404(db, project_id)
    if data.project_role == "manager" and not _is_project_owner_or_admin(project, current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only project owner or admin can assign manager role")

    user = db.query(models.User).filter(models.User.id == data.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if get_member(db, project_id, data.user_id):
        raise HTTPException(status_code=400, detail="User is already a member of this project")

    member = models.ProjectMember(
        project_id=project_id,
        user_id=data.user_id,
        project_role=data.project_role,
        can_manage_tasks=True if data.project_role == "manager" else bool(data.can_manage_tasks),
    )
    db.add(member)
    db.commit()
    db.refresh(member)
    return member


def update_member_role(
    db: Session,
    project_id: int,
    user_id: int,
    role: str,
    current_user: models.User,
    can_manage_tasks: bool | None = None,
) -> models.ProjectMember:
    if role not in ['manager', 'developer', 'tester']:
        raise HTTPException(status_code=400, detail="Invalid role. Must be manager, developer, or tester")

    project = _get_project_or_404(db, project_id)
    actor_can_manage_managers = _is_project_owner_or_admin(project, current_user)

    member = get_member(db, project_id, user_id)
    if not member:
        raise HTTPException(status_code=404, detail="Member not found in this project")

    if project.owner_id == user_id and role != "manager":
        raise HTTPException(status_code=400, detail="Project owner must remain manager")

    if current_user.id == user_id and member.project_role == "manager" and role != "manager":
        raise HTTPException(status_code=400, detail="You cannot demote your own manager role")

    if role == "manager" and not actor_can_manage_managers:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only project owner or admin can promote managers")

    if member.project_role == "manager" and role != "manager" and not actor_can_manage_managers:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only project owner or admin can demote managers")

    previous_role = member.project_role
    member.project_role = role
    if role == "manager":
        member.can_manage_tasks = True
    elif can_manage_tasks is not None:
        member.can_manage_tasks = can_manage_tasks
    elif previous_role == "manager":
        member.can_manage_tasks = False
    db.commit()
    db.refresh(member)
    return member


def remove_member(db: Session, project_id: int, user_id: int, current_user: models.User) -> None:
    if current_user.id == user_id:
        raise HTTPException(status_code=400, detail="You cannot remove yourself")

    project = _get_project_or_404(db, project_id)
    member = get_member(db, project_id, user_id)
    if not member:
        raise HTTPException(status_code=404, detail="Member not found in this project")

    if project.owner_id == user_id:
        raise HTTPException(status_code=400, detail="Project owner cannot be removed")

    if member.project_role == "manager" and not _is_project_owner_or_admin(project, current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only project owner or admin can remove managers")

    db.delete(member)
    db.commit()
