import json
import hashlib
import math
import os
import re
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime
from difflib import SequenceMatcher

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional

from app import schemas, models
from app.database import get_db
from app.core import deps
from app.core.ai_limits import enforce_ai_quota
from app.crud import task as crud_task

router = APIRouter(tags=["Tasks & Kanban"])

DEFAULT_EMBEDDING_MODEL = "openai/text-embedding-3-small"
DEFAULT_DUPLICATE_THRESHOLD = 0.88
EMBEDDING_FAILURE_COOLDOWN_SECONDS = 300
_embedding_disabled_until = 0.0
_duplicate_check_cache: dict[str, tuple[float, schemas.TaskDuplicateCheckResponse]] = {}


def _safe_terminal_print(message: str) -> None:
    try:
        print(message, flush=True)
    except (OSError, UnicodeEncodeError):
        pass


def _duplicate_cache_ttl_seconds() -> int:
    try:
        ttl = int(os.getenv("TASK_DUPLICATE_CACHE_TTL_SECONDS", "300"))
    except ValueError:
        ttl = 300
    return max(0, min(ttl, 1800))


def _tasks_signature(tasks: list[models.Task]) -> str:
    parts = [
        f"{task.id}:{task.updated_at.isoformat() if task.updated_at else ''}"
        for task in tasks
    ]
    return "|".join(parts) or "empty"


def _duplicate_cache_key(
    project_id: int,
    title: str | None,
    description: str | None,
    exclude_task_id: int | None,
    threshold: float,
    tasks: list[models.Task],
) -> str:
    text_key = _normalize_text(_task_duplicate_text(title, description))
    return json.dumps(
        {
            "project_id": project_id,
            "text": text_key,
            "exclude_task_id": exclude_task_id,
            "threshold": round(threshold, 4),
            "tasks": _tasks_signature(tasks),
        },
        ensure_ascii=True,
        sort_keys=True,
    )


def _get_duplicate_cache(key: str) -> schemas.TaskDuplicateCheckResponse | None:
    ttl = _duplicate_cache_ttl_seconds()
    if ttl <= 0:
        return None
    cached = _duplicate_check_cache.get(key)
    if not cached:
        return None
    cached_at, response = cached
    if time.time() - cached_at > ttl:
        _duplicate_check_cache.pop(key, None)
        return None
    return response


def _set_duplicate_cache(key: str, response: schemas.TaskDuplicateCheckResponse) -> None:
    ttl = _duplicate_cache_ttl_seconds()
    if ttl <= 0:
        return
    if len(_duplicate_check_cache) > 300:
        oldest_keys = sorted(_duplicate_check_cache, key=lambda item: _duplicate_check_cache[item][0])[:80]
        for old_key in oldest_keys:
            _duplicate_check_cache.pop(old_key, None)
    _duplicate_check_cache[key] = (time.time(), response)


AUTH_INTENT_KEYWORDS = {
    "login": {"dang nhap", "login", "jwt", "token", "credential", "xac thuc", "auth", "authenticate", "authentication"},
    "register": {"dang ky", "dang ki", "register", "signup", "sign up"},
    "forgot_password": {"quen mat khau", "reset password", "forgot password"},
    "oauth": {"oauth", "google"},
}
OAUTH_PROVIDER_KEYWORDS = {
    "google": {"google"},
    "facebook": {"facebook", "fb"},
    "github": {"github"},
}
WORK_SURFACE_KEYWORDS = {
    "api": {"api", "endpoint", "backend", "server"},
    "ui": {"ui", "giao dien", "frontend", "form", "layout", "man hinh"},
    "test": {"test", "kiem thu", "qa"},
    "docs": {"tai lieu", "docs", "document", "huong dan"},
}
TASK_CORE_STOPWORDS = {
    "task", "cong", "viec", "module", "chuc", "nang",
    "tao", "viet", "xay", "dung", "phat", "trien", "thiet", "ke",
    "sua", "fix", "xu", "ly", "lam", "kiem", "thu", "test", "review",
    "tich", "hop", "toi", "uu", "phan", "ra", "bao", "cao",
    "tai", "lieu", "docs", "document", "huong", "dan",
    "ui", "frontend", "form", "layout", "giao", "dien", "man", "hinh",
    "hien", "thi", "danh", "sach",
}


