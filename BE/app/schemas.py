from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime

# --- Token ---
class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    email: Optional[str] = None

# --- User ---
class UserBase(BaseModel):
    email: EmailStr
    full_name: str

class UserCreate(UserBase):
    password: str

class UserResponse(UserBase):
    id: int
    role: str
    avatar_url: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True

# --- Workspace ---
class WorkspaceBase(BaseModel):
    name: str
    description: Optional[str] = None

class WorkspaceCreate(WorkspaceBase):
    pass

class WorkspaceResponse(WorkspaceBase):
    id: int
    owner_id: int
    created_at: datetime

    class Config:
        from_attributes = True

# --- Project ---
class ProjectBase(BaseModel):
    name: str
    project_key: Optional[str] = None
    color: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = 'Active'
    is_starred: Optional[bool] = False
    is_archived: Optional[bool] = False
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None

class ProjectCreate(ProjectBase):
    pass

class ProjectResponse(ProjectBase):
    id: int
    owner_id: Optional[int] = None
    created_at: datetime

    class Config:
        from_attributes = True

# --- Board Column ---
class BoardColumnBase(BaseModel):
    name: str
    order_index: int
    color: Optional[str] = None
    wip_limit: Optional[int] = None
    is_done: Optional[bool] = False

class BoardColumnCreate(BoardColumnBase):
    pass

class BoardColumnResponse(BoardColumnBase):
    id: int
    board_id: int
    deleted_at: Optional[datetime] = None

    class Config:
        from_attributes = True

# --- Tag ---
class TagBase(BaseModel):
    name: str
    color_hex: Optional[str] = '#E2E8F0'

class TagCreate(TagBase):
    pass

class TagResponse(TagBase):
    id: int
    project_id: int
    class Config:
        from_attributes = True

# --- Task ---
class TaskBase(BaseModel):
    title: str
    description: Optional[str] = None
    priority: Optional[str] = 'Medium'
    task_type: Optional[str] = 'Task'
    start_date: Optional[datetime] = None
    due_date: Optional[datetime] = None
    estimated_hours: Optional[float] = None
    progress_percent: Optional[int] = 0
    checklist_total: Optional[int] = 0
    checklist_completed: Optional[int] = 0
    completed_at: Optional[datetime] = None
    order_index: int
    column_id: int
    assignee_id: Optional[int] = None

class TaskCreate(TaskBase):
    project_id: int

class TaskResponse(TaskBase):
    id: int
    project_id: int
    reporter_id: int
    is_ai_generated: bool
    created_at: datetime
    updated_at: datetime
    deleted_at: Optional[datetime] = None
    tags: List[TagResponse] = []

    class Config:
        from_attributes = True

# --- Task Checklist Item ---
class TaskChecklistItemBase(BaseModel):
    title: str
    is_done: Optional[bool] = False
    order_index: Optional[int] = 0

class TaskChecklistItemCreate(TaskChecklistItemBase):
    pass

class TaskChecklistItemUpdate(BaseModel):
    title: Optional[str] = None
    is_done: Optional[bool] = None
    order_index: Optional[int] = None

class TaskChecklistItemResponse(TaskChecklistItemBase):
    id: int
    task_id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

# --- Board ---
class BoardBase(BaseModel):
    name: str
    description: Optional[str] = None
    visibility: Optional[str] = 'private'
    cover_image: Optional[str] = None
    order_index: Optional[int] = 0
    is_archived: Optional[bool] = False

class BoardCreate(BoardBase):
    project_id: int

class BoardResponse(BoardBase):
    id: int
    project_id: int
    created_at: datetime

    class Config:
        from_attributes = True


# --- Comment ---
class CommentBase(BaseModel):
    content: str

class CommentCreate(CommentBase):
    task_id: int

class CommentResponse(CommentBase):
    id: int
    task_id: int
    user_id: int
    created_at: datetime
    class Config:
        from_attributes = True

# --- Activity Log ---
class ActivityLogResponse(BaseModel):
    id: int
    project_id: int
    user_id: int
    action_type: str
    entity_id: int
    old_value: Optional[str]
    new_value: Optional[str]
    created_at: datetime
    class Config:
        from_attributes = True

# --- Project Member ---
class ProjectMemberCreate(BaseModel):
    user_id: int
    project_role: str = 'developer'

class ProjectMemberResponse(BaseModel):
    project_id: int
    user_id: int
    project_role: str
    joined_at: datetime
    class Config:
        from_attributes = True


# --- Task Update ---
class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    priority: Optional[str] = None
    task_type: Optional[str] = None
    start_date: Optional[datetime] = None
    due_date: Optional[datetime] = None
    estimated_hours: Optional[float] = None
    progress_percent: Optional[int] = None
    checklist_total: Optional[int] = None
    checklist_completed: Optional[int] = None
    completed_at: Optional[datetime] = None
    assignee_id: Optional[int] = None
    order_index: Optional[int] = None

# --- Notification ---
class NotificationResponse(BaseModel):
    id: int
    user_id: int
    title: str
    content: str
    link_url: Optional[str] = None
    is_read: bool
    created_at: datetime
    class Config:
        from_attributes = True

# --- Attachment ---
class AttachmentResponse(BaseModel):
    id: int
    task_id: int
    uploader_id: int
    file_name: str
    file_url: str
    file_size: Optional[int] = None
    created_at: datetime
    class Config:
        from_attributes = True

# --- Update Schemas ---
class WorkspaceUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None

class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    project_key: Optional[str] = None
    color: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    is_starred: Optional[bool] = None
    is_archived: Optional[bool] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None

class BoardUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    visibility: Optional[str] = None
    cover_image: Optional[str] = None
    order_index: Optional[int] = None
    is_archived: Optional[bool] = None

class BoardColumnUpdate(BaseModel):
    name: Optional[str] = None
    order_index: Optional[int] = None
    color: Optional[str] = None
    wip_limit: Optional[int] = None
    is_done: Optional[bool] = None

# --- User Update ---
class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    avatar_url: Optional[str] = None

class PasswordChange(BaseModel):
    current_password: str
    new_password: str
