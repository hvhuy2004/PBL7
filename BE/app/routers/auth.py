import os
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token
from sqlalchemy.orm import Session

from app import models, schemas
from app.core import security
from app.core.security import create_access_token, verify_password
from app.crud import user as crud_user
from app.database import get_db

router = APIRouter(prefix="/auth", tags=["Authentication"])


def _issue_access_token(user: models.User) -> dict:
    access_token = create_access_token(
        data={"sub": user.email},
        expires_delta=timedelta(minutes=security.ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    return {"access_token": access_token, "token_type": "bearer"}


@router.post("/register", response_model=schemas.UserResponse, status_code=status.HTTP_201_CREATED)
def register_user(user: schemas.UserCreate, db: Session = Depends(get_db)):
    if crud_user.get_user_by_email(db, user.email):
        raise HTTPException(status_code=400, detail="Email already registered")
    return crud_user.create_user(db, user)


@router.post("/login", response_model=schemas.Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = crud_user.get_user_by_email(db, form_data.username)
    if not user or not verify_password(form_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return _issue_access_token(user)


@router.post("/google", response_model=schemas.Token)
def google_login(data: schemas.GoogleLoginRequest, db: Session = Depends(get_db)):
    client_id = os.getenv("GOOGLE_CLIENT_ID")
    if not client_id:
        raise HTTPException(status_code=503, detail="Google login is not configured")

    try:
        payload = id_token.verify_oauth2_token(
            data.credential,
            google_requests.Request(),
            client_id,
        )
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid Google credential")

    email = payload.get("email")
    google_sub = payload.get("sub")
    if not email or not google_sub or payload.get("email_verified") is False:
        raise HTTPException(status_code=401, detail="Google email is not verified")

    user = db.query(models.User).filter(models.User.google_sub == google_sub).first()
    if not user:
        user = crud_user.get_user_by_email(db, email)
        if user:
            user.google_sub = google_sub
            if not user.avatar_url:
                user.avatar_url = payload.get("picture")
            if not user.auth_provider or user.auth_provider == "password":
                user.auth_provider = "password+google"
        else:
            user = models.User(
                email=email,
                full_name=payload.get("name") or email.split("@")[0],
                password_hash=None,
                google_sub=google_sub,
                auth_provider="google",
                avatar_url=payload.get("picture"),
            )
            db.add(user)

    db.commit()
    db.refresh(user)
    return _issue_access_token(user)