def _normalize_text(value: str | None) -> str:
    if not value:
        return ""
    text = unicodedata.normalize("NFD", value.lower())
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn")
    text = text.replace("đ", "d")
    text = re.sub(r"[^a-z0-9\s]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _task_duplicate_text(title: str | None, description: str | None) -> str:
    return f"{title or ''}\n{description or ''}".strip()


def _task_text_hash(text: str) -> str:
    return hashlib.sha256(_normalize_text(text).encode("utf-8")).hexdigest()


def _embedding_model_cache_key() -> str:
    provider = os.getenv("EMBEDDING_PROVIDER", "gemini").strip().lower()
    if os.getenv("GEMINI_API_KEY") and provider in {"", "auto", "gemini"}:
        return f"gemini/{os.getenv('GEMINI_EMBEDDING_MODEL', 'gemini-embedding-001')}"
    if os.getenv("OPENROUTER_API_KEY"):
        return os.getenv("OPENROUTER_EMBEDDING_MODEL", DEFAULT_EMBEDDING_MODEL)
    if os.getenv("OPENAI_API_KEY"):
        return os.getenv("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small")
    return os.getenv("EMBEDDING_MODEL", DEFAULT_EMBEDDING_MODEL)


def _task_timestamp_matches(stored: datetime | None, current: datetime | None) -> bool:
    if not stored or not current:
        return False
    return stored.replace(microsecond=0) == current.replace(microsecond=0)


def _parse_stored_vector(value: str | None) -> list[float] | None:
    if not value:
        return None
    try:
        vector = json.loads(value)
    except (TypeError, json.JSONDecodeError):
        return None
    if not isinstance(vector, list) or not vector or not all(isinstance(item, (int, float)) for item in vector):
        return None
    return [float(item) for item in vector]


def _store_task_embedding(
    db: Session,
    task: models.Task,
    model: str,
    text_hash: str,
    vector: list[float],
) -> None:
    row = db.query(models.TaskEmbedding).filter(models.TaskEmbedding.task_id == task.id).first()
    if row is None:
        row = models.TaskEmbedding(task_id=task.id)
        db.add(row)
    row.model = model
    row.text_hash = text_hash
    row.vector_json = json.dumps(vector, separators=(",", ":"))
    row.task_updated_at = task.updated_at or datetime.utcnow()


def _load_stored_task_vectors(
    db: Session,
    tasks: list[models.Task],
) -> tuple[dict[int, list[float]], list[models.Task]]:
    if not tasks:
        return {}, []
    model = _embedding_model_cache_key()
    rows = {
        row.task_id: row
        for row in db.query(models.TaskEmbedding)
        .filter(models.TaskEmbedding.task_id.in_([task.id for task in tasks]))
        .all()
    }
    vectors: dict[int, list[float]] = {}
    missing: list[models.Task] = []
    for task in tasks:
        text = _task_duplicate_text(task.title, task.description)
        row = rows.get(task.id)
        vector = _parse_stored_vector(row.vector_json if row else None)
        if (
            row
            and vector
            and row.model == model
            and row.text_hash == _task_text_hash(text)
            and _task_timestamp_matches(row.task_updated_at, task.updated_at)
        ):
            vectors[task.id] = vector
        else:
            missing.append(task)
    return vectors, missing


def _cosine_similarity(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(y * y for y in b))
    if not norm_a or not norm_b:
        return 0.0
    return dot / (norm_a * norm_b)


def _token_similarity(a: str, b: str) -> float:
    tokens_a = set(_normalize_text(a).split())
    tokens_b = set(_normalize_text(b).split())
    if not tokens_a or not tokens_b:
        return 0.0
    overlap = len(tokens_a & tokens_b)
    return overlap / max(1, len(tokens_a | tokens_b))


def _core_tokens(value: str | None) -> set[str]:
    return {
        token
        for token in _normalize_text(value).split()
        if len(token) >= 3 and token not in TASK_CORE_STOPWORDS
    }


def _intent_tags(value: str | None) -> set[str]:
    normalized = _normalize_text(value)
    return {
        intent
        for intent, keywords in AUTH_INTENT_KEYWORDS.items()
        if any(keyword in normalized for keyword in keywords)
    }


def _auth_concepts(value: str | None) -> set[str]:
    normalized = _normalize_text(value)
    concepts: set[str] = set()
    if any(keyword in normalized for keyword in {"dang nhap", "login", "credential"}):
        concepts.add("login")
    if any(keyword in normalized for keyword in {"jwt", "token", "refresh token"}):
        concepts.add("token")
    if any(keyword in normalized for keyword in {"xac thuc", "auth", "authenticate", "authentication"}):
        concepts.add("auth")
    return concepts


def _has_conflicting_intent(new_text: str | None, existing_text: str | None) -> bool:
    new_intents = _intent_tags(new_text)
    existing_intents = _intent_tags(existing_text)
    return bool(new_intents and existing_intents and new_intents.isdisjoint(existing_intents))


def _provider_tags(value: str | None) -> set[str]:
    normalized = _normalize_text(value)
    return {
        provider
        for provider, keywords in OAUTH_PROVIDER_KEYWORDS.items()
        if any(keyword in normalized for keyword in keywords)
    }


def _has_conflicting_provider(new_text: str | None, existing_text: str | None) -> bool:
    new_providers = _provider_tags(new_text)
    existing_providers = _provider_tags(existing_text)
    return bool(new_providers and existing_providers and new_providers.isdisjoint(existing_providers))


def _surface_tags(value: str | None) -> set[str]:
    normalized = _normalize_text(value)
    return {
        surface
        for surface, keywords in WORK_SURFACE_KEYWORDS.items()
        if any(keyword in normalized for keyword in keywords)
    }


def _has_conflicting_surface(new_text: str | None, existing_text: str | None) -> bool:
    new_surfaces = _surface_tags(new_text)
    existing_surfaces = _surface_tags(existing_text)
    return bool(new_surfaces and existing_surfaces and new_surfaces.isdisjoint(existing_surfaces))


def _lexical_similarity(
    new_title: str | None,
    new_description: str | None,
    existing_title: str | None,
    existing_description: str | None,
) -> float:
    new_text = _normalize_text(_task_duplicate_text(new_title, new_description))
    existing_text = _normalize_text(_task_duplicate_text(existing_title, existing_description))
    new_title_norm = _normalize_text(new_title)
    existing_title_norm = _normalize_text(existing_title)
    if not new_text or not existing_text:
        return 0.0
    conflicting_intent = _has_conflicting_intent(
        _task_duplicate_text(new_title, new_description),
        _task_duplicate_text(existing_title, existing_description),
    )
    conflicting_provider = _has_conflicting_provider(
        _task_duplicate_text(new_title, new_description),
        _task_duplicate_text(existing_title, existing_description),
    )
    conflicting_surface = _has_conflicting_surface(
        _task_duplicate_text(new_title, new_description),
        _task_duplicate_text(existing_title, existing_description),
    )
    shared_intents = _intent_tags(_task_duplicate_text(new_title, new_description)) & _intent_tags(_task_duplicate_text(existing_title, existing_description))
    shared_surfaces = _surface_tags(_task_duplicate_text(new_title, new_description)) & _surface_tags(_task_duplicate_text(existing_title, existing_description))

    scores = [
        _token_similarity(new_text, existing_text),
        SequenceMatcher(None, new_title_norm, existing_title_norm).ratio(),
        SequenceMatcher(None, new_text, existing_text).ratio() * 0.9,
    ]

    title_tokens_a = set(new_title_norm.split())
    title_tokens_b = set(existing_title_norm.split())
    if title_tokens_a and title_tokens_b:
        title_overlap = len(title_tokens_a & title_tokens_b)
        title_containment = title_overlap / max(1, min(len(title_tokens_a), len(title_tokens_b)))
        title_jaccard = title_overlap / max(1, len(title_tokens_a | title_tokens_b))
        if title_overlap >= 2:
            title_score = (
                0.58
                + 0.22 * title_containment
                + 0.12 * title_jaccard
                + 0.08 * SequenceMatcher(None, new_title_norm, existing_title_norm).ratio()
            )
            if title_tokens_a != title_tokens_b:
                title_score = min(title_score, 0.91)
            scores.append(title_score)

    core_a = _core_tokens(new_title)
    core_b = _core_tokens(existing_title)
    if core_a and core_b:
        core_overlap = len(core_a & core_b)
        core_containment = core_overlap / max(1, min(len(core_a), len(core_b)))
        core_jaccard = core_overlap / max(1, len(core_a | core_b))
        if core_overlap >= 2:
            if core_a == core_b:
                scores.append(0.96)
            else:
                core_score = (
                    0.58
                    + 0.17 * core_containment
                    + 0.11 * core_jaccard
                    + 0.05 * SequenceMatcher(None, new_title_norm, existing_title_norm).ratio()
                )
                scores.append(min(core_score, 0.90))
                if core_overlap >= 3 and core_containment >= 0.75:
                    scores.append(min(0.92, 0.86 + 0.06 * core_jaccard))
        elif core_overlap == 1 and len(core_a | core_b) <= 3:
            scores.append(0.72)

    combined_core_a = _core_tokens(_task_duplicate_text(new_title, new_description))
    combined_core_b = _core_tokens(_task_duplicate_text(existing_title, existing_description))
    if combined_core_a and combined_core_b:
        combined_overlap = len(combined_core_a & combined_core_b)
        combined_containment = combined_overlap / max(1, min(len(combined_core_a), len(combined_core_b)))
        combined_jaccard = combined_overlap / max(1, len(combined_core_a | combined_core_b))
        if combined_overlap >= 2:
            if combined_overlap >= 3 and combined_containment >= 0.70 and len(combined_core_a) <= len(combined_core_b):
                scores.append(min(0.92, 0.86 + 0.06 * combined_jaccard))
            else:
                scores.append(
                    0.55
                    + 0.18 * combined_containment
                    + 0.12 * combined_jaccard
                    + 0.04 * SequenceMatcher(None, new_text, existing_text).ratio()
                )

    if shared_intents and shared_surfaces:
        if "ui" in shared_surfaces:
            scores.append(0.89 + 0.04 * SequenceMatcher(None, new_title_norm, existing_title_norm).ratio())
        elif "api" in shared_surfaces:
            scores.append(0.87 + 0.04 * SequenceMatcher(None, new_title_norm, existing_title_norm).ratio())
        else:
            scores.append(0.85 + 0.04 * SequenceMatcher(None, new_title_norm, existing_title_norm).ratio())

    if shared_surfaces and not conflicting_intent and not conflicting_provider:
        shared_core = combined_core_a & combined_core_b
        if len(shared_core) >= 3:
            surface_core_score = 0.86 + 0.05 * min(1.0, len(shared_core) / 5)
            if "ui" in shared_surfaces:
                surface_core_score += 0.01
            scores.append(min(0.92, surface_core_score))

    if shared_intents and not conflicting_provider and not conflicting_surface:
        new_auth_concepts = _auth_concepts(new_text)
        existing_auth_concepts = _auth_concepts(existing_text)
        auth_overlap = new_auth_concepts & existing_auth_concepts
        new_providers = _provider_tags(new_text)
        existing_providers = _provider_tags(existing_text)
        oauth_mismatch = ("oauth" in _intent_tags(new_text) or "oauth" in _intent_tags(existing_text)) and (
            "oauth" not in shared_intents or new_providers != existing_providers
        )
        has_strong_auth_signal = bool({"token", "auth"} & new_auth_concepts and {"token", "auth"} & existing_auth_concepts)
        if auth_overlap and has_strong_auth_signal and not oauth_mismatch:
            auth_score = 0.87 + 0.03 * min(1.0, len(auth_overlap) / 2)
            if "login" in shared_intents:
                auth_score += 0.02
            scores.append(min(0.93, auth_score))

    score = min(1.0, max(scores))
    if conflicting_intent:
        score = min(score, 0.72)
    if conflicting_provider:
        score = min(score, 0.74)
    if conflicting_surface:
        score = min(score, 0.78)
    return score


def _embedding_headers() -> tuple[str, dict, str] | None:
    openrouter_key = os.getenv("OPENROUTER_API_KEY")
    if openrouter_key:
        return (
            os.getenv("OPENROUTER_EMBEDDING_URL", "https://openrouter.ai/api/v1/embeddings"),
            {
                "Authorization": f"Bearer {openrouter_key}",
                "Content-Type": "application/json",
                "HTTP-Referer": os.getenv("OPENROUTER_SITE_URL", "http://localhost:5173"),
                "X-Title": os.getenv("OPENROUTER_APP_NAME", "AgileAI"),
            },
            os.getenv("OPENROUTER_EMBEDDING_MODEL", DEFAULT_EMBEDDING_MODEL),
        )

    openai_key = os.getenv("OPENAI_API_KEY")
    if openai_key:
        return (
            os.getenv("OPENAI_EMBEDDING_URL", "https://api.openai.com/v1/embeddings"),
            {
                "Authorization": f"Bearer {openai_key}",
                "Content-Type": "application/json",
            },
            os.getenv("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small"),
        )
    return None


def _call_embedding_api(texts: list[str]) -> tuple[list[list[float]], str]:
    global _embedding_disabled_until
    now = time.time()
    if now < _embedding_disabled_until:
        raise RuntimeError("Embedding API tạm nghỉ sau lỗi gần nhất")

    config = _embedding_headers()
    if not config:
        raise RuntimeError("Chưa cấu hình API embedding")
    endpoint, headers, model = config
    payload = {
        "model": model,
        "input": texts,
    }
    if model == DEFAULT_EMBEDDING_MODEL:
        payload["dimensions"] = 1536

    last_error = None
    for attempt in range(2):
        req = urllib.request.Request(
            endpoint,
            data=json.dumps(payload).encode("utf-8"),
            headers=headers,
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=8) as resp:
                body = json.loads(resp.read().decode("utf-8"))
            if body.get("error"):
                raise RuntimeError(str(body["error"])[:240])
            data = sorted(body.get("data") or [], key=lambda item: item.get("index", 0))
            embeddings = [item.get("embedding") for item in data]
            if len(embeddings) != len(texts) or any(not isinstance(vec, list) for vec in embeddings):
                raise RuntimeError("Embedding API trả về dữ liệu không hợp lệ")
            return embeddings, model
        except urllib.error.HTTPError as exc:
            try:
                raw = exc.read().decode("utf-8", errors="replace")
            except Exception:
                raw = str(exc)
            last_error = raw[:240]
            if exc.code in {429, 500, 502, 503, 504} and attempt < 1:
                time.sleep(1.0 * (attempt + 1))
                continue
            _embedding_disabled_until = time.time() + EMBEDDING_FAILURE_COOLDOWN_SECONDS
            raise RuntimeError(last_error)
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, RuntimeError) as exc:
            last_error = str(exc)
            if attempt < 1:
                time.sleep(1.0 * (attempt + 1))
                continue
            _embedding_disabled_until = time.time() + EMBEDDING_FAILURE_COOLDOWN_SECONDS
            raise RuntimeError(last_error)
    raise RuntimeError(last_error or "Embedding API error")


