import json
import logging
import os
import re
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, time as datetime_time, timedelta, timezone
from pathlib import Path
from threading import Lock

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from dotenv import dotenv_values, load_dotenv

from app import models, schemas
from app.core import deps
from app.core.ai_limits import enforce_ai_quota
from app.database import get_db

ENV_PATH = Path(__file__).resolve().parents[2] / ".env"
AI_USAGE_PATH = Path(__file__).resolve().parents[2] / ".ai_usage.json"
load_dotenv(ENV_PATH, override=True)

router = APIRouter(prefix="/projects", tags=["AI Assistant"])
logger = logging.getLogger(__name__)

ALLOWED_PRIORITIES = {"Low", "Medium", "High"}
ALLOWED_TASK_TYPES = {"Task", "Bug", "Feature", "Docs"}
VIETNAM_TZ = timezone(timedelta(hours=7))
DEFAULT_OPENROUTER_MODELS = [
    "openai/gpt-4.1-mini",
    "openai/gpt-4o-mini",
]
DEFAULT_OPENAI_MODEL = "gpt-4o-mini"
DEFAULT_GEMINI_MODEL = "gemini-2.5-flash-lite"
DEFAULT_GITHUB_MODELS = [
    "openai/gpt-4o",
]
DEFAULT_GITHUB_MODELS_DAILY_LIMIT = 50


def _safe_terminal_print(message: str) -> None:
    try:
        print(message, flush=True)
    except (OSError, UnicodeEncodeError):
        logger.debug("Skipped terminal print because console encoding rejected the message.")
_ai_usage_lock = Lock()


def _env(name: str, default: str | None = None) -> str | None:
    value = dotenv_values(ENV_PATH).get(name)
    if value not in (None, ""):
        return str(value)
    return os.getenv(name, default)


def _project_member_context(db: Session, project_id: int) -> list[dict]:
    project = db.query(models.Project).filter(
        models.Project.id == project_id,
        models.Project.deleted_at.is_(None),
    ).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    user_ids = {m.user_id for m in project.members}
    if project.owner_id:
        user_ids.add(project.owner_id)

    users = db.query(models.User).filter(models.User.id.in_(user_ids)).all() if user_ids else []
    role_map = {m.user_id: m.project_role for m in project.members}
    if project.owner_id:
        role_map.setdefault(project.owner_id, "manager")
    return [
        {
            "id": u.id,
            "full_name": u.full_name,
            "email": u.email,
            "project_role": role_map.get(u.id, "developer"),
        }
        for u in users
    ]


def _member_workload_context(
    db: Session,
    project_id: int,
    members: list[dict],
    now_dt: datetime,
    window_start: datetime | None = None,
    window_end: datetime | None = None,
) -> list[dict]:
    member_map = {m["id"]: dict(m) for m in members}
    for m in member_map.values():
        m.update({
            "open_tasks": 0,
            "due_this_week": 0,
            "overdue_tasks": 0,
            "estimated_hours_open": 0.0,
            "nearest_due_date": None,
            "workload_score": 0.0,
            "window_tasks": 0,
            "window_estimated_hours": 0.0,
            "busy_dates": [],
        })

    week_end = datetime.combine(
        now_dt.date() + timedelta(days=6 - now_dt.weekday()),
        datetime_time(23, 59, 59),
        tzinfo=now_dt.tzinfo,
    )
    tasks = db.query(models.Task).filter(
        models.Task.project_id == project_id,
        models.Task.deleted_at.is_(None),
        models.Task.assignee_id.in_(member_map.keys()) if member_map else False,
    ).all()

    for task in tasks:
        if task.progress_percent >= 100:
            continue
        member = member_map.get(task.assignee_id)
        if not member:
            continue
        member["open_tasks"] += 1
        if task.estimated_hours is not None:
            member["estimated_hours_open"] += float(task.estimated_hours)
        if task.due_date:
            due = task.due_date.replace(tzinfo=now_dt.tzinfo) if task.due_date.tzinfo is None else task.due_date
            if due < now_dt:
                member["overdue_tasks"] += 1
            if now_dt <= due <= week_end:
                member["due_this_week"] += 1
            if window_start and window_end and window_start <= due <= window_end:
                member["window_tasks"] += 1
                if task.estimated_hours is not None:
                    member["window_estimated_hours"] += float(task.estimated_hours)
                due_key = due.date().isoformat()
                if due_key not in member["busy_dates"]:
                    member["busy_dates"].append(due_key)
            current_nearest = member["nearest_due_date"]
            if current_nearest is None or due < current_nearest:
                member["nearest_due_date"] = due

    for member in member_map.values():
        member["workload_score"] = (
            member["open_tasks"] * 2
            + member["due_this_week"] * 3
            + member["overdue_tasks"] * 4
            + member["estimated_hours_open"]
        )
        if member["nearest_due_date"]:
            member["nearest_due_date"] = member["nearest_due_date"].isoformat()
        member["busy_dates"].sort()

    return sorted(member_map.values(), key=lambda item: (item["workload_score"], item["open_tasks"], item["id"]))


def _extract_json(text: str) -> dict:
    text = (text or "").strip()
    match = re.search(r"```(?:json)?(.*?)```", text, re.DOTALL | re.IGNORECASE)
    if match:
        text = match.group(1).strip()
    
    text = re.sub(r",\s*([\]}])", r"\1", text)
    
    try:
        parsed = json.loads(text)
        return {"tasks": parsed} if isinstance(parsed, list) else parsed
    except json.JSONDecodeError:
        object_match = re.search(r"\{.*\}", text, re.DOTALL)
        array_match = re.search(r"\[.*\]", text, re.DOTALL)
        matches = [m for m in [object_match, array_match] if m]
        if not matches:
            raise
        match = min(matches, key=lambda m: m.start())
        clean_text = match.group(0)
        clean_text = re.sub(r",\s*([\]}])", r"\1", clean_text)
        parsed = json.loads(clean_text)
        return {"tasks": parsed} if isinstance(parsed, list) else parsed


def _read_error_body(exc: urllib.error.HTTPError) -> str:
    try:
        raw = exc.read().decode("utf-8", errors="replace")
        parsed = json.loads(raw)
        message = parsed.get("error", {}).get("message") or parsed.get("message") or raw
        return str(message)
    except Exception:
        return str(exc)


def _safe_int(value) -> int:
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


def _github_daily_limit() -> int:
    return max(1, _safe_int(_env("GITHUB_MODELS_DAILY_LIMIT", str(DEFAULT_GITHUB_MODELS_DAILY_LIMIT))))


