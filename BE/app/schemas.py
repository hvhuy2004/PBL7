from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List
from datetime import datetime

# --- Token ---
class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    email: Optional[str] = None

class GoogleLoginRequest(BaseModel):
    credential: str = Field(min_length=10)

# --- User ---
class UserBase(BaseModel):
    email: str
    full_name: str

class UserCreate(UserBase):
    email: EmailStr
    password: str = Field(min_length=6)

class UserResponse(UserBase):
    id: int
    role: str
    avatar_url: Optional[str]
    auth_provider: Optional[str] = "password"
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

class TagUpdate(BaseModel):
    name: Optional[str] = None
    color_hex: Optional[str] = None

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
    is_ai_generated: Optional[bool] = False

class TaskCreate(TaskBase):
    project_id: int

class TaskResponse(TaskBase):
    id: int
    project_id: int
    reporter_id: int
    created_at: datetime
    updated_at: datetime
    deleted_at: Optional[datetime] = None
    is_bookmarked: bool = False
    tags: List[TagResponse] = []

    class Config:
        from_attributes = True

class TaskBookmarkStatus(BaseModel):
    task_id: int
    is_bookmarked: bool

class TaskBookmarkResponse(BaseModel):
    id: int
    task_id: int
    project_id: int
    project_name: str
    column_name: Optional[str] = None
    title: str
    description: Optional[str] = None
    priority: Optional[str] = None
    task_type: Optional[str] = None
    assignee_id: Optional[int] = None
    due_date: Optional[datetime] = None
    progress_percent: Optional[int] = 0
    created_at: datetime

class TaskDuplicateCheckRequest(BaseModel):
    title: str
    description: Optional[str] = None
    exclude_task_id: Optional[int] = None

class TaskDuplicateBatchCheckRequest(BaseModel):
    items: List[TaskDuplicateCheckRequest] = Field(min_length=1, max_length=20)

class TaskDuplicateCandidate(BaseModel):
    id: int
    title: str
    description: Optional[str] = None
    similarity: float
    priority: Optional[str] = None
    task_type: Optional[str] = None
    assignee_id: Optional[int] = None
    due_date: Optional[datetime] = None

class TaskDuplicateCheckResponse(BaseModel):
    duplicate_found: bool
    threshold: float
    method: str
    candidates: List[TaskDuplicateCandidate] = []
    note: Optional[str] = None

class TaskDuplicateBatchCheckResponse(BaseModel):
    items: List[TaskDuplicateCheckResponse]

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

class CommentUpdate(CommentBase):
    pass

class CommentResponse(CommentBase):
    id: int
    task_id: int
    user_id: int
    created_at: datetime
    class Config:
        from_attributes = True

# --- Project Message ---
class ProjectMessageCreate(BaseModel):
    content: str = Field(min_length=1, max_length=2000)

class ProjectMessageResponse(BaseModel):
    id: int
    project_id: int
    user_id: int
    user_name: str
    user_avatar_url: Optional[str] = None
    content: str
    created_at: datetime
    updated_at: Optional[datetime] = None

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
    can_manage_tasks: Optional[bool] = None

class ProjectMemberResponse(BaseModel):
    project_id: int
    user_id: int
    project_role: str
    can_manage_tasks: bool = False
    joined_at: datetime
    class Config:
        from_attributes = True


# --- Task Update ---
class TaskUpdate(BaseModel):
    expected_updated_at: Optional[datetime] = None
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

# --- AI Task Assistant ---
class AITaskParseRequest(BaseModel):
    prompt: str
    column_id: Optional[int] = None

class AITaskParseResponse(BaseModel):
    title: str
    description: Optional[str] = None
    priority: str = "Medium"
    task_type: str = "Task"
    assignee_id: Optional[int] = None
    assignee_name: Optional[str] = None
    start_date: Optional[datetime] = None
    due_date: Optional[datetime] = None
    estimated_hours: Optional[float] = None
    confidence: Optional[float] = None
    notes: Optional[str] = None

class AITaskBulkParseResponse(BaseModel):
    tasks: List[AITaskParseResponse]
    notes: Optional[str] = None
    used_model: Optional[str] = None

class AIProjectSummaryResponse(BaseModel):
    health_score: int
    risk_level: str
    summary: str
    risks: List[str] = []
    overloaded_members: List[str] = []
    priority_tasks: List[str] = []
    next_actions: List[str] = []
    metrics: dict = {}
    generated_at: datetime

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