def _call_gemini_embedding_api(texts: list[str]) -> tuple[list[list[float]], str]:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("Ch?a c?u h?nh GEMINI_API_KEY")

    raw_model = os.getenv("GEMINI_EMBEDDING_MODEL", "gemini-embedding-001").strip()
    model = raw_model.split("/", 1)[1] if raw_model.startswith("models/") else raw_model
    model_ref = f"models/{model}"
    endpoint = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{urllib.parse.quote(model, safe='')}:batchEmbedContents"
        f"?key={urllib.parse.quote(api_key, safe='')}"
    )
    batch_size = max(1, int(os.getenv("GEMINI_EMBEDDING_BATCH_SIZE", "16")))
    vectors: list[list[float]] = []

    for start in range(0, len(texts), batch_size):
        batch = texts[start:start + batch_size]
        payload = {
            "requests": [
                {
                    "model": model_ref,
                    "content": {"parts": [{"text": text or ""}]},
                    "taskType": "SEMANTIC_SIMILARITY",
                }
                for text in batch
            ]
        }
        req = urllib.request.Request(
            endpoint,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=8) as resp:
                body = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            try:
                raw = exc.read().decode("utf-8", errors="replace")
            except Exception:
                raw = str(exc)
            raise RuntimeError(raw[:240])
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
            raise RuntimeError(str(exc))

        embeddings = body.get("embeddings") or []
        batch_vectors = [
            item.get("values")
            for item in embeddings
            if isinstance(item, dict)
        ]
        if len(batch_vectors) != len(batch) or any(not isinstance(vec, list) for vec in batch_vectors):
            raise RuntimeError("Gemini embedding trả về dữ liệu không hợp lệ")
        vectors.extend(batch_vectors)

    if len(vectors) != len(texts):
        raise RuntimeError("Gemini embedding trả về thiếu vector")
    return vectors, f"gemini/{model}"