def _read_ai_usage_store() -> dict:
    if not AI_USAGE_PATH.exists():
        return {}
    try:
        with AI_USAGE_PATH.open("r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def _write_ai_usage_store(data: dict) -> None:
    try:
        with AI_USAGE_PATH.open("w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    except OSError as exc:
        logger.warning("Could not write AI usage file: %s", exc)


def _rate_limit_header_summary(headers: dict | None) -> str:
    if not headers:
        return ""
    interesting = [
        "x-ratelimit-limit",
        "x-ratelimit-remaining",
        "x-ratelimit-reset",
        "x-ms-ratelimit-remaining-requests",
        "x-ms-ratelimit-remaining-tokens",
    ]
    pairs = []
    for name in interesting:
        value = headers.get(name)
        if value:
            pairs.append(f"{name}={value}")
    return " headers=" + " ".join(pairs) if pairs else ""


def _record_ai_api_usage(
    *,
    provider_name: str,
    model: str,
    usage: dict | None,
    elapsed_ms: int,
    response_headers: dict | None = None,
) -> None:
    now_dt = datetime.now(VIETNAM_TZ)
    date_key = now_dt.date().isoformat()
    prompt_tokens = _safe_int((usage or {}).get("prompt_tokens") or (usage or {}).get("input_tokens"))
    completion_tokens = _safe_int((usage or {}).get("completion_tokens") or (usage or {}).get("output_tokens"))
    total_tokens = _safe_int((usage or {}).get("total_tokens")) or prompt_tokens + completion_tokens

    provider_key = "github_models" if provider_name.startswith("GitHub Models") else provider_name.lower().replace(" ", "_")
    with _ai_usage_lock:
        store = _read_ai_usage_store()
        today = store.setdefault(date_key, {})
        provider = today.setdefault(
            provider_key,
            {
                "requests": 0,
                "prompt_tokens": 0,
                "completion_tokens": 0,
                "total_tokens": 0,
                "models": {},
            },
        )
        provider["requests"] = _safe_int(provider.get("requests")) + 1
        provider["prompt_tokens"] = _safe_int(provider.get("prompt_tokens")) + prompt_tokens
        provider["completion_tokens"] = _safe_int(provider.get("completion_tokens")) + completion_tokens
        provider["total_tokens"] = _safe_int(provider.get("total_tokens")) + total_tokens
        models = provider.setdefault("models", {})
        model_usage = models.setdefault(
            model,
            {
                "requests": 0,
                "prompt_tokens": 0,
                "completion_tokens": 0,
                "total_tokens": 0,
            },
        )
        model_usage["requests"] = _safe_int(model_usage.get("requests")) + 1
        model_usage["prompt_tokens"] = _safe_int(model_usage.get("prompt_tokens")) + prompt_tokens
        model_usage["completion_tokens"] = _safe_int(model_usage.get("completion_tokens")) + completion_tokens
        model_usage["total_tokens"] = _safe_int(model_usage.get("total_tokens")) + total_tokens
        _write_ai_usage_store(store)

        used_today = provider["requests"]
        token_total_today = provider["total_tokens"]

    limit_text = ""
    if provider_key == "github_models":
        limit = _github_daily_limit()
        remaining = max(0, limit - used_today)
        limit_text = f" today={used_today}/{limit} remaining~={remaining}"
    else:
        limit_text = f" today={used_today}"

    header_text = _rate_limit_header_summary(response_headers)
    _safe_terminal_print(
        "[AI USAGE] "
        f"provider={provider_name} model={model} elapsed_ms={elapsed_ms}"
        f"{limit_text} tokens_request={total_tokens} tokens_today={token_total_today}"
        f" prompt_tokens={prompt_tokens} completion_tokens={completion_tokens}"
        f"{header_text}"
    )


def _post_chat_completion_json(
    *,
    endpoint: str,
    api_key: str,
    model: str,
    system_prompt: str,
    user_prompt: str,
    provider_name: str,
    extra_headers: dict | None = None,
    timeout_seconds: float | None = None,
    max_tokens: int | None = None,
) -> dict:
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": 0.1,
        "max_tokens": max_tokens or int(_env("AI_MAX_TOKENS", "500")),
        "response_format": {"type": "json_object"},
    }

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    if extra_headers:
        headers.update(extra_headers)

    last_error = None
    timeout_seconds = timeout_seconds or float(_env("AI_REQUEST_TIMEOUT_SECONDS", "10"))
    for attempt in range(2):
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(endpoint, data=data, headers=headers, method="POST")

        try:
            started_at = time.perf_counter()
            with urllib.request.urlopen(req, timeout=timeout_seconds) as resp:
                response_headers = {k.lower(): v for k, v in resp.headers.items()}
                body = json.loads(resp.read().decode("utf-8"))
            elapsed_ms = int((time.perf_counter() - started_at) * 1000)
            content = body["choices"][0]["message"]["content"]
            actual_model = body.get("model") or model
            _record_ai_api_usage(
                provider_name=provider_name,
                model=actual_model,
                usage=body.get("usage"),
                elapsed_ms=elapsed_ms,
                response_headers=response_headers,
            )
            try:
                result = _extract_json(content)
            except json.JSONDecodeError:
                logger.warning("AI invalid JSON from %s: %s", provider_name, str(content)[:600])
                if "response_format" in payload:
                    payload.pop("response_format", None)
                    payload["messages"][0]["content"] = (
                        system_prompt
                        + " Your entire response must be a single minified JSON object. "
                        + "No markdown, no explanation, no prose before or after JSON."
                    )
                    continue
                raise
            if isinstance(result, dict):
                if provider_name.startswith("OpenRouter"):
                    result["_ai_model"] = f"OpenRouter ({actual_model})"
                else:
                    result["_ai_model"] = provider_name
            return result
        except urllib.error.HTTPError as exc:
            detail = _read_error_body(exc)
            last_error = detail

            # Some routed models do not support JSON mode. Retry once with prompt-only JSON enforcement.
            if exc.code == 400 and "response_format" in detail and "response_format" in payload:
                payload.pop("response_format", None)
                continue

            if exc.code == 429:
                raise HTTPException(
                    status_code=429,
                    detail=f"{provider_name} dang bi gioi han tan suat, vui long cho vai giay roi thu lai",
                )
            raise HTTPException(status_code=502, detail=f"{provider_name} API error: {detail[:300]}")
        except urllib.error.URLError as exc:
            last_error = str(exc.reason)
            raise HTTPException(status_code=502, detail=f"Khong ket noi duoc {provider_name}: {exc.reason}")
        except TimeoutError:
            last_error = "timeout"
            raise HTTPException(status_code=504, detail=f"{provider_name} phan hoi qua lau")
        except KeyError:
            raise HTTPException(status_code=502, detail=f"{provider_name} tra ve du lieu khong dung dinh dang JSON")
        except json.JSONDecodeError:
            raise HTTPException(status_code=502, detail=f"{provider_name} tra ve du lieu khong dung dinh dang JSON")

    raise HTTPException(status_code=502, detail=f"{provider_name} API error: {last_error or 'unknown error'}")


def _post_gemini_json(
    *,
    api_key: str,
    model: str,
    system_prompt: str,
    user_prompt: str,
    timeout_seconds: float | None = None,
    max_tokens: int | None = None,
) -> dict:
    endpoint = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{urllib.parse.quote(model, safe='')}:generateContent"
        f"?key={urllib.parse.quote(api_key, safe='')}"
    )
    payload = {
        "system_instruction": {"parts": [{"text": system_prompt}]},
        "contents": [{"role": "user", "parts": [{"text": user_prompt}]}],
        "generationConfig": {
            "temperature": 0.1,
            "maxOutputTokens": max_tokens or int(_env("AI_MAX_TOKENS", "500")),
            "responseMimeType": "application/json",
        },
    }
    headers = {"Content-Type": "application/json"}

    last_error = None
    timeout_seconds = timeout_seconds or float(_env("AI_REQUEST_TIMEOUT_SECONDS", "10"))
    for attempt in range(2):
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(endpoint, data=data, headers=headers, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=timeout_seconds) as resp:
                body = json.loads(resp.read().decode("utf-8"))
            parts = body["candidates"][0]["content"].get("parts", [])
            content = "".join(part.get("text", "") for part in parts)
            try:
                result = _extract_json(content)
            except json.JSONDecodeError:
                logger.warning("AI invalid JSON from Gemini (%s): %s", model, str(content)[:600])
                if payload.get("generationConfig", {}).get("responseMimeType"):
                    payload["generationConfig"].pop("responseMimeType", None)
                    payload["system_instruction"]["parts"][0]["text"] = (
                        system_prompt
                        + " Your entire response must be a single minified JSON object. "
                        + "No markdown, no explanation, no prose before or after JSON."
                    )
                    continue
                raise
            if isinstance(result, dict):
                result["_ai_model"] = f"Gemini ({body.get('modelVersion') or model})"
            return result
        except urllib.error.HTTPError as exc:
            detail = _read_error_body(exc)
            last_error = detail
            if exc.code == 400 and "responseMimeType" in detail and payload.get("generationConfig", {}).get("responseMimeType"):
                payload["generationConfig"].pop("responseMimeType", None)
                continue
            if exc.code == 429:
                raise HTTPException(status_code=429, detail=f"Gemini ({model}) dang bi gioi han tan suat")
            raise HTTPException(status_code=502, detail=f"Gemini ({model}) API error: {detail[:300]}")
        except urllib.error.URLError as exc:
            last_error = str(exc.reason)
            raise HTTPException(status_code=502, detail=f"Khong ket noi duoc Gemini ({model}): {exc.reason}")
        except TimeoutError:
            last_error = "timeout"
            raise HTTPException(status_code=504, detail=f"Gemini ({model}) phan hoi qua lau")
        except (KeyError, json.JSONDecodeError):
            raise HTTPException(status_code=502, detail=f"Gemini ({model}) tra ve du lieu khong dung dinh dang JSON")

    raise HTTPException(status_code=502, detail=f"Gemini ({model}) API error: {last_error or 'unknown error'}")


def _post_github_models_json(
    *,
    api_key: str,
    model: str,
    system_prompt: str,
    user_prompt: str,
    timeout_seconds: float | None = None,
    max_tokens: int | None = None,
) -> dict:
    return _post_chat_completion_json(
        endpoint=_env("GITHUB_MODELS_BASE_URL", "https://models.github.ai/inference/chat/completions"),
        api_key=api_key,
        model=model,
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        provider_name=f"GitHub Models ({model})",
        timeout_seconds=timeout_seconds,
        max_tokens=max_tokens,
        extra_headers={
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": _env("GITHUB_MODELS_API_VERSION", "2026-03-10"),
        },
    )


def _split_model_list(value: str | None, fallback: list[str]) -> list[str]:
    if not value:
        return fallback
    models = [item.strip() for item in value.split(",") if item.strip()]
    return models or fallback


def _split_timeout_list(value: str | None, count: int) -> list[float]:
    default_timeout = float(_env("AI_REQUEST_TIMEOUT_SECONDS", "10"))
    if not value:
        return [default_timeout for _ in range(count)]
    parsed = []
    for item in value.split(","):
        try:
            parsed.append(float(item.strip()))
        except ValueError:
            parsed.append(default_timeout)
    if not parsed:
        parsed = [default_timeout]
    while len(parsed) < count:
        parsed.append(parsed[-1])
    return parsed[:count]


