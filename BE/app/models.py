from sqlalchemy import Column, Integer, String, Text, Boolean, ForeignKey, Enum, DateTime, Numeric, UniqueConstraint
from sqlalchemy.orm import relationship
from datetime import datetime
from .database import Base
import enum

# Bảng Users
class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    full_name = Column(String(100), nullable=False)
    email = Column(String(100), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=True)
    google_sub = Column(String(100), unique=True, nullable=True, index=True)
    auth_provider = Column(String(20), default='password')
    role = Column(Enum('admin', 'user', name="user_roles"), default='user')
    avatar_url = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Quan hệ
    workspaces = relationship("Workspace", back_populates="owner", cascade="all, delete")
    comments = relationship("Comment", back_populates="user", cascade="all, delete")
    notifications = relationship("Notification", back_populates="user", cascade="all, delete")
    project_messages = relationship("ProjectMessage", back_populates="user", cascade="all, delete")
    task_bookmarks = relationship("TaskBookmark", back_populates="user", cascade="all, delete")

# Bảng Workspaces
class Workspace(Base):
    __tablename__ = "workspaces"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    owner_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Quan hệ
    owner = relationship("User", back_populates="workspaces")
    projects = relationship("Project", back_populates="workspace", cascade="all, delete")

# Bảng Projects
class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id", ondelete="SET NULL"), nullable=True)
    owner_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    name = Column(String(100), nullable=False)
    project_key = Column(String(20), nullable=True)
    color = Column(String(20), nullable=True)
    description = Column(Text, nullable=True)
    status = Column(Enum('Active', 'Completed', 'On Hold', name="project_status"), default='Active')
    is_starred = Column(Boolean, default=False)
    is_archived = Column(Boolean, default=False)
    start_date = Column(DateTime, nullable=True)
    end_date = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True, default=None)  # soft delete

    # Quan hệ
    workspace = relationship("Workspace", back_populates="projects")
    owner = relationship("User", foreign_keys=[owner_id])
    members = relationship("ProjectMember", back_populates="project", cascade="all, delete")
    boards = relationship("Board", back_populates="project", cascade="all, delete")
    tags = relationship("Tag", back_populates="project", cascade="all, delete")
    messages = relationship("ProjectMessage", back_populates="project", cascade="all, delete")

# Bảng Project_Members
class ProjectMember(Base):
    __tablename__ = "project_members"

    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    project_role = Column(Enum('manager', 'developer', 'tester', name="member_roles"), default='developer')
    can_manage_tasks = Column(Boolean, default=False)
    joined_at = Column(DateTime, default=datetime.utcnow)

    # Quan hệ
    project = relationship("Project", back_populates="members")
    user = relationship("User")

# Bảng Boards
class Board(Base):
    __tablename__ = "boards"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    visibility = Column(String(20), default='private')
    cover_image = Column(String(255), nullable=True)
    order_index = Column(Integer, default=0)
    is_archived = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Quan hệ
    project = relationship("Project", back_populates="boards")
    columns = relationship("BoardColumn", back_populates="board", cascade="all, delete")

