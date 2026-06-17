import json
import os
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from threading import Lock

from fastapi import HTTPException


VIETNAM_TZ = timezone(timedelta(hours=7))
LIMIT_STORE_PATH = Path(__file__).resolve().parents[2] / ".ai_rate_limits.json"
_limit_lock = Lock()


def _safe_int(value: str | int | None, default: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _read_store() -> dict:
    if not LIMIT_STORE_PATH.exists():
        return {}
    try:
        with LIMIT_STORE_PATH.open("r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def _write_store(data: dict) -> None:
    LIMIT_STORE_PATH.parent.mkdir(parents=True, exist_ok=True)
    with LIMIT_STORE_PATH.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def _limit_for(feature: str, user_role: str | None) -> int:
    if feature == "duplicate-check":
        return max(1, _safe_int(os.getenv("AI_DUPLICATE_DAILY_LIMIT"), 120))
    if user_role == "admin":
        return max(1, _safe_int(os.getenv("AI_ADMIN_DAILY_LIMIT"), 80))
    return max(1, _safe_int(os.getenv("AI_USER_DAILY_LIMIT"), 30))


def _cooldown_for(feature: str) -> int:
    if feature == "duplicate-check":
        return max(0, _safe_int(os.getenv("AI_DUPLICATE_COOLDOWN_SECONDS"), 0))
    return max(0, _safe_int(os.getenv("AI_USER_COOLDOWN_SECONDS"), 8))


def enforce_ai_quota(user_id: int, user_role: str | None, feature: str, project_id: int | None = None) -> dict:
    """Reject AI calls before provider usage when user exceeds local quota/cooldown."""
    now = time.time()
    today = datetime.now(VIETNAM_TZ).date().isoformat()
    daily_limit = _limit_for(feature, user_role)
    cooldown_seconds = _cooldown_for(feature)
    user_key = str(user_id)

    with _limit_lock:
        store = _read_store()
        today_store = store.setdefault(today, {})
        user_store = today_store.setdefault(user_key, {"features": {}, "total": 0})
        features = user_store.setdefault("features", {})
        feature_store = features.setdefault(feature, {"count": 0, "last_call_at": 0})

        last_call_at = float(feature_store.get("last_call_at") or 0)
        remaining_wait = cooldown_seconds - (now - last_call_at)
        if remaining_wait > 0:
            raise HTTPException(
                status_code=429,
                detail=f"Bạn đang gọi AI quá nhanh. Vui lòng thử lại sau {int(remaining_wait) + 1} giây.",
            )

        used = int(feature_store.get("count") or 0)
        if used >= daily_limit:
            raise HTTPException(
                status_code=429,
                detail=f"Đã vượt hạn mức AI hôm nay cho chức năng này ({used}/{daily_limit} lượt).",
            )

        feature_store["count"] = used + 1
        feature_store["last_call_at"] = now
        feature_store["project_id"] = project_id
        user_store["total"] = int(user_store.get("total") or 0) + 1
        user_store["role"] = user_role or "user"
        _write_store(store)

        return {
            "feature": feature,
            "used": used + 1,
            "limit": daily_limit,
            "remaining": max(0, daily_limit - used - 1),
            "cooldown_seconds": cooldown_seconds,
        }
