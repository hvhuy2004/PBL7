from sqlalchemy.orm import Session
from fastapi import HTTPException
from datetime import datetime
import re
from app import models, schemas
from app.crud.notification import push_notification


def create_comment(db: Session, data: schemas.CommentCreate, user_id: int) -> models.Comment:
    task = db.query(models.Task).filter(
        models.Task.id == data.task_id,
        models.Task.deleted_at.is_(None),
    ).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    comment = models.Comment(task_id=task.id, user_id=user_id, content=data.content)
    db.add(comment)
    db.flush()

    db.add(models.ActivityLog(
        project_id=task.project_id,
        user_id=user_id,
        action_type="ADDED_COMMENT",
        entity_id=task.id,
        new_value=str(comment.id)
    ))

    # Cache commenter once – reused below
    commenter = db.query(models.User).filter(models.User.id == user_id).first()
    commenter_name = commenter.full_name if commenter else f"User #{user_id}"

    # Truncate content for notification display (max 80 chars + ellipsis)
    content_preview = data.content[:80] + ('...' if len(data.content) > 80 else '')

    # Track who was already notified to avoid duplicates
    notified_ids: set = {user_id}  # never notify the commenter themselves

    # -- Notify task assignee (if different from commenter) --
    if task.assignee_id and task.assignee_id not in notified_ids:
        push_notification(
            db,
            recipient_user_id=task.assignee_id,
            title="Binh luan moi tren cong viec cua ban",
            content=f"{commenter_name} da binh luan: '{content_preview}' - Task: {task.title}",
            link_url=f"/projects/{task.project_id}",
        )
        notified_ids.add(task.assignee_id)

    # -- Notify task reporter (if different from commenter & assignee) --
    if task.reporter_id and task.reporter_id not in notified_ids:
        push_notification(
            db,
            recipient_user_id=task.reporter_id,
            title="Binh luan moi tren task ban tao",
            content=f"{commenter_name} da binh luan: '{content_preview}' - Task: {task.title}",
            link_url=f"/projects/{task.project_id}",
        )
        notified_ids.add(task.reporter_id)

    # -- Notify @mentioned users (match by email prefix since no username field) --
    mentions = re.findall(r'@(\w+)', data.content)
    for mention_token in set(mentions):
        # Try matching by email prefix (part before @) e.g. @john matches john@company.com
        mentioned_user = db.query(models.User).filter(
            models.User.email.like(f"{mention_token}@%")
        ).first()
        if mentioned_user and mentioned_user.id not in notified_ids:
            push_notification(
                db,
                recipient_user_id=mentioned_user.id,
                title=f"Ban duoc nhac den trong task '{task.title}'",
                content=f"{commenter_name} da nhac @{mention_token}: '{content_preview}'",
                link_url=f"/projects/{task.project_id}",
            )
            notified_ids.add(mentioned_user.id)

    db.commit()
    db.refresh(comment)
    return comment


def get_task_comments(db: Session, task_id: int) -> list[models.Comment]:
    return db.query(models.Comment).filter(
        models.Comment.task_id == task_id,
        models.Comment.deleted_at.is_(None),
    ).order_by(models.Comment.created_at).all()


def delete_comment(db: Session, comment_id: int, user_id: int) -> None:
    comment = db.query(models.Comment).filter(
        models.Comment.id == comment_id,
        models.Comment.deleted_at.is_(None),
    ).first()
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    if comment.user_id != user_id:
        raise HTTPException(status_code=403, detail="You can only delete your own comments")
    comment.deleted_at = datetime.utcnow()
    db.commit()
