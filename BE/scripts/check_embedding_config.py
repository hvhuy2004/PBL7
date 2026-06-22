from __future__ import annotations

import os
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.routers.tasks import _call_embedding_api_batched, _cosine_similarity  # noqa: E402


def main() -> int:
    provider = os.getenv("EMBEDDING_PROVIDER", "gemini")
    model = os.getenv("GEMINI_EMBEDDING_MODEL", "gemini-embedding-001")
    print(f"Embedding provider: {provider}")
    print(f"Gemini embedding model: {model}")

    has_any_key = any(
        os.getenv(name)
        for name in ("GEMINI_API_KEY", "OPENROUTER_API_KEY", "OPENAI_API_KEY")
    )
    if not has_any_key:
        print("ERROR: Missing GEMINI_API_KEY, OPENROUTER_API_KEY or OPENAI_API_KEY.")
        return 1

    left = "kiem tra trung lich dat phong"
    right = "phat hien khung gio phong hoc bi trung truoc khi gui yeu cau"
    try:
        vectors, used_model = _call_embedding_api_batched([left, right])
    except Exception as exc:
        print(f"ERROR: Embedding call failed: {exc}")
        return 1

    score = _cosine_similarity(vectors[0], vectors[1])
    print(f"OK: embedding model={used_model}, dimensions={len(vectors[0])}, sample_score={score:.4f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