def _call_ai_json(system_prompt: str, user_prompt: str, max_tokens: int | None = None) -> dict:
    github_key = _env("GITHUB_MODELS_TOKEN") or _env("GITHUB_TOKEN")
    github_exc = None
    if github_key:
        models = _split_model_list(_env("GITHUB_MODELS_TASK_MODEL"), DEFAULT_GITHUB_MODELS)
        timeouts = _split_timeout_list(_env("GITHUB_MODELS_TASK_TIMEOUTS"), len(models))
        logger.info("AI GitHub Models configured: %s", ", ".join(models))
        for model, timeout_seconds in zip(models, timeouts):
            try:
                return _post_github_models_json(
                    api_key=github_key,
                    model=model,
                    system_prompt=system_prompt,
                    user_prompt=user_prompt,
                    timeout_seconds=timeout_seconds,
                    max_tokens=max_tokens,
                )
            except HTTPException as exc:
                github_exc = exc
                logger.warning("AI GitHub Models model %s failed: %s", model, exc.detail)
                if exc.status_code in {401, 403}:
                    raise
                if exc.status_code in {429, 502, 503, 504}:
                    continue
                raise

    gemini_key = _env("GEMINI_API_KEY")
    gemini_exc = None
    if gemini_key:
        model = _env("GEMINI_TASK_MODEL", DEFAULT_GEMINI_MODEL)
        try:
            return _post_gemini_json(
                api_key=gemini_key,
                model=model,
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                timeout_seconds=float(_env("GEMINI_TASK_TIMEOUT_SECONDS", _env("AI_REQUEST_TIMEOUT_SECONDS", "10"))),
                max_tokens=max_tokens,
            )
        except HTTPException as exc:
            gemini_exc = exc
            logger.warning("AI Gemini model %s failed: %s", model, exc.detail)

    api_key = _env("OPENAI_API_KEY")
    openai_exc = None
    if api_key:
        model = _env("OPENAI_TASK_MODEL", _env("OPENAI_MODEL", DEFAULT_OPENAI_MODEL))
        try:
            return _post_chat_completion_json(
                endpoint="https://api.openai.com/v1/chat/completions",
                api_key=api_key,
                model=model,
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                provider_name=f"OpenAI ({model})",
                timeout_seconds=float(_env("OPENAI_TASK_TIMEOUT_SECONDS", _env("AI_REQUEST_TIMEOUT_SECONDS", "10"))),
                max_tokens=max_tokens,
            )
        except HTTPException as exc:
            openai_exc = exc
            logger.warning("AI OpenAI model %s failed: %s", model, exc.detail)
            if exc.status_code in {401, 403}:
                raise

    openrouter_key = _env("OPENROUTER_API_KEY")
    if openrouter_key:
        endpoint = _env("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1/chat/completions")
        models = _split_model_list(_env("OPENROUTER_TASK_MODEL"), DEFAULT_OPENROUTER_MODELS)
        timeouts = _split_timeout_list(_env("OPENROUTER_TASK_TIMEOUTS"), len(models))
        logger.info("AI OpenRouter models configured: %s", ", ".join(models))
        last_exc = None
        for model, timeout_seconds in zip(models, timeouts):
            try:
                return _post_chat_completion_json(
                    endpoint=endpoint,
                    api_key=openrouter_key,
                    model=model,
                    system_prompt=system_prompt,
                    user_prompt=user_prompt,
                    provider_name=f"OpenRouter ({model})",
                    timeout_seconds=timeout_seconds,
                    max_tokens=max_tokens,
                    extra_headers={
                        "HTTP-Referer": _env("OPENROUTER_SITE_URL", "http://localhost:5173"),
                        "X-Title": _env("OPENROUTER_APP_NAME", "AgileAI Prompt-to-Task"),
                    },
                )
            except HTTPException as exc:
                last_exc = exc
                logger.warning("AI model %s failed: %s", model, exc.detail)
                if exc.status_code in {429, 502, 503, 504}:
                    continue
                raise
        if last_exc:
            raise last_exc

    if openai_exc:
        raise openai_exc
    if gemini_exc:
        raise gemini_exc
    if github_exc:
        raise github_exc
    raise HTTPException(
        status_code=503,
        detail="Chua cau hinh GITHUB_MODELS_TOKEN, GEMINI_API_KEY, OPENROUTER_API_KEY hoac OPENAI_API_KEY tren backend",
    )


def _parse_datetime(value):
    if not value:
        return None
    if not isinstance(value, str):
        return None
    normalized = value.replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(normalized)
    except ValueError:
        return None


def _strip_vietnamese_accents(value: str) -> str:
    normalized = unicodedata.normalize("NFD", value)
    return "".join(ch for ch in normalized if unicodedata.category(ch) != "Mn").replace("đ", "d").replace("Đ", "D")


def _infer_vietnamese_due_date(prompt: str, now: datetime) -> datetime | None:
    text = _strip_vietnamese_accents(prompt).lower()
    relative_days = [
        (r"\bngay kia\b", 2),
        (r"\bngay mai\b", 1),
        (r"\bmai\b", 1),
        (r"\bhom nay\b", 0),
    ]
    for pattern, days_ahead in relative_days:
        if re.search(pattern, text):
            target_date = now.date() + timedelta(days=days_ahead)
            return datetime.combine(target_date, datetime_time(23, 59, 59), tzinfo=now.tzinfo)

    if "tuan nay" in text and not any(token in text for token in ["thu 2", "thu hai", "thu 3", "thu ba", "thu 4", "thu tu", "thu 5", "thu nam", "thu 6", "thu sau", "thu 7", "thu bay", "chu nhat", "cn"]):
        target_date = now.date() + timedelta(days=6 - now.weekday())
        return datetime.combine(target_date, datetime_time(23, 59, 59), tzinfo=now.tzinfo)

    weekday_patterns = [
        (0, ["thu 2", "thu hai"]),
        (1, ["thu 3", "thu ba"]),
        (2, ["thu 4", "thu tu"]),
        (3, ["thu 5", "thu nam"]),
        (4, ["thu 6", "thu sau"]),
        (5, ["thu 7", "thu bay"]),
        (6, ["chu nhat", "cn"]),
    ]
    weekday = None
    for day, aliases in weekday_patterns:
        if any(alias in text for alias in aliases):
            weekday = day
            break
    if weekday is None:
        return None

    base_monday = now.date() - timedelta(days=now.weekday())
    if "tuan sau" in text:
        base_monday += timedelta(days=7)
    elif "tuan nay" not in text:
        days_ahead = (weekday - now.weekday()) % 7
        target_date = now.date() + timedelta(days=days_ahead)
        return datetime.combine(target_date, datetime_time(23, 59, 59), tzinfo=now.tzinfo)

    target_date = base_monday + timedelta(days=weekday)
    return datetime.combine(target_date, datetime_time(23, 59, 59), tzinfo=now.tzinfo)


def _has_explicit_weekday(prompt: str) -> bool:
    text = _strip_vietnamese_accents(prompt).lower()
    return any(token in text for token in [
        "thu 2", "thu hai", "thu 3", "thu ba", "thu 4", "thu tu",
        "thu 5", "thu nam", "thu 6", "thu sau", "thu 7", "thu bay",
        "chu nhat", "cn",
    ])


def _planning_window(prompt: str, now: datetime) -> tuple[datetime | None, datetime | None, str | None]:
    text = _strip_vietnamese_accents(prompt).lower()
    if "tuan sau" in text:
        start_date = now.date() + timedelta(days=7 - now.weekday())
        end_date = start_date + timedelta(days=6)
        return (
            datetime.combine(start_date, datetime_time(9, 0, 0), tzinfo=now.tzinfo),
            datetime.combine(end_date, datetime_time(23, 59, 59), tzinfo=now.tzinfo),
            "next_week",
        )
    if "tuan nay" in text:
        start_date = now.date()
        end_date = now.date() + timedelta(days=6 - now.weekday())
        return (
            datetime.combine(start_date, datetime_time(9, 0, 0), tzinfo=now.tzinfo),
            datetime.combine(end_date, datetime_time(23, 59, 59), tzinfo=now.tzinfo),
            "this_week",
        )
    return None, None, None


def _date_slots_between(start: datetime, end: datetime, count: int) -> list[datetime]:
    if count <= 0:
        return []
    available_days = max(1, (end.date() - start.date()).days + 1)
    slots = []
    for index in range(count):
        offset = min(available_days - 1, round(index * (available_days - 1) / max(1, count - 1)))
        slots.append(datetime.combine(start.date() + timedelta(days=offset), datetime_time(23, 59, 59), tzinfo=start.tzinfo))
    return slots


def _this_week_due_slots(now: datetime, count: int) -> list[datetime]:
    if count <= 0:
        return []
    today = now.date()
    sunday = today + timedelta(days=max(0, 6 - now.weekday()))
    end_date = sunday
    available_days = max(1, (end_date - today).days + 1)
    slots = []
    for index in range(count):
        offset = min(available_days - 1, round(index * (available_days - 1) / max(1, count - 1)))
        slots.append(datetime.combine(today + timedelta(days=offset), datetime_time(23, 59, 59), tzinfo=now.tzinfo))
    return slots


def _infer_priority(prompt: str) -> str | None:
    text = _strip_vietnamese_accents(prompt).lower()
    if any(word in text for word in ["uu tien cao", "priority high", "muc cao", "gap", "khan cap", "urgent"]):
        return "High"
    if any(word in text for word in ["uu tien thap", "priority low", "muc thap", "khong gap"]):
        return "Low"
    if any(word in text for word in ["uu tien trung binh", "priority medium", "muc trung binh"]):
        return "Medium"
    return None


def _infer_task_type(prompt: str) -> str | None:
    text = _strip_vietnamese_accents(prompt).lower()
    if any(word in text for word in ["bug", "loi", "sua loi", "fix loi", "dang loi", "khong dang nhap"]):
        return "Bug"
    if any(word in text for word in ["tai lieu", "document", "docs", "huong dan"]):
        return "Docs"
    if any(word in text for word in ["tinh nang", "feature", "them chuc nang", "bo sung chuc nang"]):
        return "Feature"
    return None


def _sanitize_task_type(task_type: str, text: str) -> str:
    normalized = _strip_vietnamese_accents(text).lower()
    has_bug_signal = any(word in normalized for word in ["bug", "loi", "sua loi", "fix loi", "khong hoat dong", "sai", "crash"])
    if task_type == "Bug":
        if any(word in normalized for word in ["test", "kiem thu", "qa", "test case"]) and not has_bug_signal:
            return "Task"
        if any(word in normalized for word in ["api", "frontend", "ui", "giao dien", "form", "phat trien", "xay dung", "tich hop", "thiet ke"]):
            return "Feature" if not has_bug_signal or "sua loi" not in normalized else task_type
    return task_type


def _preferred_roles_for_task(draft: schemas.AITaskParseResponse) -> list[str]:
    text = _strip_vietnamese_accents(" ".join(str(x or "") for x in [draft.title, draft.description, draft.task_type])).lower()
    if any(word in text for word in ["test", "kiem thu", "qa", "verify", "verification", "test case"]):
        return ["tester"]
    if any(word in text for word in ["api", "backend", "database", "server", "auth", "xac thuc", "dang nhap", "quen mat khau"]):
        return ["developer", "manager"]
    if any(word in text for word in ["ui", "frontend", "giao dien", "man hinh", "form"]):
        return ["developer", "manager"]
    if draft.task_type == "Docs" or any(word in text for word in ["tai lieu", "docs", "huong dan"]):
        return ["developer", "tester", "manager"]
    return []