def _call_embedding_api_batched(texts: list[str]) -> tuple[list[list[float]], str]:
    embedding_provider = os.getenv("EMBEDDING_PROVIDER", "gemini").strip().lower()
    if os.getenv("GEMINI_API_KEY") and embedding_provider in {"", "auto", "gemini"}:
        return _call_gemini_embedding_api(texts)

    max_batch_items = max(1, int(os.getenv("EMBEDDING_BATCH_SIZE", "3")))
    max_batch_chars = max(220, int(os.getenv("EMBEDDING_BATCH_MAX_CHARS", "360")))
    batches: list[list[str]] = []
    current_batch: list[str] = []
    current_chars = 0

    for text in texts:
        text_chars = len(text or "")
        if current_batch and (
            len(current_batch) >= max_batch_items
            or current_chars + text_chars > max_batch_chars
        ):
            batches.append(current_batch)
            current_batch = []
            current_chars = 0
        current_batch.append(text)
        current_chars += text_chars

    if current_batch:
        batches.append(current_batch)

    def embed_batch(batch: list[str]) -> tuple[list[list[float]], str]:
        global _embedding_disabled_until
        try:
            return _call_embedding_api(batch)
        except RuntimeError:
            if len(batch) <= 1:
                raise
            _embedding_disabled_until = 0.0
            midpoint = max(1, len(batch) // 2)
            left_vectors, used_model = embed_batch(batch[:midpoint])
            right_vectors, used_model = embed_batch(batch[midpoint:])
            return [*left_vectors, *right_vectors], used_model

    all_vectors: list[list[float]] = []
    used_model = DEFAULT_EMBEDDING_MODEL
    for batch in batches:
        vectors, used_model = embed_batch(batch)
        all_vectors.extend(vectors)

    if len(all_vectors) != len(texts):
        raise RuntimeError("Embedding API returned fewer vectors than requested")
    return all_vectors, used_model


def _duplicate_candidate(task: models.Task, similarity: float) -> schemas.TaskDuplicateCandidate:
    return schemas.TaskDuplicateCandidate(
        id=task.id,
        title=task.title,
        description=task.description,
        similarity=round(float(similarity), 4),
        priority=task.priority,
        task_type=task.task_type,
        assignee_id=task.assignee_id,
        due_date=task.due_date,
    )


def _duplicate_response_from_scored(
    scored: list[tuple[models.Task, float]],
    threshold: float,
    method: str,
    note: str | None,
) -> schemas.TaskDuplicateCheckResponse:
    scored.sort(key=lambda item: item[1], reverse=True)
    candidates = [
        _duplicate_candidate(task, score)
        for task, score in scored[:5]
        if score >= max(0.35, threshold - 0.25)
    ]
    return schemas.TaskDuplicateCheckResponse(
        duplicate_found=bool(candidates and candidates[0].similarity >= threshold),
        threshold=threshold,
        method=method,
        candidates=candidates,
        note=note,
    )


def _duplicate_result_for_short_text(threshold: float) -> schemas.TaskDuplicateCheckResponse:
    return schemas.TaskDuplicateCheckResponse(
        duplicate_found=False,
        threshold=threshold,
        method="embedding",
        candidates=[],
        note="Nội dung task quá ngắn để so sánh trùng lặp",
    )


def _active_project_tasks(db: Session, project_id: int) -> list[models.Task]:
    return db.query(models.Task).filter(
        models.Task.project_id == project_id,
        models.Task.deleted_at.is_(None),
    ).all()


def _check_duplicate_tasks(
    db: Session,
    project_id: int,
    title: str,
    description: str | None,
    exclude_task_id: int | None = None,
) -> schemas.TaskDuplicateCheckResponse:
    threshold = float(os.getenv("TASK_DUPLICATE_THRESHOLD", DEFAULT_DUPLICATE_THRESHOLD))
    threshold = max(0.5, min(0.98, threshold))
    new_text = _task_duplicate_text(title, description)
    if len(_normalize_text(new_text)) < 4:
        return schemas.TaskDuplicateCheckResponse(
            duplicate_found=False,
            threshold=threshold,
            method="embedding",
            candidates=[],
            note="Nội dung task quá ngắn để so sánh trùng lặp",
        )

    tasks = db.query(models.Task).filter(
        models.Task.project_id == project_id,
        models.Task.deleted_at.is_(None),
    ).all()
    if exclude_task_id:
        tasks = [task for task in tasks if task.id != exclude_task_id]
    if not tasks:
        return schemas.TaskDuplicateCheckResponse(
            duplicate_found=False,
            threshold=threshold,
            method="embedding",
            candidates=[],
        )

    task_texts = [_task_duplicate_text(task.title, task.description) for task in tasks]
    lexical_scores = [
        _lexical_similarity(title, description, task.title, task.description)
        for task in tasks
    ]
    conflicting_intents = [
        _has_conflicting_intent(new_text, task_text)
        for task_text in task_texts
    ]
    conflicting_providers = [
        _has_conflicting_provider(new_text, task_text)
        for task_text in task_texts
    ]
    conflicting_surfaces = [
        _has_conflicting_surface(new_text, task_text)
        for task_text in task_texts
    ]
    started_at = time.perf_counter()
    try:
        vectors, used_model = _call_embedding_api_batched([new_text, *task_texts])
        new_vector = vectors[0]
        scored = []
        for task, vector, lexical_score, conflicting_intent, conflicting_provider, conflicting_surface in zip(
            tasks,
            vectors[1:],
            lexical_scores,
            conflicting_intents,
            conflicting_providers,
            conflicting_surfaces,
        ):
            score = max(_cosine_similarity(new_vector, vector), lexical_score)
            if conflicting_intent:
                score = min(score, 0.72)
            if conflicting_provider:
                score = min(score, 0.74)
            if conflicting_surface:
                score = min(score, 0.78)
            scored.append((task, score))
        method = "embedding_hybrid"
        note = f"Sử dụng AI Model: {used_model}"
    except RuntimeError as exc:
        scored = [(task, score) for task, score in zip(tasks, lexical_scores)]
        method = "fallback_lexical_similarity"
        raw_error = str(exc)
        if "429" in raw_error or "quota" in raw_error.lower() or "rate" in raw_error.lower():
            note = "AI semantic đang tạm quá tải, hệ thống dùng so khớp nội bộ để tiếp tục kiểm tra."
        else:
            note = "AI semantic tạm thời không khả dụng, hệ thống dùng so khớp nội bộ để tiếp tục kiểm tra."

    scored.sort(key=lambda item: item[1], reverse=True)
    candidates = [
        _duplicate_candidate(task, score)
        for task, score in scored[:5]
        if score >= max(0.35, threshold - 0.25)
    ]
    elapsed_ms = int((time.perf_counter() - started_at) * 1000)
    best_score = round(float(candidates[0].similarity), 4) if candidates else 0.0
    safe_note = note[:180].encode("ascii", errors="backslashreplace").decode("ascii")
    _safe_terminal_print(
        "[AI EMBEDDING] "
        f"feature=duplicate-check project_id={project_id} method={method} "
        f"elapsed_ms={elapsed_ms} tasks_compared={len(tasks)} candidates={len(candidates)} "
        f"best_score={best_score} note={safe_note}"
    )
    return schemas.TaskDuplicateCheckResponse(
        duplicate_found=bool(candidates and candidates[0].similarity >= threshold),
        threshold=threshold,
        method=method,
        candidates=candidates,
        note=note,
    )


def _check_duplicate_tasks_batch(
    db: Session,
    project_id: int,
    items: list[schemas.TaskDuplicateCheckRequest],
) -> schemas.TaskDuplicateBatchCheckResponse:
    threshold = float(os.getenv("TASK_DUPLICATE_THRESHOLD", DEFAULT_DUPLICATE_THRESHOLD))
    threshold = max(0.5, min(0.98, threshold))
    all_tasks = _active_project_tasks(db, project_id)
    results: list[schemas.TaskDuplicateCheckResponse | None] = [None] * len(items)
    pending: list[tuple[int, schemas.TaskDuplicateCheckRequest, list[models.Task], str, str]] = []

    for index, item in enumerate(items):
        title = item.title.strip()
        description = item.description or ""
        new_text = _task_duplicate_text(title, description)
        if len(_normalize_text(new_text)) < 4:
            results[index] = _duplicate_result_for_short_text(threshold)
            continue

        tasks = all_tasks
        if item.exclude_task_id:
            tasks = [task for task in all_tasks if task.id != item.exclude_task_id]
        cache_key = _duplicate_cache_key(project_id, title, description, item.exclude_task_id, threshold, tasks)
        cached = _get_duplicate_cache(cache_key)
        if cached:
            results[index] = cached
            continue
        if not tasks:
            response = schemas.TaskDuplicateCheckResponse(
                duplicate_found=False,
                threshold=threshold,
                method="embedding",
                candidates=[],
            )
            _set_duplicate_cache(cache_key, response)
            results[index] = response
            continue
        pending.append((index, item, tasks, new_text, cache_key))

    if pending:
        unique_tasks_by_id = {task.id: task for _, _, tasks, _, _ in pending for task in tasks}
        unique_tasks = list(unique_tasks_by_id.values())
        new_texts = [new_text for _, _, _, new_text, _ in pending]
        started_at = time.perf_counter()
        try:
            stored_task_vectors, missing_tasks = _load_stored_task_vectors(db, unique_tasks)
            missing_task_texts = [_task_duplicate_text(task.title, task.description) for task in missing_tasks]
            vectors, used_model = _call_embedding_api_batched([*new_texts, *missing_task_texts])
            new_vectors = vectors[:len(new_texts)]
            task_vectors = dict(stored_task_vectors)
            for task, vector in zip(missing_tasks, vectors[len(new_texts):]):
                task_vectors[task.id] = vector
                _store_task_embedding(
                    db,
                    task,
                    used_model,
                    _task_text_hash(_task_duplicate_text(task.title, task.description)),
                    vector,
                )
            if missing_tasks:
                db.commit()
            method = "embedding_hybrid"
            note = f"Sử dụng AI Model: {used_model}"
            for pending_pos, (index, item, tasks, new_text, cache_key) in enumerate(pending):
                scored: list[tuple[models.Task, float]] = []
                for task in tasks:
                    task_text = _task_duplicate_text(task.title, task.description)
                    lexical_score = _lexical_similarity(item.title, item.description, task.title, task.description)
                    score = max(_cosine_similarity(new_vectors[pending_pos], task_vectors[task.id]), lexical_score)
                    if _has_conflicting_intent(new_text, task_text):
                        score = min(score, 0.72)
                    if _has_conflicting_provider(new_text, task_text):
                        score = min(score, 0.74)
                    if _has_conflicting_surface(new_text, task_text):
                        score = min(score, 0.78)
                    scored.append((task, score))
                response = _duplicate_response_from_scored(scored, threshold, method, note)
                _set_duplicate_cache(cache_key, response)
                results[index] = response
        except RuntimeError as exc:
            method = "fallback_lexical_similarity"
            raw_error = str(exc)
            if "429" in raw_error or "quota" in raw_error.lower() or "rate" in raw_error.lower():
                note = "AI semantic đang tạm quá tải, hệ thống dùng so khớp nội bộ để tiếp tục kiểm tra."
            else:
                note = "AI semantic tạm thời không khả dụng, hệ thống dùng so khớp nội bộ để tiếp tục kiểm tra."
            for index, item, tasks, _, cache_key in pending:
                scored = [
                    (task, _lexical_similarity(item.title, item.description, task.title, task.description))
                    for task in tasks
                ]
                response = _duplicate_response_from_scored(scored, threshold, method, note)
                _set_duplicate_cache(cache_key, response)
                results[index] = response

        elapsed_ms = int((time.perf_counter() - started_at) * 1000)
        duplicate_count = sum(1 for result in results if result and result.duplicate_found)
        _safe_terminal_print(
            "[AI EMBEDDING] "
            f"feature=duplicate-check-batch project_id={project_id} method=batch "
            f"elapsed_ms={elapsed_ms} drafts_checked={len(items)} tasks_compared={len(unique_tasks)} "
            f"duplicates={duplicate_count}"
        )

    return schemas.TaskDuplicateBatchCheckResponse(
        items=[result for result in results if result is not None]
    )


@router.post("/projects/{project_id}/tasks", response_model=schemas.TaskResponse)
def create_task(
    project_id: int,
    data: schemas.TaskCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.require_project_member)
):
    """(Thành viên) Tạo Task mới trong project"""
    if data.project_id != project_id:
        raise HTTPException(status_code=400, detail="Path project_id and body project_id mismatch")
    return crud_task.create_task(db, data, reporter_id=current_user.id)


