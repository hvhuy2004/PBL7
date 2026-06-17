from app.database import SessionLocal
from app import models


PREFIX = "QA delete smoke"


def main() -> None:
    db = SessionLocal()
    try:
        projects = (
            db.query(models.Project)
            .filter(models.Project.name.like(f"{PREFIX}%"))
            .all()
        )
        count = len(projects)
        for project in projects:
            db.delete(project)
        db.commit()
        print(f"Hard-deleted {count} QA delete smoke project(s).")
    finally:
        db.close()


if __name__ == "__main__":
    main()