def _coerce_int(value):
    try:
        if value is None or value == "":
            return None
        return int(value)
    except (TypeError, ValueError):
        return None


def _coerce_float(value):
    try:
        if value is None or value == "":
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _coerce_confidence(value):
    number = _coerce_float(value)
    return max(0.0, min(1.0, number)) if number is not None else None


def _to_local_datetime(value: datetime | None, tzinfo=VIETNAM_TZ) -> datetime | None:
    if not value:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=tzinfo)
    return value.astimezone(tzinfo)


def _task_summary_payload(task: models.Task, user_map: dict[int, str], column_map: dict[int, str], now_dt: datetime) -> dict:
    due = _to_local_datetime(task.due_date, now_dt.tzinfo)
    start = _to_local_datetime(task.start_date, now_dt.tzinfo)
    is_done = task.progress_percent >= 100
    overdue = bool(due and due < now_dt and not is_done)
    days_until_due = (due.date() - now_dt.date()).days if due else None
    return {
        "id": task.id,
        "title": task.title,
        "assignee": user_map.get(task.assignee_id, "Chưa giao") if task.assignee_id else "Chưa giao",
        "column": column_map.get(task.column_id, "Không rõ"),
        "priority": task.priority,
        "task_type": task.task_type,
        "progress_percent": task.progress_percent or 0,
        "estimated_hours": float(task.estimated_hours) if task.estimated_hours is not None else None,
        "start_date": start.isoformat() if start else None,
        "due_date": due.isoformat() if due else None,
        "days_until_due": days_until_due,
        "overdue": overdue,
        "checklist": f"{task.checklist_completed or 0}/{task.checklist_total or 0}",
    }


def _project_health_context(db: Session, project_id: int, now_dt: datetime) -> dict:
    project = db.query(models.Project).filter(
        models.Project.id == project_id,
        models.Project.deleted_at.is_(None),
    ).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    members = _project_member_context(db, project_id)
    member_ids = {m["id"] for m in members}
    users = db.query(models.User).filter(models.User.id.in_(member_ids)).all() if member_ids else []
    user_map = {u.id: u.full_name for u in users}

    columns = (
        db.query(models.BoardColumn)
        .join(models.Board)
        .filter(
            models.Board.project_id == project_id,
            models.BoardColumn.deleted_at.is_(None),
        )
        .all()
    )
    column_map = {c.id: c.name for c in columns}
    done_column_ids = {c.id for c in columns if c.is_done}

    tasks = db.query(models.Task).filter(
        models.Task.project_id == project_id,
        models.Task.deleted_at.is_(None),
    ).all()

    total = len(tasks)
    done_tasks = [t for t in tasks if (t.progress_percent or 0) >= 100 or t.column_id in done_column_ids]
    open_tasks = [t for t in tasks if t not in done_tasks]
    overdue_tasks = []
    due_soon_tasks = []
    high_priority_open = []
    unassigned_open = []
    type_counts = {}
    priority_counts = {"Low": 0, "Medium": 0, "High": 0}
    column_counts = {}
    member_load = {
        m["id"]: {
            "name": m["full_name"],
            "role": m["project_role"],
            "open_tasks": 0,
            "high_priority": 0,
            "overdue": 0,
            "due_soon": 0,
            "estimated_hours": 0.0,
            "workload_score": 0.0,
        }
        for m in members
    }

    for task in tasks:
        type_counts[task.task_type] = type_counts.get(task.task_type, 0) + 1
        priority_counts[task.priority] = priority_counts.get(task.priority, 0) + 1
        column_name = column_map.get(task.column_id, "Không rõ")
        column_counts[column_name] = column_counts.get(column_name, 0) + 1
        if task in done_tasks:
            continue

        due = _to_local_datetime(task.due_date, now_dt.tzinfo)
        is_overdue = bool(due and due < now_dt)
        is_due_soon = bool(due and now_dt <= due <= now_dt + timedelta(days=3))
        if is_overdue:
            overdue_tasks.append(task)
        if is_due_soon:
            due_soon_tasks.append(task)
        if task.priority == "High":
            high_priority_open.append(task)
        if not task.assignee_id:
            unassigned_open.append(task)

        load = member_load.get(task.assignee_id)
        if load:
            load["open_tasks"] += 1
            if task.priority == "High":
                load["high_priority"] += 1
            if is_overdue:
                load["overdue"] += 1
            if is_due_soon:
                load["due_soon"] += 1
            if task.estimated_hours is not None:
                load["estimated_hours"] += float(task.estimated_hours)

    for load in member_load.values():
        load["workload_score"] = (
            load["open_tasks"] * 2
            + load["high_priority"] * 3
            + load["overdue"] * 4
            + load["due_soon"] * 2
            + load["estimated_hours"] * 0.5
        )

    completion_rate = round((len(done_tasks) / total) * 100) if total else 0
    progress_values = [t.progress_percent or 0 for t in tasks]
    avg_progress = round(sum(progress_values) / len(progress_values)) if progress_values else 0
    overloaded = sorted(
        [load for load in member_load.values() if load["open_tasks"] >= 5 or load["overdue"] >= 2 or load["estimated_hours"] >= 24],
        key=lambda item: item["workload_score"],
        reverse=True,
    )

    score = 100
    score -= min(35, len(overdue_tasks) * 8)
    score -= min(20, len(high_priority_open) * 4)
    score -= min(15, len(unassigned_open) * 3)
    score -= min(15, len(overloaded) * 5)
    health_score = max(0, min(100, score))
    risk_level = "Thấp" if health_score >= 75 else "Trung bình" if health_score >= 50 else "Cao"

    important_tasks = sorted(
        open_tasks,
        key=lambda t: (
            0 if t in overdue_tasks else 1,
            {"High": 0, "Medium": 1, "Low": 2}.get(t.priority, 1),
            _to_local_datetime(t.due_date, now_dt.tzinfo) or datetime.max.replace(tzinfo=now_dt.tzinfo),
        ),
    )[:12]

    return {
        "project": {
            "id": project.id,
            "name": project.name,
            "status": project.status,
            "start_date": _to_local_datetime(project.start_date, now_dt.tzinfo).isoformat() if project.start_date else None,
            "end_date": _to_local_datetime(project.end_date, now_dt.tzinfo).isoformat() if project.end_date else None,
        },
        "metrics": {
            "total_tasks": total,
            "open_tasks": len(open_tasks),
            "done_tasks": len(done_tasks),
            "completion_rate": completion_rate,
            "average_progress": avg_progress,
            "overdue_tasks": len(overdue_tasks),
            "due_soon_tasks": len(due_soon_tasks),
            "high_priority_open": len(high_priority_open),
            "unassigned_open": len(unassigned_open),
            "health_score": health_score,
            "risk_level": risk_level,
            "column_counts": column_counts,
            "priority_counts": priority_counts,
            "type_counts": type_counts,
        },
        "members": sorted(member_load.values(), key=lambda item: item["workload_score"], reverse=True),
        "important_tasks": [_task_summary_payload(t, user_map, column_map, now_dt) for t in important_tasks],
        "overdue_tasks": [_task_summary_payload(t, user_map, column_map, now_dt) for t in overdue_tasks[:8]],
        "due_soon_tasks": [_task_summary_payload(t, user_map, column_map, now_dt) for t in due_soon_tasks[:8]],
    }


def _normalize_task_draft(
    parsed: dict,
    *,
    original_prompt: str,
    members: list[dict],
    member_ids: set[int],
    now_dt: datetime,
) -> schemas.AITaskParseResponse | None:
    if isinstance(parsed, str):
        parsed = {"title": parsed}
    if not isinstance(parsed, dict):
        return None

    title = str(
        parsed.get("title")
        or parsed.get("task_title")
        or parsed.get("task")
        or parsed.get("name")
        or parsed.get("summary")
        or ""
    ).strip()
    if not title:
        return None

    description = parsed.get("description")
    prompt_norm = _strip_vietnamese_accents(original_prompt).lower()
    title_norm = _strip_vietnamese_accents(title).lower()
    if (
        "dang ky" in prompt_norm
        and "dang nhap" in prompt_norm
        and not ("dang ky" in title_norm and "dang nhap" in title_norm)
        and any(token in prompt_norm for token in ["kiem thu", "test", "qa"])
    ):
        title = "Kiểm thử luồng đăng ký và đăng nhập"

    item_text = " ".join(str(x or "") for x in [title, description])
    context_text = " ".join(str(x or "") for x in [original_prompt, title, description])
    priority = _infer_priority(item_text) or (parsed.get("priority") if parsed.get("priority") in ALLOWED_PRIORITIES else None) or _infer_priority(original_prompt) or "Medium"
    task_type = _infer_task_type(item_text) or (parsed.get("task_type") if parsed.get("task_type") in ALLOWED_TASK_TYPES else "Task")
    task_type = _sanitize_task_type(task_type, title)

    assignee_id = _coerce_int(parsed.get("assignee_id"))
    if assignee_id not in member_ids:
        assignee_id = None

    assignee_name = None
    if assignee_id is not None:
        assignee_name = next((m["full_name"] for m in members if m["id"] == assignee_id), None)

    item_due = _infer_vietnamese_due_date(context_text, now_dt)
    prompt_due = _infer_vietnamese_due_date(original_prompt, now_dt)
    due_date = item_due or prompt_due or _parse_datetime(parsed.get("due_date"))
    start_date = _parse_datetime(parsed.get("start_date"))
    if start_date and due_date and start_date > due_date:
        start_date = None

    return schemas.AITaskParseResponse(
        title=title[:255],
        description=description,
        priority=priority,
        task_type=task_type,
        assignee_id=assignee_id,
        assignee_name=assignee_name or parsed.get("assignee_name"),
        start_date=start_date,
        due_date=due_date,
        estimated_hours=_coerce_float(parsed.get("estimated_hours")),
        confidence=_coerce_confidence(parsed.get("confidence")),
        notes=parsed.get("notes"),
    )


