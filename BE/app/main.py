from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
import traceback
import os
from .database import engine, Base
from .schema_sync import sync_schema
# Import các models để SQLAlchemy tạo bảng
from . import models

# Tạo tất cả các bảng trong DB (nếu chưa có)
Base.metadata.create_all(bind=engine)
# Auto-sync schema for changed fields (dev/demo convenience)
sync_schema(engine)

app = FastAPI(title="Agile AI Management API", description="API cho hệ thống quản lý tiến độ công việc tích hợp AI")

# Mount thư mục upload ảnh / file
os.makedirs("uploads", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

# Thiết lập CORS — phải add TRƯỚC routers và EXCEPTION HANDLER
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global exception handler: đảm bảo 500 vẫn có CORS headers và log traceback rõ
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    tb = traceback.format_exc()
    print(f"[UNHANDLED ERROR] {request.method} {request.url}\n{tb}")
    return JSONResponse(
        status_code=500,
        content={"detail": f"Internal server error: {type(exc).__name__}: {str(exc)}"},
        headers={"Access-Control-Allow-Origin": "*"},
    )

@app.get("/")
def read_root():
    return {"message": "Welcome to Agile AI Management API"}

# Thêm các file router
from app.routers import auth, tasks, projects, boards, users, comments, logs, tags, attachments, notifications, project_members, admin

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(admin.router)
app.include_router(projects.router)
app.include_router(project_members.router)
app.include_router(boards.router)
app.include_router(tasks.router)
app.include_router(comments.router)
app.include_router(tags.router)
app.include_router(attachments.router)
app.include_router(notifications.router)
app.include_router(logs.router)