# Bảng Board_Columns
class BoardColumn(Base):
    __tablename__ = "board_columns"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    board_id = Column(Integer, ForeignKey("boards.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(50), nullable=False)
    order_index = Column(Integer, nullable=False)
    color = Column(String(20), nullable=True)
    wip_limit = Column(Integer, nullable=True)
    is_done = Column(Boolean, default=False)
    deleted_at = Column(DateTime, nullable=True, default=None)  # soft delete

    # Quan hệ
    board = relationship("Board", back_populates="columns")
    tasks = relationship("Task", back_populates="column", cascade="all, delete")

# Bảng Tasks (Core Table)
class Task(Base):
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    column_id = Column(Integer, ForeignKey("board_columns.id", ondelete="CASCADE"), nullable=False)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    
    priority = Column(Enum('Low', 'Medium', 'High', name="task_priority"), default='Medium')
    task_type = Column(Enum('Task', 'Bug', 'Feature', 'Docs', name="task_types"), default='Task')
    
    assignee_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    reporter_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    start_date = Column(DateTime, nullable=True)
    due_date = Column(DateTime, nullable=True)
    estimated_hours = Column(Numeric(6, 2), nullable=True)
    progress_percent = Column(Integer, default=0)
    checklist_total = Column(Integer, default=0)
    checklist_completed = Column(Integer, default=0)
    completed_at = Column(DateTime, nullable=True)
    order_index = Column(Integer, nullable=False)
    is_ai_generated = Column(Boolean, default=False)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True, default=None)  # soft delete

    # Quan hệ
    column = relationship("BoardColumn", back_populates="tasks")
    assignee = relationship("User", foreign_keys=[assignee_id])
    reporter = relationship("User", foreign_keys=[reporter_id])
    checklist_items = relationship("TaskChecklistItem", back_populates="task", cascade="all, delete")
    comments = relationship("Comment", back_populates="task", cascade="all, delete")
    attachments = relationship("Attachment", back_populates="task", cascade="all, delete")
    tags = relationship("Tag", secondary="task_tags", back_populates="tasks")
    bookmarks = relationship("TaskBookmark", back_populates="task", cascade="all, delete")

class TaskEmbedding(Base):
    __tablename__ = "task_embeddings"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    task_id = Column(Integer, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    model = Column(String(100), nullable=False)
    text_hash = Column(String(64), nullable=False)
    vector_json = Column(Text, nullable=False)
    task_updated_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    task = relationship("Task")

class TaskBookmark(Base):
    __tablename__ = "task_bookmarks"
    __table_args__ = (
        UniqueConstraint("user_id", "task_id", name="uq_task_bookmarks_user_task"),
    )

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    task_id = Column(Integer, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="task_bookmarks")
    task = relationship("Task", back_populates="bookmarks")

# Bảng Task_Checklist_Items
class TaskChecklistItem(Base):
    __tablename__ = "task_checklist_items"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    task_id = Column(Integer, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False)
    title = Column(String(255), nullable=False)
    is_done = Column(Boolean, default=False)
    order_index = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    task = relationship("Task", back_populates="checklist_items")

# Bảng Comments
class Comment(Base):
    __tablename__ = "comments"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    task_id = Column(Integer, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True, default=None)  # soft delete

    user = relationship("User", back_populates="comments")
    task = relationship("Task", back_populates="comments")

# Bang Project_Messages
class ProjectMessage(Base):
    __tablename__ = "project_messages"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True, default=None)

    project = relationship("Project", back_populates="messages")
    user = relationship("User", back_populates="project_messages")

# Bảng Attachments
class Attachment(Base):
    __tablename__ = "attachments"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    task_id = Column(Integer, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False)
    uploader_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    file_name = Column(String(255), nullable=False)
    file_url = Column(String(500), nullable=False)
    file_size = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    task = relationship("Task", back_populates="attachments")
    uploader = relationship("User")

# Bảng Tags
class Tag(Base):
    __tablename__ = "tags"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(50), nullable=False)
    color_hex = Column(String(10), default='#E2E8F0')

    project = relationship("Project", back_populates="tags")
    tasks = relationship("Task", secondary="task_tags", back_populates="tags")

# Bảng Task_Tags (Association Table)
class TaskTag(Base):
    __tablename__ = "task_tags"
    task_id = Column(Integer, ForeignKey("tasks.id", ondelete="CASCADE"), primary_key=True)
    tag_id = Column(Integer, ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True)

# Bảng Notifications
class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    title = Column(String(100), nullable=False)
    content = Column(String(255), nullable=False)
    link_url = Column(String(255), nullable=True)
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="notifications")

# Bảng Activity_Logs
class ActivityLog(Base):
    __tablename__ = "activity_logs"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    action_type = Column(String(50), nullable=False)
    entity_id = Column(Integer, nullable=False)
    old_value = Column(String(255), nullable=True)
    new_value = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    project = relationship("Project")
    user = relationship("User")

# Bảng AI_Prediction_Logs
class AIPredictionLog(Base):
    __tablename__ = "ai_prediction_logs"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    task_id = Column(Integer, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False)
    predicted_priority = Column(Enum('Low', 'Medium', 'High', name="predicted_priority"), nullable=True)
    predicted_type = Column(Enum('Task', 'Bug', 'Feature', 'Docs', name="predicted_type"), nullable=True)
    confidence_score = Column(Numeric(5, 4), nullable=True)
    processing_time_ms = Column(Integer, nullable=True)
    is_correct = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    task = relationship("Task")