def _humanize_module_name(value: str) -> str:
    module = re.sub(r"\s+", " ", value or "").strip(" ,.;:")
    replacements = {
        "dang ki": "đăng ký",
        "dang ky": "đăng ký",
        "dang nhap": "đăng nhập",
        "quen mat khau": "quên mật khẩu",
        "bai viet": "bài viết",
        "nguoi dung": "người dùng",
        "san pham": "sản phẩm",
        "don hang": "đơn hàng",
    }
    return replacements.get(module, module or "chức năng")


def _fallback_module_name(prompt: str) -> str:
    text = _strip_vietnamese_accents(prompt).lower()
    module_match = re.search(r"(?:crud|module|chuc nang|tinh nang)\s+([^,.;]+)", text)
    raw_module = module_match.group(1).strip() if module_match else "chuc nang"
    for marker in [" nhu ", " gom ", " bao gom ", " voi ", " giao cho ", " deadline ", " han ", " trong tuan "]:
        raw_module = raw_module.split(marker)[0].strip()
    return _humanize_module_name(raw_module)


def _fallback_requested_items(prompt: str) -> list[str]:
    text = _strip_vietnamese_accents(prompt).lower()
    if " nhu " not in text and " gom " not in text and " bao gom " not in text:
        return []
    items_part = re.split(r"\b(?:nhu|gom|bao gom)\b", text, maxsplit=1)[1]
    for marker in [" giao cho ", " deadline ", " han ", " xong ", " trong tuan ", " tuan sau ", " tuan nay "]:
        items_part = items_part.split(marker)[0]
    items = [
        item.strip(" ,.;:")
        for item in re.split(r",|;|\s+va\s+", items_part)
        if item.strip(" ,.;:")
    ]
    return items[:8]


def _fallback_template_for_item(item: str, module: str) -> tuple[str, str, str, str, int]:
    if any(token in item for token in ["ui", "giao dien", "frontend", "form", "man hinh"]):
        return (
            f"Thiết kế giao diện {module}",
            f"Xây dựng giao diện và luồng nhập liệu cho chức năng {module}.",
            "Medium",
            "Feature",
            4,
        )
    if any(token in item for token in ["api", "backend", "server", "endpoint"]):
        return (
            f"Xây dựng API {module}",
            f"Cài đặt endpoint, validate dữ liệu và xử lý nghiệp vụ cho chức năng {module}.",
            "High",
            "Feature",
            5,
        )
    if any(token in item for token in ["test", "kiem thu", "qa"]):
        return (
            f"Kiểm thử chức năng {module}",
            f"Kiểm thử các luồng chính, lỗi nhập liệu và phân quyền của chức năng {module}.",
            "Medium",
            "Task",
            4,
        )
    if any(token in item for token in ["tai lieu", "docs", "document", "huong dan"]):
        return (
            f"Viết tài liệu {module}",
            f"Ghi lại cách sử dụng, luồng xử lý và các lưu ý của chức năng {module}.",
            "Low",
            "Docs",
            3,
        )
    return (
        f"Xử lý {item} cho {module}",
        f"Hoàn thiện hạng mục {item} thuộc chức năng {module}.",
        "Medium",
        "Task",
        4,
    )


def _fallback_backlog_drafts(
    *,
    prompt: str,
    members: list[dict],
    member_ids: set[int],
    now_dt: datetime,
) -> list[schemas.AITaskParseResponse]:
    text = _strip_vietnamese_accents(prompt).lower()
    module = _fallback_module_name(prompt)

    mentioned_ids = _mentioned_member_ids(prompt, members)
    if not mentioned_ids:
        mentioned_ids = [m["id"] for m in members if m.get("project_role") in {"developer", "manager"}]
    if not mentioned_ids:
        mentioned_ids = [m["id"] for m in members]

    explicit_items = _fallback_requested_items(prompt)
    if explicit_items:
        templates = [_fallback_template_for_item(item, module) for item in explicit_items]
    elif "crud" in text:
        templates = [
            ("Thiết kế dữ liệu và API CRUD {module}", "Xác định schema, endpoint và quy tắc validate cho CRUD {module}.", "High", "Feature", 5),
            ("Xây dựng chức năng tạo và cập nhật {module}", "Cài đặt luồng thêm mới, chỉnh sửa và kiểm tra dữ liệu đầu vào.", "High", "Feature", 6),
            ("Xây dựng danh sách, tìm kiếm và xóa {module}", "Cài đặt màn hình danh sách, lọc/tìm kiếm và xử lý xóa mềm nếu cần.", "Medium", "Feature", 5),
            ("Kiểm thử luồng CRUD {module}", "Kiểm thử các case tạo, đọc, cập nhật, xóa và phân quyền liên quan.", "Medium", "Task", 4),
        ]
    else:
        templates = [
            ("Phân tích yêu cầu {module}", "Làm rõ phạm vi, dữ liệu vào/ra và tiêu chí hoàn thành.", "Medium", "Task", 3),
            ("Xây dựng chức năng {module}", "Cài đặt luồng chính và xử lý validate cần thiết.", "High", "Feature", 6),
            ("Kiểm thử chức năng {module}", "Kiểm thử các luồng chính, lỗi nhập liệu và quyền truy cập.", "Medium", "Task", 4),
        ]

    drafts = []
    for index, (title, desc, priority, task_type, hours) in enumerate(templates):
        assignee_id = mentioned_ids[index % len(mentioned_ids)] if mentioned_ids else None
        assignee_name = next((m["full_name"] for m in members if m["id"] == assignee_id), None)
        draft = schemas.AITaskParseResponse(
            title=title.format(module=module)[:255],
            description=desc.format(module=module),
            priority=priority,
            task_type=task_type,
            assignee_id=assignee_id if assignee_id in member_ids else None,
            assignee_name=assignee_name,
            estimated_hours=hours,
            confidence=0.72,
            notes="Sinh bằng bộ dự phòng vì LLM không trả JSON hợp lệ.",
        )
        due_date = _infer_vietnamese_due_date(prompt, now_dt)
        if due_date:
            draft.due_date = due_date
        drafts.append(draft)
    return drafts


def _mentioned_member_ids(prompt: str, members: list[dict]) -> list[int]:
    text = _strip_vietnamese_accents(prompt).lower()
    phrase_matches: list[tuple[int, int, int, int]] = []
    token_matches: list[tuple[int, int, int, int]] = []

    for member in members:
        full_name = _strip_vietnamese_accents(member["full_name"]).lower()
        parts = [p for p in re.split(r"\s+", full_name) if len(p) >= 2]
        email = member["email"].lower()
        email_local = email.split("@", 1)[0]
        aliases: list[tuple[str, int]] = [
            (full_name, 100),
            (email, 100),
            (email_local, 90),
        ]
        if parts:
            aliases.append((parts[0], 85))
            if len(parts) > 1:
                aliases.append((parts[-1], 75))
                aliases.extend((part, 55) for part in parts[1:-1])

        seen_aliases = set()
        for alias, score in aliases:
            if not alias:
                continue
            if alias in seen_aliases:
                continue
            seen_aliases.add(alias)
            if "@" in alias or " " in alias:
                for match in re.finditer(re.escape(alias), text):
                    phrase_matches.append((match.start(), match.end(), score, member["id"]))
            else:
                for match in re.finditer(rf"(?<!\w){re.escape(alias)}(?!\w)", text):
                    token_matches.append((match.start(), match.end(), score, member["id"]))

    chosen: list[tuple[int, int]] = []
    high_spans: list[tuple[int, int]] = []
    for start, end in sorted({(s, e) for s, e, _, _ in phrase_matches}):
        matches = [item for item in phrase_matches if item[0] == start and item[1] == end]
        best = max(
            matches,
            key=lambda item: (
                item[2],
                0 if next((m for m in members if m["id"] == item[3]), {}).get("project_role") == "manager" else 1,
            ),
        )
        chosen.append((start, best[3]))
        high_spans.append((start, end))

    for start, end in sorted({(s, e) for s, e, _, _ in token_matches}):
        if any(span_start <= start and end <= span_end for span_start, span_end in high_spans):
            continue
        matches = [item for item in token_matches if item[0] == start and item[1] == end]
        best = max(
            matches,
            key=lambda item: (
                item[2],
                0 if next((m for m in members if m["id"] == item[3]), {}).get("project_role") == "manager" else 1,
            ),
        )
        chosen.append((start, best[3]))

    ids = []
    for _, member_id in sorted(chosen, key=lambda item: item[0]):
        if member_id not in ids:
            ids.append(member_id)
    return ids


def _looks_like_multi_member_prompt(prompt: str) -> bool:
    text = _strip_vietnamese_accents(prompt).lower()
    return " va " in f" {text} " or "," in text or "cho team" in text or "cho nhom" in text


def _looks_like_single_task_prompt(prompt: str) -> bool:
    text = _strip_vietnamese_accents(prompt).lower()
    if any(token in text for token in ["cac task", "nhieu task", "danh sach task", "phan ra", "chia task", "backlog", "crud", "module"]):
        return False
    return any(token in text for token in ["tao task", "tao mot task", "them task", "tao cong viec", "them cong viec"])


def _has_task_intent(prompt: str) -> bool:
    text = _strip_vietnamese_accents(prompt).lower()
    explicit_task_signals = ["task", "cong viec", "backlog", "sprint"]
    action_signals = [
        "tao", "them", "sua", "xoa", "kiem thu", "test", "fix", "bug", "loi", "crud",
        "thiet ke", "xay dung", "phat trien", "hoan thien", "viet", "bao cao",
        "api", "database", "frontend", "backend", "ui", "dang nhap", "dang ky",
        "deploy", "tich hop", "toi uu", "nang cap", "phan ra", "chia",
        "lam", "nhac", "hop", "gui", "review", "chuan bi", "theo doi", "cap nhat",
        "nghien cuu", "phan tich",
    ]
    return any(signal in text for signal in explicit_task_signals + action_signals)


