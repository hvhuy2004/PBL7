from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app import schemas, models
from app.database import get_db
from app.core.deps import get_current_user
from app.crud import workspace as crud_ws

router = APIRouter(prefix="/workspaces", tags=["Workspaces"])


@router.post("/", response_model=schemas.WorkspaceResponse, status_code=status.HTTP_201_CREATED)
def create_workspace(
    data: schemas.WorkspaceCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Tạo Workspace mới"""
    return crud_ws.create_workspace(db, data, owner_id=current_user.id)


@router.get("/", response_model=List[schemas.WorkspaceResponse])
def get_workspaces(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Lấy danh sách Workspace của user"""
    return crud_ws.get_workspaces_for_user(db, current_user)


@router.get("/{workspace_id}", response_model=schemas.WorkspaceResponse)
def get_workspace(
    workspace_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Lấy thông tin 1 Workspace"""
    return crud_ws.get_workspace_or_404(db, workspace_id)


@router.put("/{workspace_id}", response_model=schemas.WorkspaceResponse)
def update_workspace(
    workspace_id: int,
    data: schemas.WorkspaceUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """(Owner/Admin) Cập nhật Workspace"""
    ws = crud_ws.get_workspace_or_404(db, workspace_id)
    if ws.owner_id != current_user.id and current_user.role != 'admin':
        raise HTTPException(status_code=403, detail="Only the owner or admin can update this workspace")
    return crud_ws.update_workspace(db, ws, data)


@router.delete("/{workspace_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_workspace(
    workspace_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """(Owner/Admin) Xóa Workspace"""
    ws = crud_ws.get_workspace_or_404(db, workspace_id)
    if ws.owner_id != current_user.id and current_user.role != 'admin':
        raise HTTPException(status_code=403, detail="Only the owner or admin can delete this workspace")
    crud_ws.delete_workspace(db, ws)
