from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
import os
from sqlalchemy import text
from sqlalchemy.orm import Session
from .database import engine, Base, get_db
from .schema_sync import sync_schema
# Import các models để SQLAlchemy tạo bảng
from . import models

if os.getenv("APP_ENV", "development").lower() == "production":
    secret_key = os.getenv("SECRET_KEY", "")
    if len(secret_key) < 32 or secret_key == "your_super_secret_key_here":
        raise RuntimeError("SECRET_KEY must be set to a random value of at least 32 characters in production")

if os.getenv("AUTO_CREATE_SCHEMA", "true").lower() == "true":
    Base.metadata.create_all(bind=engine)
if os.getenv("AUTO_SYNC_SCHEMA", "true").lower() == "true":
    sync_schema(engine)

app = FastAPI(title="Agile AI Management API", description="API cho hệ thống quản lý tiến độ công việc tích hợp AI")

# Mount thư mục upload ảnh / file
os.makedirs("uploads", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

# Thiết lập CORS — phải add TRƯỚC routers và EXCEPTION HANDLER
cors_origins = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global exception handler: đảm bảo 500 vẫn có CORS headers và log traceback rõ
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    try:
        print(f"[UNHANDLED ERROR] {request.method} {request.url}: {type(exc).__name__}: {exc}", flush=True)
    except (OSError, UnicodeEncodeError):
        pass
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
    )

@app.get("/")
def read_root():
    return {"message": "Welcome to Agile AI Management API"}

@app.get("/health", tags=["Health"])
def health_check(db: Session = Depends(get_db)):
    db.execute(text("SELECT 1"))
    return {"status": "ok", "database": "ok"}

# Thêm các file router
from app.routers import auth, tasks, projects, boards, users, comments, logs, tags, attachments, notifications, project_members, project_messages, admin, ai

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(admin.router)
app.include_router(projects.router)
app.include_router(project_members.router)
app.include_router(project_messages.router)
app.include_router(ai.router)
app.include_router(boards.router)
app.include_router(tasks.router)
app.include_router(comments.router)
app.include_router(tags.router)
app.include_router(attachments.router)
app.include_router(notifications.router)
app.include_router(logs.router)