def _semantic_title_key(title: str) -> set[str]:
    text = _strip_vietnamese_accents(title).lower()
    tokens = re.findall(r"[a-z0-9]+", text)
    stop_words = {"tao", "xay", "dung", "thuc", "hien", "viet", "cho", "chuc", "nang"}
    return {token for token in tokens if token not in stop_words}


def _is_semantic_duplicate(title: str, existing_titles: list[str]) -> bool:
    candidate = _semantic_title_key(title)
    if not candidate:
        return False
    for existing in existing_titles:
        other = _semantic_title_key(existing)
        if not other:
            continue
        similarity = len(candidate & other) / len(candidate | other)
        if similarity >= 0.65:
            return True
    return False


def _pick_single_requested_draft(
    drafts: list[schemas.AITaskParseResponse],
    prompt: str,
    members: list[dict],
) -> schemas.AITaskParseResponse:
    prompt_text = _strip_vietnamese_accents(prompt).lower()
    mentioned_ids = set(_mentioned_member_ids(prompt, members))

    def score(draft: schemas.AITaskParseResponse) -> float:
        text = _strip_vietnamese_accents(" ".join(str(x or "") for x in [draft.title, draft.description, draft.task_type])).lower()
        value = 0.0
        if draft.assignee_id in mentioned_ids:
            value += 6.0
        for keyword in ["test", "kiem thu", "qa", "loi", "bug", "api", "giao dien", "frontend", "backend", "quen mat khau", "dang nhap", "dang ky"]:
            if keyword in prompt_text and keyword in text:
                value += 2.0
        if draft.priority == _infer_priority(prompt):
            value += 1.0
        return value

    return max(drafts, key=score)


def _align_single_draft_with_prompt(
    draft: schemas.AITaskParseResponse,
    prompt: str,
) -> schemas.AITaskParseResponse:
    prompt_text = _strip_vietnamese_accents(prompt).lower()
    title_text = _strip_vietnamese_accents(draft.title).lower()
    module_name = _fallback_module_name(prompt)

    if any(word in prompt_text for word in ["test", "kiem thu", "qa"]) and not any(word in title_text for word in ["test", "kiem thu", "qa"]):
        draft.title = f"Kiểm thử chức năng {module_name}"
        draft.description = draft.description or f"Kiểm thử các luồng chính và trường hợp lỗi của chức năng {module_name}."
        draft.task_type = "Task"
        if draft.estimated_hours is None:
            draft.estimated_hours = 4
    elif any(word in prompt_text for word in ["api", "backend"]) and not any(word in title_text for word in ["api", "backend"]):
        draft.title = f"Xây dựng API cho {module_name}"
        draft.task_type = "Feature"
    elif any(word in prompt_text for word in ["ui", "giao dien", "form"]) and not any(word in title_text for word in ["ui", "giao dien", "form"]):
        draft.title = f"Thiết kế giao diện {module_name}"
        draft.task_type = "Feature"

    return draft


def _task_weight(draft: schemas.AITaskParseResponse, now_dt: datetime) -> float:
    weight = draft.estimated_hours if draft.estimated_hours is not None else 4.0
    weight += {"High": 4.0, "Medium": 2.0, "Low": 1.0}.get(draft.priority, 2.0)
    weight += {"Bug": 3.0, "Feature": 3.0, "Task": 2.0, "Docs": 1.0}.get(draft.task_type, 2.0)
    if draft.due_date:
        due = draft.due_date
        if due.tzinfo is None:
            due = due.replace(tzinfo=now_dt.tzinfo)
        days_until_due = (due.date() - now_dt.date()).days
        if days_until_due <= 1:
            weight += 3.0
        elif days_until_due <= 6:
            weight += 2.0
    return max(1.0, weight)


def _candidate_ids_for_task(
    draft: schemas.AITaskParseResponse,
    candidate_ids: list[int],
    workload_map: dict[int, dict],
) -> list[int]:
    preferred_roles = _preferred_roles_for_task(draft)
    if not preferred_roles:
        return candidate_ids
    role_matches = [
        mid for mid in candidate_ids
        if workload_map[mid].get("project_role") in preferred_roles
    ]
    return role_matches or candidate_ids


def _choose_due_slot_for_member(
    assignee_id: int,
    *,
    task_index: int,
    total_tasks: int,
    window_start: datetime | None,
    window_end: datetime | None,
    workload_map: dict[int, dict],
    used_dates_by_member: dict[int, set[str]],
) -> tuple[datetime | None, datetime | None]:
    if not window_start or not window_end:
        return None, None

    if total_tasks == 1:
        due_date = window_end.date()
        start_date = max(window_start.date(), due_date - timedelta(days=1))
        used_dates_by_member.setdefault(assignee_id, set()).add(due_date.isoformat())
        return (
            datetime.combine(start_date, datetime_time(9, 0, 0), tzinfo=window_start.tzinfo),
            datetime.combine(due_date, datetime_time(23, 59, 59), tzinfo=window_start.tzinfo),
        )

    all_slots = _date_slots_between(window_start, window_end, total_tasks)
    default_due = all_slots[min(task_index, len(all_slots) - 1)]
    busy_dates = set(workload_map.get(assignee_id, {}).get("busy_dates") or [])
    used_dates = used_dates_by_member.setdefault(assignee_id, set())

    candidate_dates = [
        window_start.date() + timedelta(days=offset)
        for offset in range((window_end.date() - window_start.date()).days + 1)
    ]
    candidate_dates.sort(key=lambda d: (
        d.isoformat() in busy_dates,
        d.isoformat() in used_dates,
        abs((d - default_due.date()).days),
        d,
    ))
    due_date = candidate_dates[0] if candidate_dates else default_due.date()
    used_dates.add(due_date.isoformat())

    start_date = max(window_start.date(), due_date - timedelta(days=1))
    return (
        datetime.combine(start_date, datetime_time(9, 0, 0), tzinfo=window_start.tzinfo),
        datetime.combine(due_date, datetime_time(23, 59, 59), tzinfo=window_start.tzinfo),
    )


def _rebalance_drafts(
    drafts: list[schemas.AITaskParseResponse],
    *,
    prompt: str,
    members: list[dict],
    workload: list[dict],
    now_dt: datetime,
) -> list[schemas.AITaskParseResponse]:
    if not drafts:
        return drafts

    mentioned_ids = _mentioned_member_ids(prompt, members)
    if len(mentioned_ids) < 2 and _looks_like_multi_member_prompt(prompt):
        mentioned_ids = []
    candidate_ids = mentioned_ids or [m["id"] for m in workload]
    candidate_ids = [mid for mid in candidate_ids if any(m["id"] == mid for m in workload)]
    if not candidate_ids:
        return drafts

    workload_map = {m["id"]: dict(m) for m in workload}
    window_start, window_end, _ = _planning_window(prompt, now_dt)
    assigned_weight = {mid: 0.0 for mid in candidate_ids}
    assigned_count = {mid: 0 for mid in candidate_ids}
    candidate_ids_by_load = sorted(
        candidate_ids,
        key=lambda mid: (
            workload_map[mid]["workload_score"],
            workload_map[mid]["open_tasks"],
            mid,
        ),
    )

    ordered_pairs = sorted(
        list(enumerate(drafts)),
        key=lambda item: _task_weight(item[1], now_dt),
        reverse=True,
    )
    chosen_by_index = {}
    mentioned_set = set(mentioned_ids)
    llm_assigned_mentioned = {
        draft.assignee_id
        for draft in drafts
        if draft.assignee_id in mentioned_set
    }
    preserve_llm_assignments = not (
        len(mentioned_ids) >= 2
        and len(drafts) >= len(mentioned_ids)
        and len(llm_assigned_mentioned) < min(len(mentioned_ids), len(drafts))
    )

    for order_index, (original_index, draft) in enumerate(ordered_pairs):
        task_weight = _task_weight(draft, now_dt)
        task_candidates = _candidate_ids_for_task(draft, candidate_ids, workload_map)

        if preserve_llm_assignments and draft.assignee_id in candidate_ids:
            chosen_id = draft.assignee_id
        elif len(candidate_ids) > 1:
            matching_by_load = [mid for mid in candidate_ids_by_load if mid in task_candidates]
            coverage_id = candidate_ids_by_load[order_index] if order_index < len(candidate_ids_by_load) else None
            if coverage_id in task_candidates and len(drafts) >= len(candidate_ids_by_load):
                chosen_id = coverage_id
            elif order_index < len(candidate_ids_by_load) and len(drafts) >= len(candidate_ids_by_load) and matching_by_load:
                chosen_id = matching_by_load[0]
            else:
                chosen_id = min(
                    task_candidates,
                    key=lambda mid: (
                        workload_map[mid]["workload_score"] + assigned_weight[mid],
                        assigned_count[mid],
                        mid,
                    ),
                )
        else:
            chosen_id = candidate_ids[0]

        chosen_by_index[original_index] = chosen_id
        assigned_weight[chosen_id] += task_weight
        assigned_count[chosen_id] += 1

    for index, draft in enumerate(drafts):
        chosen_id = chosen_by_index.get(index)
        if not chosen_id:
            continue
        member = next((m for m in members if m["id"] == chosen_id), None)
        draft.assignee_id = chosen_id
        draft.assignee_name = member["full_name"] if member else draft.assignee_name

    if window_start and window_end and not _has_explicit_weekday(prompt):
        used_dates_by_member = {}
        for index, draft in enumerate(drafts):
            start_date, due_date = _choose_due_slot_for_member(
                draft.assignee_id,
                task_index=index,
                total_tasks=len(drafts),
                window_start=window_start,
                window_end=window_end,
                workload_map=workload_map,
                used_dates_by_member=used_dates_by_member,
            )
            if start_date and due_date:
                draft.start_date = start_date
                draft.due_date = due_date
    else:
        for draft in drafts:
            if draft.due_date:
                if draft.start_date and now_dt.date() <= draft.start_date.date() <= draft.due_date.date():
                    start = draft.start_date.date()
                else:
                    start = max(now_dt.date(), draft.due_date.date() - timedelta(days=1))
                draft.start_date = datetime.combine(start, datetime_time(9, 0, 0), tzinfo=now_dt.tzinfo)

    return drafts