@router.get("/projects/{project_id}/tasks", response_model=List[schemas.TaskResponse])
def get_tasks(
    project_id: int,
    priority: Optional[str] = Query(None, description="Lọc theo priority"),
    assignee_id: Optional[int] = Query(None, description="Lọc theo người được giao"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.require_project_member)
):
    """(Thành viên) Lấy danh sách Task, hỗ trợ filter"""
    return crud_task.get_tasks(db, project_id, priority=priority, assignee_id=assignee_id)


@router.post("/projects/{project_id}/tasks/check-duplicate", response_model=schemas.TaskDuplicateCheckResponse)
def check_task_duplicate(
    project_id: int,
    data: schemas.TaskDuplicateCheckRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.require_project_member)
):
    """Kiểm tra task mới có gần trùng task cũ trong cùng project hay không."""
    if not data.title.strip():
        raise HTTPException(status_code=400, detail="Tiêu đề task không được để trống")
    enforce_ai_quota(current_user.id, current_user.role, "duplicate-check", project_id)
    return _check_duplicate_tasks_batch(
        db,
        project_id,
        [
            schemas.TaskDuplicateCheckRequest(
                title=data.title.strip(),
                description=data.description,
                exclude_task_id=data.exclude_task_id,
            )
        ],
    ).items[0]


