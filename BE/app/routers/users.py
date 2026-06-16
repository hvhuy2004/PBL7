import os
import shutil
import uuid
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session
from typing import List
from app import schemas, models
from app.database import get_db
from app.core.deps import get_current_user
from app.core.security import verify_password, get_password_hash

router = APIRouter(prefix="/users", tags=["Users"])

AVATAR_DIR = os.path.join("uploads", "avatars")
os.makedirs(AVATAR_DIR, exist_ok=True)
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
MAX_AVATAR_SIZE = 5 * 1024 * 1024

@router.get("/me", response_model=schemas.UserResponse)
def get_me(current_user: models.User = Depends(get_current_user)):
    """Lấy thông tin profile của chính mình"""
    return current_user

@router.put("/me", response_model=schemas.UserResponse)
def update_me(
    data: schemas.UserUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Cập nhật thông tin profile (tên, avatar)"""
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(current_user, key, value)
    db.commit()
    db.refresh(current_user)
    return current_user

@router.post("/me/avatar", response_model=schemas.UserResponse)
def upload_my_avatar(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Upload avatar image file for current user."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="Please choose an image file")

    content_type = (file.content_type or "").lower()
    if content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=400, detail="Only JPG, PNG, WEBP or GIF images are supported")

    file.file.seek(0, os.SEEK_END)
    file_size = file.file.tell()
    file.file.seek(0)
    if file_size > MAX_AVATAR_SIZE:
        raise HTTPException(status_code=400, detail="Avatar image must be 5MB or smaller")

    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in {".jpg", ".jpeg", ".png", ".webp", ".gif"}:
        ext = ".jpg" if content_type == "image/jpeg" else ".png"

    unique_name = f"user-{current_user.id}-{uuid.uuid4().hex}{ext}"
    file_path = os.path.join(AVATAR_DIR, unique_name)

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    old_avatar_url = (current_user.avatar_url or "").strip()
    current_user.avatar_url = f"/uploads/avatars/{unique_name}"
    db.commit()
    db.refresh(current_user)

    if old_avatar_url.startswith("/uploads/avatars/"):
        old_file_path = os.path.join("uploads", old_avatar_url.replace("/uploads/", "", 1))
        if os.path.exists(old_file_path) and old_file_path != file_path:
            os.remove(old_file_path)

    return current_user

@router.put("/me/password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(
    data: schemas.PasswordChange,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Đổi mật khẩu — yêu cầu xác nhận mật khẩu hiện tại"""
    if not current_user.password_hash:
        raise HTTPException(status_code=400, detail="Tài khoản Google chưa có mật khẩu để đổi")
    if not verify_password(data.current_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Mật khẩu hiện tại không đúng")
    if len(data.new_password) < 6:
        raise HTTPException(status_code=400, detail="Mật khẩu mới phải ít nhất 6 ký tự")
    current_user.password_hash = get_password_hash(data.new_password)
    db.commit()

@router.get("/search", response_model=List[schemas.UserResponse])
def search_users(email: str, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """Tìm kiếm user theo email để add vào project"""
    users = db.query(models.User).filter(models.User.email.contains(email)).all()
    return users

@router.get("/{user_id}", response_model=schemas.UserResponse)
def get_user_by_id(user_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user