def _ensure_draft_schedule(
    drafts: list[schemas.AITaskParseResponse],
    *,
    prompt: str,
    workload: list[dict],
    now_dt: datetime,
) -> list[schemas.AITaskParseResponse]:
    if not drafts:
        return drafts

    prompt_due = _infer_vietnamese_due_date(prompt, now_dt)
    window_start, window_end, _ = _planning_window(prompt, now_dt)
    workload_map = {m["id"]: dict(m) for m in workload}
    used_dates_by_member: dict[int, set[str]] = {}

    for index, draft in enumerate(drafts):
        due_date = draft.due_date
        if not due_date:
            if prompt_due:
                due_date = prompt_due
            elif window_start and window_end:
                start_date, slot_due = _choose_due_slot_for_member(
                    draft.assignee_id or 0,
                    task_index=index,
                    total_tasks=len(drafts),
                    window_start=window_start,
                    window_end=window_end,
                    workload_map=workload_map,
                    used_dates_by_member=used_dates_by_member,
                )
                draft.start_date = start_date
                due_date = slot_due

        if due_date:
            if due_date.tzinfo is None:
                due_date = due_date.replace(tzinfo=now_dt.tzinfo)
            draft.due_date = due_date
            if not draft.start_date or draft.start_date > due_date:
                min_start = window_start.date() if window_start else now_dt.date()
                start = max(min_start, due_date.date() - timedelta(days=1))
                draft.start_date = datetime.combine(start, datetime_time(9, 0, 0), tzinfo=now_dt.tzinfo)

    return drafts


@router.post("/{project_id}/ai/parse-task", response_model=schemas.AITaskParseResponse)
def parse_task_prompt(
    project_id: int,
    data: schemas.AITaskParseRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.require_project_member),
):
    prompt = data.prompt.strip()
    if len(prompt) < 8:
        raise HTTPException(status_code=400, detail="Hay nhap mo ta task ro hon")
    if not _has_task_intent(prompt):
        raise HTTPException(status_code=400, detail="Mô tả chưa thể hiện một công việc cần thực hiện")

    enforce_ai_quota(current_user.id, current_user.role, "parse-task", project_id)
    members = _project_member_context(db, project_id)
    member_ids = {m["id"] for m in members}
    now_dt = datetime.now(VIETNAM_TZ)
    now = now_dt.isoformat()
    workload = _member_workload_context(db, project_id, members, now_dt)

    system_prompt = (
        "You extract Vietnamese project-management requests into one task JSON. "
        "ABSOLUTE RULE FOR TASK ORDERING: "
        "Step 1: Database/Schema/Model tasks MUST be first. "
        "Step 2: API/Backend logic tasks MUST be second. "
        "Step 3: UI/Frontend/Integration tasks MUST be third. "
        "Step 4: Testing/QA tasks MUST be last. "
        "You MUST rearrange the generated tasks to match this exact technical execution order, regardless of the order in the user's prompt. "
        "However, if a layer is not needed, just skip it. "
        "priority must be Low, Medium, or High. task_type must be Task, Bug, Feature, or Docs. "
        "Dates must be ISO 8601. Use null when unknown. "
        "Vietnamese weekday rule: 'thu 6' or 'thứ 6' means Friday, not six weeks. "
        "'tuan nay' means the current Monday-Sunday week of current_time. "
        "If no exact time is given for a due date, use 23:59:59 local time. "
        "Only use an assignee_id from the provided members; otherwise null. "
        "Use workload_summary when assigning tasks: members with lower workload_score should receive more new tasks. "
        "Avoid assigning many urgent tasks to members with many due_this_week or overdue_tasks."
    )
    user_prompt = json.dumps(
        {
            "current_time": now,
            "project_id": project_id,
            "current_user": {"id": current_user.id, "full_name": current_user.full_name},
            "members": members,
            "workload_summary": workload,
            "request": prompt,
        },
        ensure_ascii=False,
    )

    try:
        parsed = _call_ai_json(system_prompt, user_prompt)
    except HTTPException as exc:
        fallback_drafts = _fallback_backlog_drafts(
            prompt=prompt,
            members=members,
            member_ids=member_ids,
            now_dt=now_dt,
        )
        if not fallback_drafts:
            raise exc
        draft = _ensure_draft_schedule(
            [fallback_drafts[0]],
            prompt=prompt,
            workload=workload,
            now_dt=now_dt,
        )[0]
        draft.notes = f"LLM chưa trả JSON hợp lệ, hệ thống dùng bộ sinh task dự phòng: {exc.detail}"
        return draft
    if isinstance(parsed, dict) and isinstance(parsed.get("tasks"), list) and parsed["tasks"]:
        parsed = parsed["tasks"][0]
    draft = _normalize_task_draft(
        parsed,
        original_prompt=prompt,
        members=members,
        member_ids=member_ids,
        now_dt=now_dt,
    )
    if not draft:
        fallback_drafts = _fallback_backlog_drafts(
            prompt=prompt,
            members=members,
            member_ids=member_ids,
            now_dt=now_dt,
        )
        if not fallback_drafts:
            raise HTTPException(status_code=502, detail="AI chua trich xuat duoc tieu de task")
        draft = fallback_drafts[0]
        draft.notes = "AI returned an unexpected structure; the internal fallback generated this draft."
    return _ensure_draft_schedule([draft], prompt=prompt, workload=workload, now_dt=now_dt)[0]


@router.post("/{project_id}/ai/parse-tasks", response_model=schemas.AITaskBulkParseResponse)
def parse_task_backlog_prompt(
    project_id: int,
    data: schemas.AITaskParseRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.require_project_member),
):
    prompt = data.prompt.strip()
    if len(prompt) < 8:
        raise HTTPException(status_code=400, detail="Hay nhap mo ta backlog ro hon")
    if not _has_task_intent(prompt):
        raise HTTPException(status_code=400, detail="Mô tả chưa thể hiện backlog hoặc công việc cần thực hiện")

    enforce_ai_quota(current_user.id, current_user.role, "parse-tasks", project_id)
    members = _project_member_context(db, project_id)
    member_ids = {m["id"] for m in members}
    now_dt = datetime.now(VIETNAM_TZ)
    now = now_dt.isoformat()
    workload = _member_workload_context(db, project_id, members, now_dt)

    system_prompt = (
        "You convert a Vietnamese project/backlog request into practical Kanban task drafts. "
        "CRITICAL: Return ONLY valid, parseable JSON with shape {\"tasks\": [...], \"notes\": string|null}. "
        "Do NOT wrap in markdown blocks, do NOT include trailing commas, and do NOT include any text outside the JSON. "
        "Use compact JSON to keep the response short. Descriptions and notes should be concise. "
        "Each task must have keys: title, description, priority, task_type, assignee_id, "
        "assignee_name, start_date, due_date, estimated_hours, confidence, notes. "
        "Create between 1 and 8 tasks. CRITICAL: If the user explicitly lists specific components/keywords in their prompt (e.g. 'giao diện, API, kết nối, kiểm thử'), you MUST create AT LEAST ONE DISTINCT TASK for EACH component listed. DO NOT combine them into a single task. "
        "ABSOLUTE RULE FOR TASK ORDERING: "
        "Step 1: Database/Schema/Model tasks MUST be first. "
        "Step 2: API/Backend logic tasks MUST be second. "
        "Step 3: UI/Frontend/Integration tasks MUST be third. "
        "Step 4: Testing/QA tasks MUST be last. "
        "You MUST rearrange the generated tasks to match this exact technical execution order, regardless of the order in the user's prompt. "
        "However, if a layer is not needed, just skip it. "
        "If the user asks for a module/feature with a short/general prompt (e.g., 'chức năng đăng ký', 'CRUD sản phẩm'), "
        "you MUST act as a professional senior software architect. Dynamically analyze the feature and break it down into 4 to 8 highly specific, concrete engineering tasks (e.g., UI components, API endpoints, database schema, state management, security). "
        "DO NOT use a rigid template. Provide real, varied, and specific technical tasks perfectly tailored to the exact feature requested to impress technical reviewers. "
        "Always write specific, highly descriptive titles in Vietnamese instead of generic templates. "
        "Do not create vague tasks such as 'do module'; make each task actionable. "
        "priority must be Low, Medium, or High. task_type must be Task, Bug, Feature, or Docs. "
        "Dates must be ISO 8601 or null. Use 23:59:59 local time if only a due date is implied. "
        "Vietnamese weekday rule: 'thu 6' or 'thứ 6' means Friday, not six weeks. 'tuần sau' means the next week relative to current_time. Ensure you calculate dates correctly using the provided current_time. "
        "Only use an assignee_id from the provided members; otherwise null."
    )
    system_prompt = (
        "Return ONLY minified JSON: {\"tasks\":[...]}. "
        "Each task needs only: title,priority,task_type,assignee_id,estimated_hours. "
        "Do not add description, dates, notes, markdown, or extra keys. "
        "priority Low|Medium|High; task_type Task|Bug|Feature|Docs. "
        "Vietnamese request to 1-4 practical Kanban tasks. Use short Vietnamese titles. "
        "Order: database/model, API/backend, UI/frontend, integration, testing last. "
        "If prompt names UI/API/test, split them. If prompt names multiple modules joined by 'va'/'và', "
        "cover every named module in the title or create separate tasks. Assign testing to tester role. Use only member ids."
    )
    compact_members = [
        {"id": m["id"], "name": m["full_name"], "role": m.get("project_role", "developer")}
        for m in members
    ]
    user_prompt = json.dumps(
        {
            "current_time": now,
            "members": compact_members,
            "request": prompt,
        },
        ensure_ascii=False,
    )

    fallback_note = ""
    model_used = None
    try:
        parsed = _call_ai_json(system_prompt, user_prompt)
        if isinstance(parsed, dict):
            model_used = parsed.pop("_ai_model", None)
            if model_used:
                logger.info("AI parse-tasks used %s for project_id=%s", model_used, project_id)
                _safe_terminal_print(f"[AI CALL] feature=parse-tasks project_id={project_id} used_model={model_used}")
    except HTTPException as exc:
        logger.warning("AI parse-tasks fallback for project_id=%s: %s", project_id, exc.detail)
        _safe_terminal_print(f"[AI FALLBACK] feature=parse-tasks project_id={project_id} reason={str(exc.detail)[:220]}")
        model_used = "Dự phòng nội bộ"
        parsed = {
            "tasks": [
                draft.model_dump()
                for draft in _fallback_backlog_drafts(
                    prompt=prompt,
                    members=members,
                    member_ids=member_ids,
                    now_dt=now_dt,
                )
            ],
            "notes": "Mô hình phản hồi chưa ổn định, hệ thống đã dùng bộ sinh draft dự phòng.",
        }
        fallback_note = parsed["notes"]
    raw_tasks = parsed.get("tasks") if isinstance(parsed, dict) else None
    if not isinstance(raw_tasks, list):
        raw_tasks = [parsed]

    drafts = []
    seen_titles = set()
    accepted_titles = []
    for raw in raw_tasks[:8]:
        draft = _normalize_task_draft(
            raw,
            original_prompt=prompt,
            members=members,
            member_ids=member_ids,
            now_dt=now_dt,
        )
        if not draft:
            continue
        title_key = _strip_vietnamese_accents(draft.title).lower().strip()
        if title_key in seen_titles or _is_semantic_duplicate(draft.title, accepted_titles):
            continue
        seen_titles.add(title_key)
        accepted_titles.append(draft.title)
        drafts.append(draft)

    if not drafts:
        raise HTTPException(status_code=502, detail="AI chua sinh duoc task nao")

    if _looks_like_single_task_prompt(prompt) and len(drafts) > 1:
        drafts = [_align_single_draft_with_prompt(_pick_single_requested_draft(drafts, prompt, members), prompt)]

    drafts = _rebalance_drafts(
        drafts,
        prompt=prompt,
        members=members,
        workload=workload,
        now_dt=now_dt,
    )
    drafts = _ensure_draft_schedule(drafts, prompt=prompt, workload=workload, now_dt=now_dt)

    notes_content = fallback_note or (parsed.get("notes") if isinstance(parsed, dict) else None) or ""
    if not notes_content:
        notes_content = "Đã tạo draft từ mô tả. Vui lòng kiểm tra lại trước khi lưu."
    
    return schemas.AITaskBulkParseResponse(
        tasks=drafts,
        notes=notes_content,
        used_model=model_used,
    )


