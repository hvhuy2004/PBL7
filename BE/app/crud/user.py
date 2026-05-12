from sqlalchemy.orm import Session
from app import models, schemas
from app.core.security import get_password_hash


def get_user_by_email(db: Session, email: str) -> models.User | None:
    return db.query(models.User).filter(models.User.email == email).first()


def create_user(db: Session, user: schemas.UserCreate) -> models.User:
    new_user = models.User(
        email=user.email,
        full_name=user.full_name,
        password_hash=get_password_hash(user.password)
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user


def search_users_by_email(db: Session, email: str) -> list[models.User]:
    return db.query(models.User).filter(models.User.email.contains(email)).all()
