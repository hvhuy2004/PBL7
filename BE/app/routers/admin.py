import json
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session
from dotenv import dotenv_values

from app import models
from app.core import deps
from app.database import get_db

router = APIRouter()
ENV_PATH = Path(__file__).resolve().parents[2] / ".env"
AI_USAGE_PATH = Path(__file__).resolve().parents[2] / ".ai_usage.json"
VIETNAM_TZ = timezone(timedelta(hours=7))


def _safe_int(value) -> int:
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


def _env(name: str, default: str | None = None) -> str | None:
    value = dotenv_values(ENV_PATH).get(name)
    if value not in (None, ""):
        return str(value)
    return os.getenv(name, default)


def _read_ai_usage_store() -> dict:
    if not AI_USAGE_PATH.exists():
        return {}
    try:
        with AI_USAGE_PATH.open("r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


@router.get("/admin/dashboard")
def get_system_dashboard(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.get_current_admin),
):
    """System-level dashboard for admin users."""
    total_users = db.query(func.count(models.User.id)).scalar()
    total_workspaces = db.query(func.count(models.Workspace.id)).scalar()
    total_projects = db.query(func.count(models.Project.id)).scalar()
    active_projects = db.query(func.count(models.Project.id)).filter(models.Project.deleted_at.is_(None)).scalar()
    archived_projects = db.query(func.count(models.Project.id)).filter(models.Project.deleted_at.is_not(None)).scalar()
    total_tasks = db.query(func.count(models.Task.id)).scalar()
    open_tasks = db.query(func.count(models.Task.id)).filter(
        models.Task.deleted_at.is_(None),
        models.Task.progress_percent < 100,
    ).scalar()
    done_tasks = db.query(func.count(models.Task.id)).filter(
        models.Task.deleted_at.is_(None),
        models.Task.progress_percent >= 100,
    ).scalar()
    ai_tasks = db.query(func.count(models.Task.id)).filter(
        models.Task.deleted_at.is_(None),
        models.Task.is_ai_generated.is_(True),
    ).scalar()
    total_messages = db.query(func.count(models.ProjectMessage.id)).filter(
        models.ProjectMessage.deleted_at.is_(None),
    ).scalar()

    role_rows = db.query(models.User.role, func.count(models.User.id)).group_by(models.User.role).all()
    project_status_rows = db.query(models.Project.status, func.count(models.Project.id)).filter(
        models.Project.deleted_at.is_(None),
    ).group_by(models.Project.status).all()

    return {
        "total_users": total_users,
        "total_workspaces": total_workspaces,
        "total_projects": total_projects,
        "active_projects": active_projects,
        "archived_projects": archived_projects,
        "total_tasks": total_tasks,
        "open_tasks": open_tasks,
        "done_tasks": done_tasks,
        "ai_tasks": ai_tasks,
        "total_messages": total_messages,
        "users_by_role": {role: count for role, count in role_rows},
        "projects_by_status": {status: count for status, count in project_status_rows},
    }


@router.get("/admin/users")
def list_system_users(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.get_current_admin),
):
    """List system users with basic operational counters."""
    users = db.query(models.User).order_by(models.User.created_at.desc(), models.User.id.desc()).all()
    result = []
    for user in users:
        owned_projects = db.query(func.count(models.Project.id)).filter(models.Project.owner_id == user.id).scalar()
        member_projects = db.query(func.count(models.ProjectMember.project_id)).filter(
            models.ProjectMember.user_id == user.id,
        ).scalar()
        assigned_tasks = db.query(func.count(models.Task.id)).filter(
            models.Task.assignee_id == user.id,
            models.Task.deleted_at.is_(None),
        ).scalar()
        result.append({
            "id": user.id,
            "full_name": user.full_name,
            "email": user.email,
            "role": user.role,
            "auth_provider": user.auth_provider,
            "avatar_url": user.avatar_url,
            "created_at": user.created_at,
            "owned_projects": owned_projects,
            "member_projects": member_projects,
            "assigned_tasks": assigned_tasks,
        })
    return result


