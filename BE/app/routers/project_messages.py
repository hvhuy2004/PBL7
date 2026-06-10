from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect, status
from fastapi.encoders import jsonable_encoder
from jose import JWTError, jwt
from sqlalchemy import desc
from sqlalchemy.orm import Session

from app import models, schemas
from app.core import security
from app.core.deps import get_current_user, require_project_member
from app.crud.notification import push_notification
from app.database import get_db

router = APIRouter(prefix="/projects/{project_id}/messages", tags=["Project Messages"])


class ProjectMessageConnectionManager:
    def __init__(self):
        self.active_connections: dict[int, list[WebSocket]] = {}

    async def connect(self, project_id: int, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.setdefault(project_id, []).append(websocket)
        print(f"[WS MESSAGES] connected project_id={project_id} clients={len(self.active_connections[project_id])}")

    def disconnect(self, project_id: int, websocket: WebSocket):
        connections = self.active_connections.get(project_id)
        if not connections:
            return
        if websocket in connections:
            connections.remove(websocket)
        if not connections:
            self.active_connections.pop(project_id, None)
        print(f"[WS MESSAGES] disconnected project_id={project_id} clients={len(self.active_connections.get(project_id, []))}")

    async def broadcast(self, project_id: int, payload: dict):
        connections = list(self.active_connections.get(project_id, []))
        print(f"[WS MESSAGES] broadcast project_id={project_id} event={payload.get('event')} clients={len(connections)}")
        for websocket in connections:
            try:
                await websocket.send_json(jsonable_encoder(payload))
            except Exception as exc:
                print(f"[WS MESSAGES] send failed project_id={project_id}: {exc}")
                self.disconnect(project_id, websocket)


manager = ProjectMessageConnectionManager()


def _serialize_message(message: models.ProjectMessage) -> dict:
    user = message.user
    return {
        "id": message.id,
        "project_id": message.project_id,
        "user_id": message.user_id,
        "user_name": user.full_name if user else f"User #{message.user_id}",
        "user_avatar_url": user.avatar_url if user else None,
        "content": message.content,
        "created_at": message.created_at,
        "updated_at": message.updated_at,
    }


def _get_user_from_token(db: Session, token: str | None) -> models.User | None:
    if not token:
        return None
    try:
        payload = jwt.decode(token, security.SECRET_KEY, algorithms=[security.ALGORITHM])
        email = payload.get("sub")
        if not email:
            return None
    except JWTError:
        return None
    return db.query(models.User).filter(models.User.email == email).first()


def _can_moderate_project(project: models.Project, user: models.User) -> bool:
    if user.role == "admin" or project.owner_id == user.id:
        return True
    return any(m.user_id == user.id and m.project_role == "manager" for m in project.members)


def _is_project_member(project: models.Project, user: models.User) -> bool:
    return (
        user.role == "admin"
        or project.owner_id == user.id
        or any(m.user_id == user.id for m in project.members)
    )


async def _broadcast_message_event(project_id: int, event: str, message: models.ProjectMessage):
    await manager.broadcast(project_id, {
        "event": event,
        "message": _serialize_message(message),
    })


@router.get("/", response_model=list[schemas.ProjectMessageResponse])
def list_project_messages(
    project_id: int,
    limit: int = Query(80, ge=1, le=200),
    before_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_project_member),
):
    q = db.query(models.ProjectMessage).filter(
        models.ProjectMessage.project_id == project_id,
        models.ProjectMessage.deleted_at.is_(None),
    )
    if before_id:
        q = q.filter(models.ProjectMessage.id < before_id)

    messages = q.order_by(desc(models.ProjectMessage.id)).limit(limit).all()
    return [_serialize_message(message) for message in reversed(messages)]


@router.websocket("/ws")
async def project_messages_websocket(
    websocket: WebSocket,
    project_id: int,
    token: str | None = Query(None),
):
    db = next(get_db())
    try:
        user = _get_user_from_token(db, token)
        project = db.query(models.Project).filter(
            models.Project.id == project_id,
            models.Project.deleted_at.is_(None),
        ).first()
        if not user or not project or not _is_project_member(project, user):
            await websocket.close(code=1008)
            return

        await manager.connect(project_id, websocket)
        await websocket.send_json({"event": "connected", "project_id": project_id})
        try:
            while True:
                await websocket.receive_text()
        except WebSocketDisconnect:
            pass
        finally:
            manager.disconnect(project_id, websocket)
    finally:
        db.close()


@router.post("/", response_model=schemas.ProjectMessageResponse, status_code=status.HTTP_201_CREATED)
async def create_project_message(
    project_id: int,
    data: schemas.ProjectMessageCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_project_member),
):
    content = data.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="Message content is required")

    project = db.query(models.Project).filter(
        models.Project.id == project_id,
        models.Project.deleted_at.is_(None),
    ).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    message = models.ProjectMessage(
        project_id=project_id,
        user_id=current_user.id,
        content=content,
    )
    db.add(message)
    db.flush()

    db.add(models.ActivityLog(
        project_id=project_id,
        user_id=current_user.id,
        action_type="POSTED_PROJECT_MESSAGE",
        entity_id=message.id,
        new_value=content[:255],
    ))

    recipient_ids = {m.user_id for m in project.members}
    if project.owner_id:
        recipient_ids.add(project.owner_id)
    recipient_ids.discard(current_user.id)
    for user_id in recipient_ids:
        push_notification(
            db,
            user_id,
            "Tin nhắn dự án mới",
            f"{current_user.full_name}: {content}"[:255],
            f"/messages?projectId={project_id}",
        )

    db.commit()
    db.refresh(message)
    await _broadcast_message_event(project_id, "created", message)
    return _serialize_message(message)


@router.delete("/{message_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project_message(
    project_id: int,
    message_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    project = db.query(models.Project).filter(
        models.Project.id == project_id,
        models.Project.deleted_at.is_(None),
    ).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    is_member = (
        current_user.role == "admin"
        or project.owner_id == current_user.id
        or any(m.user_id == current_user.id for m in project.members)
    )
    if not is_member:
        raise HTTPException(status_code=403, detail="You must be a member of this project")

    message = db.query(models.ProjectMessage).filter(
        models.ProjectMessage.id == message_id,
        models.ProjectMessage.project_id == project_id,
        models.ProjectMessage.deleted_at.is_(None),
    ).first()
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")

    if message.user_id != current_user.id and not _can_moderate_project(project, current_user):
        raise HTTPException(status_code=403, detail="You can only delete your own messages")

    message.deleted_at = datetime.utcnow()
    db.add(models.ActivityLog(
        project_id=project_id,
        user_id=current_user.id,
        action_type="DELETED_PROJECT_MESSAGE",
        entity_id=message.id,
        old_value=message.content[:255],
    ))
    db.commit()
    await _broadcast_message_event(project_id, "deleted", message)
