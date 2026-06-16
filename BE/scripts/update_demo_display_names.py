from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.database import SessionLocal  # noqa: E402
from app import models  # noqa: E402


NAME_MAPPING = {
    "demo.manager@agileai-demo.com": "Nguyễn An",
    "huy.huynh@agileai-demo.com": "Huy Huỳnh",
    "an.tran@agileai-demo.com": "An Trần",
    "linh.tester@agileai-demo.com": "Linh Nguyễn",
    "minh.designer@agileai-demo.com": "Minh Phạm",
    "khoa.backend@agileai-demo.com": "Khoa Trần",
    "trang.content@agileai-demo.com": "Trang Lê",
    "phuc.qa@agileai-demo.com": "Phúc Hoàng",
}


def main() -> None:
    updated = 0
    with SessionLocal() as db:
        users = db.query(models.User).filter(models.User.email.in_(list(NAME_MAPPING.keys()))).all()
        for user in users:
            target_name = NAME_MAPPING.get(user.email)
            if target_name and user.full_name != target_name:
                user.full_name = target_name
                updated += 1
        db.commit()

    print(f"Updated {updated} demo user display names.")


if __name__ == "__main__":
    main()