@router.post("/{project_id}/ai/project-summary", response_model=schemas.AIProjectSummaryResponse)
def summarize_project_status(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.require_project_member),
):
    now_dt = datetime.now(VIETNAM_TZ)
    context = _project_health_context(db, project_id, now_dt)
    metrics = context["metrics"]

    if metrics["total_tasks"] == 0:
        return schemas.AIProjectSummaryResponse(
            health_score=100,
            risk_level="Thấp",
            summary="Dự án chưa có công việc nào. Trạng thái hiện tại chưa có rủi ro vận hành, nhưng cần tạo backlog để có cơ sở theo dõi tiến độ.",
            risks=["Chưa có dữ liệu task để đánh giá tiến độ thực tế."],
            overloaded_members=[],
            priority_tasks=[],
            next_actions=["Tạo backlog ban đầu cho các module chính.", "Gán người phụ trách và deadline cho từng nhóm việc."],
            metrics=metrics,
            generated_at=now_dt,
        )

    enforce_ai_quota(current_user.id, current_user.role, "project-summary", project_id)
    system_prompt = (
        "You are an Agile project assistant for a Vietnamese IT graduation project. "
        "Analyze the provided project metrics and task list. Return only JSON with keys: "
        "health_score (0-100 integer), risk_level (Thấp|Trung bình|Cao), summary (2-3 Vietnamese sentences), "
        "risks (array of 3-5 short Vietnamese strings), overloaded_members (array of short strings), "
        "priority_tasks (array of 3-6 short strings), next_actions (array of 3-5 short Vietnamese strings). "
        "Be concrete, mention task titles or member names when useful. Do not invent tasks or people."
    )
    user_prompt = json.dumps(
        {
            "current_time": now_dt.isoformat(),
            "current_user": {"id": current_user.id, "full_name": current_user.full_name},
            "project_context": context,
        },
        ensure_ascii=False,
    )

    try:
        parsed = _call_ai_json(
            system_prompt,
            user_prompt,
            max_tokens=int(_env("AI_SUMMARY_MAX_TOKENS", "900")),
        )
        if isinstance(parsed, dict):
            model_used = parsed.pop("_ai_model", None)
            if model_used:
                logger.info("AI project-summary used %s for project_id=%s", model_used, project_id)
                _safe_terminal_print(f"[AI CALL] feature=project-summary project_id={project_id} used_model={model_used}")
    except HTTPException as exc:
        logger.warning("AI project-summary fallback for project_id=%s: %s", project_id, exc.detail)
        _safe_terminal_print(f"[AI FALLBACK] feature=project-summary project_id={project_id} reason={str(exc.detail)[:220]}")
        overdue_titles = [task["title"] for task in context.get("overdue_tasks", [])[:3]]
        due_soon_titles = [task["title"] for task in context.get("due_soon_tasks", [])[:3]]
        busy_members = [
            m for m in context.get("members", [])
            if m.get("open_tasks", 0) >= 3 or m.get("overdue", 0) > 0 or m.get("high_priority", 0) > 0
        ][:4]
        risks = []
        if metrics["overdue_tasks"]:
            risks.append(f"Có {metrics['overdue_tasks']} task quá hạn cần xử lý trước.")
        if metrics["high_priority_open"]:
            risks.append(f"Còn {metrics['high_priority_open']} task ưu tiên cao chưa hoàn thành.")
        if metrics["unassigned_open"]:
            risks.append(f"Có {metrics['unassigned_open']} task chưa được giao người phụ trách.")
        if metrics["due_soon_tasks"]:
            risks.append(f"Có {metrics['due_soon_tasks']} task sắp đến hạn trong 3 ngày tới.")
        if not risks:
            risks.append("Chưa phát hiện rủi ro lớn từ deadline và workload hiện tại.")

        priority_tasks = overdue_titles + [title for title in due_soon_titles if title not in overdue_titles]
        if not priority_tasks:
            priority_tasks = [task["title"] for task in context.get("important_tasks", [])[:4]]

        next_actions = [
            "Ưu tiên xử lý các task quá hạn và task High trước.",
            "Rà soát workload của từng thành viên trước khi giao thêm task mới.",
            "Đưa các task đã hoàn thành sang Done để số liệu tiến độ chính xác.",
        ]
        if metrics["unassigned_open"]:
            next_actions.insert(0, "Gán người phụ trách cho các task chưa giao.")

        return schemas.AIProjectSummaryResponse(
            health_score=metrics["health_score"],
            risk_level=metrics["risk_level"],
            summary=(
                f"Dự án có {metrics['open_tasks']} task đang mở, {metrics['done_tasks']} task đã hoàn thành "
                f"và tỷ lệ hoàn thành khoảng {metrics['completion_rate']}%. "
                "Hệ thống đang dùng bản tổng hợp dự phòng dựa trên dữ liệu hiện có."
            )[:900],
            risks=risks[:5],
            overloaded_members=[
                f"{m['name']}: {m['open_tasks']} task mở, {m['high_priority']} task High, {m['overdue']} task quá hạn"
                for m in busy_members
            ],
            priority_tasks=priority_tasks[:6],
            next_actions=next_actions[:5],
            metrics=metrics,
            generated_at=now_dt,
        )

    health_score = _coerce_int(parsed.get("health_score"))
    if health_score is None:
        health_score = metrics["health_score"]
    health_score = max(0, min(100, health_score))
    risk_level = parsed.get("risk_level") if parsed.get("risk_level") in {"Thấp", "Trung bình", "Cao"} else metrics["risk_level"]

    def clean_list(key: str, limit: int) -> list[str]:
        value = parsed.get(key)
        if not isinstance(value, list):
            return []
        return [str(item).strip()[:220] for item in value if str(item).strip()][:limit]

    summary = str(parsed.get("summary") or "").strip()
    if not summary:
        summary = (
            f"Dự án có {metrics['open_tasks']} task đang mở, {metrics['overdue_tasks']} task quá hạn "
            f"và tỷ lệ hoàn thành khoảng {metrics['completion_rate']}%."
        )
    return schemas.AIProjectSummaryResponse(
        health_score=health_score,
        risk_level=risk_level,
        summary=summary[:900],
        risks=clean_list("risks", 5),
        overloaded_members=clean_list("overloaded_members", 5),
        priority_tasks=clean_list("priority_tasks", 6),
        next_actions=clean_list("next_actions", 5),
        metrics=metrics,
        generated_at=now_dt,
    )