@router.post("/projects/{project_id}/tasks/check-duplicate-batch", response_model=schemas.TaskDuplicateBatchCheckResponse)
def check_task_duplicate_batch(
    project_id: int,
    data: schemas.TaskDuplicateBatchCheckRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.require_project_member)
):
    """Kiểm tra trùng cho nhiều task nháp trong một lần gọi."""
    items: list[schemas.TaskDuplicateCheckRequest] = []
    for item in data.items:
        if not item.title.strip():
            raise HTTPException(status_code=400, detail="Tiêu đề task không được để trống")
        items.append(
            schemas.TaskDuplicateCheckRequest(
                title=item.title.strip(),
                description=item.description,
                exclude_task_id=item.exclude_task_id,
            )
        )
    enforce_ai_quota(current_user.id, current_user.role, "duplicate-check", project_id)
    return _check_duplicate_tasks_batch(db, project_id, items)


@router.put("/projects/{project_id}/tasks/{task_id}/move", response_model=schemas.TaskResponse)
def move_task(
    project_id: int,
    task_id: int,
    new_column_id: int = Query(..., description="ID cột đích"),
    expected_updated_at: Optional[datetime] = Query(None, description="Task updated_at seen by the client"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.require_project_member)
):
    """(Thành viên) Kéo thả Task sang cột khác trên Kanban"""
    task = crud_task.get_task_or_404(db, task_id, project_id)
    return crud_task.move_task(
        db,
        task,
        new_column_id,
        user_id=current_user.id,
        expected_updated_at=expected_updated_at,
    )


