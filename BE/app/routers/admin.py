from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.database import get_db
from app import models, schemas
from app.core import deps

router = APIRouter()

@router.get("/admin/dashboard")
def get_system_dashboard(db: Session = Depends(get_db), current_user: models.User = Depends(deps.get_current_admin)):
    """(Admin Web) Thống kê tổng quan hệ thống"""
    total_users = db.query(func.count(models.User.id)).scalar()
    total_workspaces = db.query(func.count(models.Workspace.id)).scalar()
    total_projects = db.query(func.count(models.Project.id)).scalar()
    total_tasks = db.query(func.count(models.Task.id)).scalar()

    return {
        "total_users": total_users,
        "total_workspaces": total_workspaces,
        "total_projects": total_projects,
        "total_tasks": total_tasks
    }

@router.put("/admin/users/{user_id}/role")
def update_system_user_role(
    user_id: int, 
    role: str,
    db: Session = Depends(get_db), 
    current_user: models.User = Depends(deps.get_current_admin)
):
    """(Admin Web) Thay đổi quyền Admin/User của tài khoản trên toàn hệ thống"""
    if role not in ['admin', 'user']:
        raise HTTPException(status_code=400, detail="Invalid role")
        
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot change your own system role")

    user.role = role
    db.commit()
    db.refresh(user)
    return {"detail": f"User {user.email} updated to {role}"}
