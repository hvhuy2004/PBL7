from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app import schemas, models
from app.database import get_db
from app.core import deps
from app.crud import board as crud_board

router = APIRouter(prefix="/boards", tags=["Boards"])


@router.post("/project/{project_id}", response_model=schemas.BoardResponse, status_code=status.HTTP_201_CREATED)
def create_board(
    project_id: int,
    data: schemas.BoardCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.require_project_manager)
):
    """(Manager) Tạo Board mới trong Project"""
    if project_id != data.project_id:
        raise HTTPException(status_code=400, detail="Project ID mismatch")
    return crud_board.create_board(db, project_id, data)


@router.get("/project/{project_id}", response_model=List[schemas.BoardResponse])
def get_boards(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.require_project_member)
):
    """(Thành viên) Lấy danh sách Board của Project"""
    return crud_board.get_boards(db, project_id)


@router.put("/project/{project_id}/{board_id}", response_model=schemas.BoardResponse)
def update_board(
    project_id: int,
    board_id: int,
    data: schemas.BoardUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.require_project_manager)
):
    """(Manager) Cập nhật Board"""
    board = crud_board.get_board_or_404(db, board_id, project_id)
    return crud_board.update_board(db, board, data)


@router.delete("/project/{project_id}/{board_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_board(
    project_id: int,
    board_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.require_project_manager)
):
    """(Manager) Xóa Board"""
    board = crud_board.get_board_or_404(db, board_id, project_id)
    crud_board.delete_board(db, board)


# --- Board Columns ---

@router.post("/project/{project_id}/{board_id}/columns", response_model=schemas.BoardColumnResponse, status_code=status.HTTP_201_CREATED)
def create_column(
    project_id: int,
    board_id: int,
    data: schemas.BoardColumnCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.require_project_manager)
):
    """(Manager) Thêm Column vào Board"""
    crud_board.get_board_or_404(db, board_id, project_id)
    return crud_board.create_column(db, board_id, data)


@router.get("/project/{project_id}/{board_id}/columns", response_model=List[schemas.BoardColumnResponse])
def get_columns(
    project_id: int,
    board_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.require_project_member)
):
    """(Thành viên) Lấy danh sách Column của Board"""
    crud_board.get_board_or_404(db, board_id, project_id)
    return crud_board.get_columns(db, board_id)


@router.put("/project/{project_id}/{board_id}/columns/{column_id}", response_model=schemas.BoardColumnResponse)
def update_column(
    project_id: int,
    board_id: int,
    column_id: int,
    data: schemas.BoardColumnUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.require_project_manager)
):
    """(Manager) Cập nhật Column"""
    crud_board.get_board_or_404(db, board_id, project_id)
    col = crud_board.get_column_or_404(db, column_id, board_id)
    return crud_board.update_column(db, col, data)


@router.delete("/project/{project_id}/{board_id}/columns/{column_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_column(
    project_id: int,
    board_id: int,
    column_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.require_project_manager)
):
    """(Manager) Xóa Column"""
    crud_board.get_board_or_404(db, board_id, project_id)
    col = crud_board.get_column_or_404(db, column_id, board_id)
    crud_board.delete_column(db, col)

@router.put("/project/{project_id}/{board_id}/columns/{column_id}/restore", response_model=schemas.BoardColumnResponse)
def restore_column(
    project_id: int,
    board_id: int,
    column_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.require_project_manager)
):
    """(Manager) Khôi phục Column"""
    crud_board.get_board_or_404(db, board_id, project_id)
    col = db.query(models.BoardColumn).filter(
        models.BoardColumn.id == column_id,
        models.BoardColumn.board_id == board_id
    ).first()
    if not col:
        raise HTTPException(status_code=404, detail="Column not found")
    crud_board.restore_column(db, col)
    return col
