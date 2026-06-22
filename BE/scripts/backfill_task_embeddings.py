from __future__ import annotations

import argparse
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.database import SessionLocal  # noqa: E402
from app import models  # noqa: E402
from app.routers.tasks import (  # noqa: E402
    _call_embedding_api_batched,
    _embedding_model_cache_key,
    _load_stored_task_vectors,
    _store_task_embedding,
    _task_duplicate_text,
    _task_text_hash,
)


def _chunks(items: list[models.Task], size: int) -> list[list[models.Task]]:
    return [items[index:index + size] for index in range(0, len(items), size)]


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Create or refresh stored Gemini embeddings for existing active tasks."
    )
    parser.add_argument("--project-id", type=int, default=None, help="Only backfill one project.")
    parser.add_argument("--batch-size", type=int, default=16, help="Number of tasks per embedding request.")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        query = db.query(models.Task).filter(models.Task.deleted_at.is_(None))
        if args.project_id is not None:
            query = query.filter(models.Task.project_id == args.project_id)

        tasks = query.order_by(models.Task.project_id.asc(), models.Task.id.asc()).all()
        if not tasks:
            print("No active tasks found.")
            return 0

        _, missing_tasks = _load_stored_task_vectors(db, tasks)
        print(f"Embedding model: {_embedding_model_cache_key()}")
        print(f"Active tasks scanned: {len(tasks)}")
        print(f"Tasks needing embedding: {len(missing_tasks)}")

        if not missing_tasks:
            print("OK: all active tasks already have fresh embeddings.")
            return 0

        total_saved = 0
        batch_size = max(1, min(args.batch_size, 64))
        for batch in _chunks(missing_tasks, batch_size):
            texts = [_task_duplicate_text(task.title, task.description) for task in batch]
            vectors, used_model = _call_embedding_api_batched(texts)
            for task, vector in zip(batch, vectors):
                _store_task_embedding(
                    db,
                    task,
                    used_model,
                    _task_text_hash(_task_duplicate_text(task.title, task.description)),
                    vector,
                )
                total_saved += 1
            db.commit()
            print(f"Saved {total_saved}/{len(missing_tasks)} embeddings...")

        print(f"OK: saved {total_saved} task embeddings.")
        return 0
    except Exception as exc:
        db.rollback()
        print(f"ERROR: {exc}")
        return 1
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
