from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from typing import List

from app import schemas, models
from app.database import get_db
from app.core import deps
from app.crud import project_member as crud_member

router = APIRouter(prefix="/projects", tags=["Project Members"])


@router.post("/{project_id}/members", response_model=schemas.ProjectMemberResponse, status_code=status.HTTP_201_CREATED)
def add_member(
    project_id: int,
    data: schemas.ProjectMemberCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.require_project_manager)
):
    """(Manager) Thêm thành viên vào Project"""
    return crud_member.add_member(db, project_id, data)


@router.get("/{project_id}/members", response_model=List[schemas.ProjectMemberResponse])
def get_members(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.require_project_member)
):
    """(Thành viên) Xem danh sách thành viên Project"""
    return crud_member.get_members(db, project_id)


@router.put("/{project_id}/members/{user_id}", response_model=schemas.ProjectMemberResponse)
def update_member_role(
    project_id: int,
    user_id: int,
    data: schemas.ProjectMemberCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.require_project_manager)
):
    """(Manager) Thay đổi role của thành viên"""
    return crud_member.update_member_role(db, project_id, user_id, role=data.project_role)


@router.delete("/{project_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_member(
    project_id: int,
    user_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.require_project_manager)
):
    """(Manager) Xóa thành viên khỏi Project"""
    crud_member.remove_member(db, project_id, user_id, current_user_id=current_user.id)
