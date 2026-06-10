from sqlalchemy.orm import Session
from fastapi import HTTPException
from app import models, schemas


def get_board_or_404(db: Session, board_id: int, project_id: int) -> models.Board:
    board = db.query(models.Board).filter(
        models.Board.id == board_id,
        models.Board.project_id == project_id
    ).first()
    if not board:
        raise HTTPException(status_code=404, detail="Board not found")
    return board


def get_column_or_404(db: Session, column_id: int, board_id: int) -> models.BoardColumn:
    col = db.query(models.BoardColumn).filter(
        models.BoardColumn.id == column_id,
        models.BoardColumn.board_id == board_id
    ).first()
    if not col:
        raise HTTPException(status_code=404, detail="Column not found")
    return col


def create_board(db: Session, project_id: int, data: schemas.BoardCreate) -> models.Board:
    board = models.Board(
        project_id=project_id,
        name=data.name,
        description=data.description,
        visibility=data.visibility or 'private',
        cover_image=data.cover_image,
        order_index=data.order_index or 0,
        is_archived=bool(data.is_archived),
    )
    db.add(board)
    db.commit()
    db.refresh(board)
    return board


def get_boards(db: Session, project_id: int) -> list[models.Board]:
    return db.query(models.Board).filter(models.Board.project_id == project_id).all()


def update_board(db: Session, board: models.Board, data: schemas.BoardUpdate) -> models.Board:
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(board, key, value)
    db.commit()
    db.refresh(board)
    return board


def delete_board(db: Session, board: models.Board) -> None:
    db.delete(board)
    db.commit()


def create_column(db: Session, board_id: int, data: schemas.BoardColumnCreate) -> models.BoardColumn:
    col = models.BoardColumn(
        board_id=board_id,
        name=data.name,
        order_index=data.order_index,
        color=data.color,
        wip_limit=data.wip_limit if data.wip_limit is not None else 20,
        is_done=bool(data.is_done),
    )
    db.add(col)
    db.commit()
    db.refresh(col)
    return col


def get_columns(db: Session, board_id: int) -> list[models.BoardColumn]:
    return db.query(models.BoardColumn).filter(
        models.BoardColumn.board_id == board_id,
        models.BoardColumn.deleted_at.is_(None)
    ).order_by(models.BoardColumn.order_index).all()


def update_column(db: Session, col: models.BoardColumn, data: schemas.BoardColumnUpdate) -> models.BoardColumn:
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(col, key, value)
    db.commit()
    db.refresh(col)
    return col


def delete_column(db: Session, col: models.BoardColumn) -> None:
    """Soft delete: đánh dấu deleted_at"""
    from datetime import datetime, timezone
    col.deleted_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.commit()

def restore_column(db: Session, col: models.BoardColumn) -> None:
    """Khôi phục cột bị xóa mềm"""
    col.deleted_at = None
    db.commit()
