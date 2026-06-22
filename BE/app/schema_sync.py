from sqlalchemy import text


def _column_exists(conn, table_name: str, column_name: str) -> bool:
    result = conn.execute(
        text(
            """
            SELECT COUNT(*)
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = :table_name
              AND COLUMN_NAME = :column_name
            """
        ),
        {"table_name": table_name, "column_name": column_name},
    ).scalar()
    return bool(result)


def _table_exists(conn, table_name: str) -> bool:
    result = conn.execute(
        text(
            """
            SELECT COUNT(*)
            FROM INFORMATION_SCHEMA.TABLES
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = :table_name
            """
        ),
        {"table_name": table_name},
    ).scalar()
    return bool(result)


def _add_column_if_missing(conn, table_name: str, column_name: str, definition: str) -> None:
    if not _column_exists(conn, table_name, column_name):
        conn.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {definition}"))


def sync_schema(engine) -> None:
    """Lightweight MySQL schema synchronizer for demo/dev.

    This keeps DB aligned with model changes without requiring manual SQL each time.
    """
    if engine.dialect.name != "mysql":
        return

    with engine.begin() as conn:
        if _table_exists(conn, "users"):
            _add_column_if_missing(conn, "users", "google_sub", "VARCHAR(100) NULL UNIQUE")
            _add_column_if_missing(conn, "users", "auth_provider", "VARCHAR(20) DEFAULT 'password'")
            if _column_exists(conn, "users", "password_hash"):
                conn.execute(text("ALTER TABLE users MODIFY COLUMN password_hash VARCHAR(255) NULL"))

        if _table_exists(conn, "projects"):
            # richer project fields
            _add_column_if_missing(conn, "projects", "owner_id", "INT NULL")
            _add_column_if_missing(conn, "projects", "project_key", "VARCHAR(20) NULL")
            _add_column_if_missing(conn, "projects", "color", "VARCHAR(20) NULL")
            _add_column_if_missing(conn, "projects", "is_starred", "BOOLEAN DEFAULT FALSE")
            _add_column_if_missing(conn, "projects", "is_archived", "BOOLEAN DEFAULT FALSE")
            _add_column_if_missing(conn, "projects", "start_date", "DATETIME NULL")
            _add_column_if_missing(conn, "projects", "end_date", "DATETIME NULL")

            # workspace is deprecated in runtime flow; make nullable and detach FK if still present
            if _column_exists(conn, "projects", "workspace_id"):
                fk_rows = conn.execute(
                    text(
                        """
                        SELECT CONSTRAINT_NAME
                        FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
                        WHERE TABLE_SCHEMA = DATABASE()
                          AND TABLE_NAME = 'projects'
                          AND COLUMN_NAME = 'workspace_id'
                          AND REFERENCED_TABLE_NAME IS NOT NULL
                        """
                    )
                ).fetchall()
                for row in fk_rows:
                    conn.execute(text(f"ALTER TABLE projects DROP FOREIGN KEY {row[0]}"))
                conn.execute(text("ALTER TABLE projects MODIFY COLUMN workspace_id INT NULL"))

            # Backfill owner from first manager if owner_id empty
            conn.execute(
                text(
                    """
                    UPDATE projects p
                    LEFT JOIN (
                        SELECT pm.project_id, MIN(pm.user_id) AS owner_user_id
                        FROM project_members pm
                        WHERE pm.project_role = 'manager'
                        GROUP BY pm.project_id
                    ) x ON x.project_id = p.id
                    SET p.owner_id = COALESCE(p.owner_id, x.owner_user_id)
                    """
                )
            )

        if _table_exists(conn, "boards"):
            _add_column_if_missing(conn, "boards", "description", "TEXT NULL")
            _add_column_if_missing(conn, "boards", "visibility", "VARCHAR(20) DEFAULT 'private'")
            _add_column_if_missing(conn, "boards", "cover_image", "VARCHAR(255) NULL")
            _add_column_if_missing(conn, "boards", "order_index", "INT DEFAULT 0")
            _add_column_if_missing(conn, "boards", "is_archived", "BOOLEAN DEFAULT FALSE")

        if _table_exists(conn, "board_columns"):
            _add_column_if_missing(conn, "board_columns", "color", "VARCHAR(20) NULL")
            _add_column_if_missing(conn, "board_columns", "wip_limit", "INT NULL")
            _add_column_if_missing(conn, "board_columns", "is_done", "BOOLEAN DEFAULT FALSE")

        if _table_exists(conn, "tasks"):
            _add_column_if_missing(conn, "tasks", "start_date", "DATETIME NULL")
            _add_column_if_missing(conn, "tasks", "estimated_hours", "DECIMAL(6,2) NULL")
            _add_column_if_missing(conn, "tasks", "progress_percent", "INT DEFAULT 0")
            _add_column_if_missing(conn, "tasks", "checklist_total", "INT DEFAULT 0")
            _add_column_if_missing(conn, "tasks", "checklist_completed", "INT DEFAULT 0")
            _add_column_if_missing(conn, "tasks", "completed_at", "DATETIME NULL")
            _add_column_if_missing(conn, "tasks", "deleted_at", "DATETIME NULL")
            conn.execute(text("UPDATE tasks SET start_date = COALESCE(start_date, created_at)"))

        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS task_embeddings (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    task_id INT NOT NULL UNIQUE,
                    model VARCHAR(100) NOT NULL,
                    text_hash VARCHAR(64) NOT NULL,
                    vector_json TEXT NOT NULL,
                    task_updated_at DATETIME NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    INDEX idx_task_embeddings_task_id (task_id),
                    CONSTRAINT fk_task_embeddings_task
                        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
                )
                """
            )
        )

        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS task_bookmarks (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    user_id INT NOT NULL,
                    task_id INT NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE KEY uq_task_bookmarks_user_task (user_id, task_id),
                    INDEX idx_task_bookmarks_user_id (user_id),
                    INDEX idx_task_bookmarks_task_id (task_id),
                    CONSTRAINT fk_task_bookmarks_user
                        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                    CONSTRAINT fk_task_bookmarks_task
                        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
                )
                """
            )
        )

        if _table_exists(conn, "projects"):
            _add_column_if_missing(conn, "projects", "deleted_at", "DATETIME NULL")

        if _table_exists(conn, "project_members"):
            _add_column_if_missing(conn, "project_members", "can_manage_tasks", "BOOLEAN DEFAULT FALSE")
            conn.execute(
                text(
                    """
                    UPDATE project_members
                    SET can_manage_tasks = TRUE
                    WHERE project_role = 'manager'
                      AND (can_manage_tasks IS NULL OR can_manage_tasks = FALSE)
                    """
                )
            )

        if _table_exists(conn, "comments"):
            _add_column_if_missing(conn, "comments", "deleted_at", "DATETIME NULL")

        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS project_messages (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    project_id INT NOT NULL,
                    user_id INT NOT NULL,
                    content TEXT NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    deleted_at DATETIME NULL,
                    INDEX idx_project_messages_project_id (project_id),
                    INDEX idx_project_messages_user_id (user_id),
                    CONSTRAINT fk_project_messages_project
                        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
                    CONSTRAINT fk_project_messages_user
                        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                )
                """
            )
        )