@router.get("/admin/projects")
def list_system_projects(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.get_current_admin),
):
    """List system projects with owner and workload counters."""
    projects = db.query(models.Project).order_by(models.Project.created_at.desc(), models.Project.id.desc()).all()
    result = []
    for project in projects:
        owner = db.query(models.User).filter(models.User.id == project.owner_id).first() if project.owner_id else None
        member_count = db.query(func.count(models.ProjectMember.user_id)).filter(
            models.ProjectMember.project_id == project.id,
        ).scalar()
        task_count = db.query(func.count(models.Task.id)).filter(
            models.Task.project_id == project.id,
            models.Task.deleted_at.is_(None),
        ).scalar()
        done_count = db.query(func.count(models.Task.id)).filter(
            models.Task.project_id == project.id,
            models.Task.deleted_at.is_(None),
            models.Task.progress_percent >= 100,
        ).scalar()
        result.append({
            "id": project.id,
            "name": project.name,
            "project_key": project.project_key,
            "status": project.status,
            "owner_id": project.owner_id,
            "owner_name": owner.full_name if owner else None,
            "owner_email": owner.email if owner else None,
            "member_count": member_count,
            "task_count": task_count,
            "done_count": done_count,
            "created_at": project.created_at,
            "deleted_at": project.deleted_at,
        })
    return result


@router.get("/admin/ai-usage")
def get_ai_usage(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.get_current_admin),
):
    """Show locally tracked AI request usage for admin monitoring."""
    store = _read_ai_usage_store()
    today_key = datetime.now(VIETNAM_TZ).date().isoformat()
    daily_limit = max(1, _safe_int(_env("GITHUB_MODELS_DAILY_LIMIT", "50")))
    today = store.get(today_key, {})
    github = today.get("github_models", {})
    today_requests = _safe_int(github.get("requests"))

    providers = []
    for provider_key, provider_data in today.items():
        models = []
        for model_name, model_data in (provider_data.get("models") or {}).items():
            models.append({
                "model": model_name,
                "requests": _safe_int(model_data.get("requests")),
                "prompt_tokens": _safe_int(model_data.get("prompt_tokens")),
                "completion_tokens": _safe_int(model_data.get("completion_tokens")),
                "total_tokens": _safe_int(model_data.get("total_tokens")),
            })
        models.sort(key=lambda item: item["requests"], reverse=True)
        providers.append({
            "provider": provider_key,
            "requests": _safe_int(provider_data.get("requests")),
            "prompt_tokens": _safe_int(provider_data.get("prompt_tokens")),
            "completion_tokens": _safe_int(provider_data.get("completion_tokens")),
            "total_tokens": _safe_int(provider_data.get("total_tokens")),
            "models": models,
        })
    providers.sort(key=lambda item: item["requests"], reverse=True)

    history = []
    for date_key in sorted(store.keys(), reverse=True)[:14]:
        day = store.get(date_key, {})
        github_day = day.get("github_models", {})
        total_requests = sum(_safe_int(provider.get("requests")) for provider in day.values() if isinstance(provider, dict))
        total_tokens = sum(_safe_int(provider.get("total_tokens")) for provider in day.values() if isinstance(provider, dict))
        history.append({
            "date": date_key,
            "requests": total_requests,
            "total_tokens": total_tokens,
            "github_requests": _safe_int(github_day.get("requests")),
        })

    return {
        "date": today_key,
        "daily_limit": daily_limit,
        "requests_today": today_requests,
        "remaining_today": max(0, daily_limit - today_requests),
        "total_tokens_today": _safe_int(github.get("total_tokens")),
        "prompt_tokens_today": _safe_int(github.get("prompt_tokens")),
        "completion_tokens_today": _safe_int(github.get("completion_tokens")),
        "providers": providers,
        "history": history,
        "tracked_file_exists": AI_USAGE_PATH.exists(),
    }


@router.put("/admin/users/{user_id}/role")
def update_system_user_role(
    user_id: int,
    role: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.get_current_admin),
):
    """Change a user's system-level role."""
    if role not in ["admin", "user"]:
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