@router.put("/projects/{project_id}/tasks/{task_id}", response_model=schemas.TaskResponse)
def update_task(
    project_id: int,
    task_id: int,
    data: schemas.TaskUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.require_project_member)
):
    """(Thành viên) Cập nhật chi tiết Task"""
    task = crud_task.get_task_or_404(db, task_id, project_id)
    return crud_task.update_task(db, task, data, user_id=current_user.id)


@router.get("/projects/{project_id}/tasks/{task_id}/checklist", response_model=List[schemas.TaskChecklistItemResponse])
def get_task_checklist(
    project_id: int,
    task_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.require_project_member)
):
    """(Thành viên) Lấy danh sách checklist của task"""
    task = crud_task.get_task_or_404(db, task_id, project_id)
    return crud_task.list_checklist_items(db, task)


@router.post("/projects/{project_id}/tasks/{task_id}/checklist", response_model=schemas.TaskChecklistItemResponse)
def create_task_checklist_item(
    project_id: int,
    task_id: int,
    data: schemas.TaskChecklistItemCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.require_project_member)
):
    """(Thành viên) Tạo checklist item mới"""
    task = crud_task.get_task_or_404(db, task_id, project_id)
    return crud_task.create_checklist_item(db, task, data, user_id=current_user.id)


@router.put("/projects/{project_id}/tasks/{task_id}/checklist/{item_id}", response_model=schemas.TaskChecklistItemResponse)
def update_task_checklist_item(
    project_id: int,
    task_id: int,
    item_id: int,
    data: schemas.TaskChecklistItemUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.require_project_member)
):
    """(Thành viên) Cập nhật checklist item"""
    task = crud_task.get_task_or_404(db, task_id, project_id)
    item = crud_task.get_checklist_item_or_404(db, task, item_id)
    return crud_task.update_checklist_item(db, task, item, data, user_id=current_user.id)


@router.delete("/projects/{project_id}/tasks/{task_id}/checklist/{item_id}", status_code=204)
def delete_task_checklist_item(
    project_id: int,
    task_id: int,
    item_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.require_project_member)
):
    """(Thành viên) Xóa checklist item"""
    task = crud_task.get_task_or_404(db, task_id, project_id)
    item = crud_task.get_checklist_item_or_404(db, task, item_id)
    crud_task.delete_checklist_item(db, task, item, user_id=current_user.id)


@router.delete("/projects/{project_id}/tasks/{task_id}", status_code=204)
def delete_task(
    project_id: int,
    task_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.require_project_manager)
):
    """(Manager) Xóa Task"""
    task = crud_task.get_task_or_404(db, task_id, project_id)
    crud_task.delete_task(db, task, user_id=current_user.id)

@router.put("/projects/{project_id}/tasks/{task_id}/restore", response_model=schemas.TaskResponse)
def restore_task(
    project_id: int,
    task_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.require_project_manager)
):
    """(Manager) Khôi phục Task"""
    return crud_task.restore_task(db, task_id, project_id, user_id=current_user.id)
