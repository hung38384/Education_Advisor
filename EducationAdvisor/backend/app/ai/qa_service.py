"""
Internal AI QA Service

Provides a stable function for answering admission-related questions using
the existing LangGraph workflow and tools (rules + historical scores).
"""

from __future__ import annotations

import hashlib
import json
import logging
import re
import time
import unicodedata
from threading import Lock
from typing import Any, Dict, Iterable, List

from google.api_core.exceptions import ResourceExhausted
from redis import Redis

from app.ai.tools.tools import get_historical_scores, search_admission_rules
from app.core.config import settings
from app.core.redis_cache import QAResponseCache, RedisCacheClient

logger = logging.getLogger(__name__)

_GRAPH: Any | None = None
_CACHE: QAResponseCache | None = None
_CACHE_LOCK = Lock()
_CACHE_RETRY_AFTER_TS = 0.0
_CACHE_RETRY_DELAY_SECONDS = 15
_CACHE_DISABLED_BY_BOOTSTRAP_FAILURE = False


class _RedisClientAdapter:
    def __init__(self, client: Any) -> None:
        self._client = client

    def get(self, key: str | bytes) -> bytes | str | bytearray | None:
        return self._client.get(key)

    def set(self, key: str | bytes, value: str, ex: int | None = None) -> Any:
        return self._client.set(key, value, ex=ex)

    def scan_iter(self, match: str | bytes | None = None) -> Iterable[str | bytes]:
        return self._client.scan_iter(match=match)

    def delete(self, *keys: str | bytes) -> int:
        return int(self._client.delete(*keys))


class _NoopRedisClient:
    def get(self, key: str | bytes) -> None:
        return None

    def set(self, key: str | bytes, value: str, ex: int | None = None) -> bool:
        return True

    def scan_iter(self, match: str | bytes | None = None) -> list[str]:
        return []

    def delete(self, *keys: str | bytes) -> int:
        return 0


class AIQAServiceError(Exception):
    """Raised when AI QA inference fails in a controlled way."""

    def __init__(self, message: str, status_code: int = 500):
        super().__init__(message)
        self.status_code = status_code


def _load_graph() -> Any:
    global _GRAPH
    if _GRAPH is not None:
        return _GRAPH

    try:
        from app.ai.graph.workflow import get_ai_workflow

        _GRAPH = get_ai_workflow()
        return _GRAPH
    except Exception as exc:
        logger.error("Failed to initialize AI graph: %s", exc)
        raise AIQAServiceError(f"AI backend is not ready: {exc}", 503) from exc


def _get_qa_cache() -> QAResponseCache:
    global _CACHE, _CACHE_RETRY_AFTER_TS, _CACHE_DISABLED_BY_BOOTSTRAP_FAILURE

    if not settings.QA_CACHE_ENABLED:
        if (
            _CACHE is not None
            and not _CACHE.enabled
            and not _CACHE_DISABLED_BY_BOOTSTRAP_FAILURE
        ):
            return _CACHE

        with _CACHE_LOCK:
            if (
                _CACHE is not None
                and not _CACHE.enabled
                and not _CACHE_DISABLED_BY_BOOTSTRAP_FAILURE
            ):
                return _CACHE

            config_noop_client: RedisCacheClient = _NoopRedisClient()
            _CACHE = QAResponseCache(
                client=config_noop_client,
                enabled=False,
                namespace=settings.QA_CACHE_NAMESPACE,
                ttl_seconds=settings.QA_CACHE_TTL_SECONDS,
            )
            _CACHE_DISABLED_BY_BOOTSTRAP_FAILURE = False
            _CACHE_RETRY_AFTER_TS = float("inf")
            return _CACHE

    now = time.time()
    if _CACHE is not None:
        if _CACHE.enabled:
            return _CACHE
        if _CACHE_DISABLED_BY_BOOTSTRAP_FAILURE and now < _CACHE_RETRY_AFTER_TS:
            return _CACHE

    with _CACHE_LOCK:
        now = time.time()
        if _CACHE is not None:
            if _CACHE.enabled:
                return _CACHE
            if _CACHE_DISABLED_BY_BOOTSTRAP_FAILURE and now < _CACHE_RETRY_AFTER_TS:
                return _CACHE

        try:
            client = Redis.from_url(settings.REDIS_URL, decode_responses=False)
            cache_client: RedisCacheClient = _RedisClientAdapter(client)
            _CACHE = QAResponseCache(
                client=cache_client,
                enabled=True,
                namespace=settings.QA_CACHE_NAMESPACE,
                ttl_seconds=settings.QA_CACHE_TTL_SECONDS,
            )
            _CACHE_DISABLED_BY_BOOTSTRAP_FAILURE = False
            _CACHE_RETRY_AFTER_TS = 0.0
        except Exception as exc:
            logger.warning("QA cache bootstrap failed, using disabled cache: %s", exc)
            failure_noop_client: RedisCacheClient = _NoopRedisClient()
            _CACHE = QAResponseCache(
                client=failure_noop_client,
                enabled=False,
                namespace=settings.QA_CACHE_NAMESPACE,
                ttl_seconds=settings.QA_CACHE_TTL_SECONDS,
            )
            _CACHE_DISABLED_BY_BOOTSTRAP_FAILURE = True
            _CACHE_RETRY_AFTER_TS = now + _CACHE_RETRY_DELAY_SECONDS

        return _CACHE


def _mark_cache_runtime_failure(cache: QAResponseCache | None) -> None:
    global _CACHE_DISABLED_BY_BOOTSTRAP_FAILURE, _CACHE_RETRY_AFTER_TS

    with _CACHE_LOCK:
        if cache is not None:
            cache.enabled = False
        _CACHE_DISABLED_BY_BOOTSTRAP_FAILURE = True
        _CACHE_RETRY_AFTER_TS = time.time() + _CACHE_RETRY_DELAY_SECONDS


def _make_cache_safe(value: Any) -> Any:
    if value is None or isinstance(value, (str, int, float, bool)):
        return value

    if isinstance(value, dict):
        return {
            str(key): _make_cache_safe(val)
            for key, val in sorted(value.items(), key=lambda item: str(item[0]))
        }

    if isinstance(value, (list, tuple)):
        return [_make_cache_safe(item) for item in value]

    if isinstance(value, set):
        normalized_items = [_make_cache_safe(item) for item in value]
        return sorted(
            normalized_items,
            key=lambda item: json.dumps(
                item, ensure_ascii=False, sort_keys=True, separators=(",", ":")
            ),
        )

    if hasattr(value, "__dict__"):
        try:
            return {
                "__type__": f"{type(value).__module__}.{type(value).__qualname__}",
                "__dict__": _make_cache_safe(vars(value)),
            }
        except Exception:
            pass

    return {
        "__type__": f"{type(value).__module__}.{type(value).__qualname__}",
        "__value__": str(value),
    }


def _build_cache_digest(question: str, context: Dict[str, Any] | None) -> str:
    payload = {
        "question": (question or "").strip(),
        "context": context or {},
    }
    try:
        raw = json.dumps(
            payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")
        )
    except TypeError:
        safe_payload = _make_cache_safe(payload)
        raw = json.dumps(
            safe_payload,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        )
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _extract_text(content: Any) -> str:
    if isinstance(content, str):
        return content.strip()

    if isinstance(content, list):
        lines: List[str] = []
        for item in content:
            if isinstance(item, str):
                text = item.strip()
                if text:
                    lines.append(text)
            elif isinstance(item, dict):
                text = str(item.get("text", "")).strip()
                if text:
                    lines.append(text)
        return "\n".join(lines).strip()

    if isinstance(content, dict):
        return str(content.get("text", "")).strip()

    return ""


def _to_text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _build_context_block(context: Dict[str, Any] | None) -> str:
    if not context:
        return "Không có bổ sung ngữ cảnh."

    lines: List[str] = []

    profile = context.get("profile")
    if isinstance(profile, dict):
        full_name = _to_text(profile.get("fullName"))
        city = _to_text(profile.get("city"))
        target_major = _to_text(profile.get("targetMajor"))
        target_university = _to_text(profile.get("targetUniversity"))
        if full_name:
            lines.append(f"- Họ tên: {full_name}")
        if city:
            lines.append(f"- Thành phố: {city}")
        if target_major or target_university:
            lines.append(f"- Mục tiêu: {target_major} | {target_university}".strip(" |"))

    personality = context.get("personality")
    if isinstance(personality, dict):
        mbti = _to_text(personality.get("mbtiType"))
        if mbti:
            lines.append(f"- MBTI: {mbti}")

    review = context.get("review")
    if isinstance(review, dict):
        score = _to_text(review.get("overallScore"))
        summary = _to_text(review.get("summary"))
        if score:
            lines.append(f"- Điểm review gần nhất: {score}")
        if summary:
            lines.append(f"- Tổng kết review: {summary}")

    history = context.get("history")
    if isinstance(history, list):
        history_lines: List[str] = []
        for item in history[-4:]:
            if not isinstance(item, dict):
                continue
            role = _to_text(item.get("role")) or "unknown"
            message = _to_text(item.get("message"))
            if message:
                history_lines.append(f"  {role}: {message}")
        if history_lines:
            lines.append("- Lịch sử hỏi đáp gần đây:")
            lines.extend(history_lines)

    if not lines:
        return "Không có bổ sung ngữ cảnh."

    return "\n".join(lines)


def _build_prompt(question: str, context: Dict[str, Any] | None) -> str:
    context_block = _build_context_block(context)
    return (
        "Bạn là trợ lý tư vấn tuyển sinh đại học tại Việt Nam.\n"
        "Hãy ưu tiên sử dụng dữ liệu đề án tuyển sinh và điểm chuẩn lịch sử.\n"
        "Luôn trả lời bằng tiếng Việt có dấu, rõ ràng, dễ hiểu.\n"
        "Nếu thiếu dữ liệu, cần nói rõ phần nào chưa chắc chắn.\n\n"
        f"[Câu hỏi]\n{question.strip()}\n\n"
        f"[Ngữ cảnh người dùng]\n{context_block}\n"
    )


def _build_local_retrieval_answer(question: str) -> tuple[str, List[str]]:
    tools_used: List[str] = []
    parts: List[str] = [
        "Mình đang trả lời bằng chế độ truy xuất dữ liệu nội bộ vì mô hình AI chưa sẵn sàng."
    ]

    try:
        rules_text = search_admission_rules.invoke({"query": question, "top_k": 4})
        if isinstance(rules_text, str) and rules_text.strip():
            parts.append(rules_text.strip())
            tools_used.append("search_admission_rules")
    except Exception as exc:
        logger.warning("Local fallback tool search_admission_rules failed: %s", exc)

    needs_score_context = bool(
        re.search(
            r"\b(điểm|diem|score|cutoff|trúng tuyển)\b",
            question,
            flags=re.IGNORECASE,
        )
    )
    if needs_score_context:
        try:
            score_text = get_historical_scores.invoke({"query": question, "top_k": 5})
            if isinstance(score_text, str) and score_text.strip():
                parts.append(score_text.strip())
                tools_used.append("get_historical_scores")
        except Exception as exc:
            logger.warning("Local fallback tool get_historical_scores failed: %s", exc)

    parts.append(
        "Bạn có thể nêu rõ trường, năm, mã ngành hoặc phương thức xét tuyển để mình trả lời chính xác hơn."
    )

    deduped_tools = list(dict.fromkeys(tools_used))
    return "\n\n".join(parts).strip(), deduped_tools


def _strip_accents(value: str) -> str:
    normalized = unicodedata.normalize("NFD", value or "")
    without_marks = "".join(ch for ch in normalized if unicodedata.category(ch) != "Mn")
    return without_marks.replace("đ", "d").replace("Đ", "D")


def _normalize_for_match(value: str) -> str:
    return _strip_accents(value).casefold().strip()


def _needs_score_lookup(question: str) -> bool:
    normalized = _normalize_for_match(question)
    return any(
        keyword in normalized
        for keyword in [
            "diem chuan",
            "diem trung tuyen",
            "cutoff",
            "trung tuyen",
            "xet tuyen",
        ]
    )


def _score_result_has_data(score_text: str) -> bool:
    normalized = _normalize_for_match(score_text)
    if not normalized:
        return False

    failure_markers = [
        "khong lay duoc du lieu diem chuan tu mongodb",
        "khong tim thay du lieu diem chuan",
        "cau hoi trong",
        "chua the tra cuu diem chuan",
        "markdown-fallback",
        "ket qua tra cuu de an tuyen sinh",
    ]
    if any(marker in normalized for marker in failure_markers):
        return False

    if "ket qua diem chuan lich su" in normalized:
        return True

    return False


def _looks_like_uncertain_score_answer(answer_text: str) -> bool:
    normalized = _normalize_for_match(answer_text)
    markers = [
        "hien tai chua co",
        "chua co",
        "chua duoc cong bo",
        "khong co du lieu",
        "thong thuong",
    ]
    return any(marker in normalized for marker in markers)


def _derive_cache_key_version(namespace: str) -> str:
    parts = [part.strip() for part in (namespace or "").split(":") if part.strip()]
    if parts:
        tail = parts[-1]
        if re.fullmatch(r"v\d+", tail, flags=re.IGNORECASE):
            return tail.lower()
    return "v1"


def _resolve_cache_ttl_seconds(cache: Any) -> int | None:
    ttl_seconds = getattr(cache, "ttl_seconds", None)
    if isinstance(ttl_seconds, int):
        return ttl_seconds
    return None


def _build_cache_metadata(
    status: str, ttl_seconds: int | None = None
) -> Dict[str, Any]:
    resolved_ttl = settings.QA_CACHE_TTL_SECONDS if ttl_seconds is None else ttl_seconds
    if resolved_ttl <= 0:
        resolved_ttl = 1

    return {
        "layer": "ai",
        "status": status,
        "keyVersion": _derive_cache_key_version(settings.QA_CACHE_NAMESPACE),
        "ttlSeconds": resolved_ttl,
    }


def ask_admission_qa(
    question: str, context: Dict[str, Any] | None = None
) -> Dict[str, Any]:
    normalized_question = (question or "").strip()
    if not normalized_question:
        raise AIQAServiceError("Question is required", 400)

    if len(normalized_question) > 2000:
        raise AIQAServiceError("Question is too long", 400)

    cache: QAResponseCache | None = None
    try:
        cache = _get_qa_cache()
    except Exception as exc:
        logger.warning("QA cache unavailable at request time, bypassing cache: %s", exc)

    cache_status = "bypass"
    cache_enabled = bool(cache is not None and getattr(cache, "enabled", True))

    digest: str | None = None
    if cache_enabled and cache is not None:
        try:
            digest = _build_cache_digest(normalized_question, context)
        except Exception as exc:
            logger.warning("QA cache digest build failed, bypassing cache: %s", exc)
            cache_enabled = False
            cache_status = "bypass"

    cached: Any = None
    if cache_enabled and cache is not None and digest is not None:
        try:
            cached = cache.get(digest)
        except Exception as exc:
            logger.warning("QA cache read failed, bypassing read: %s", exc)
            cache_enabled = False
            cache_status = "bypass"
        else:
            if getattr(cache, "enabled", True):
                cache_status = "miss"
            else:
                _mark_cache_runtime_failure(cache)
                cache_enabled = False
                cache_status = "bypass"

    if isinstance(cached, dict) and isinstance(cached.get("answer"), str):
        cached_metadata = cached.get("metadata")
        if isinstance(cached_metadata, dict):
            cached_metadata = dict(cached_metadata)
        else:
            cached_metadata = {}
        cached_metadata["cache"] = _build_cache_metadata(
            "hit", _resolve_cache_ttl_seconds(cache)
        )
        return {
            "answer": cached["answer"],
            "metadata": cached_metadata,
        }

    prompt = _build_prompt(normalized_question, context)
    started_at = time.perf_counter()

    graph: Any | None = None
    graph_error: AIQAServiceError | None = None
    try:
        graph = _load_graph()
    except AIQAServiceError as exc:
        graph_error = exc

    if graph is None:
        answer, fallback_tools = _build_local_retrieval_answer(normalized_question)
        latency_ms = round((time.perf_counter() - started_at) * 1000, 2)
        metadata: Dict[str, Any] = {
            "provider": "local-retrieval-fallback",
            "model": "none",
            "latencyMs": latency_ms,
            "toolsUsed": fallback_tools,
            "domain": "admission-rules-and-scores",
            "mode": "fallback-without-llm",
            "cache": _build_cache_metadata(
                cache_status, _resolve_cache_ttl_seconds(cache)
            ),
        }
        if graph_error is not None:
            metadata["unavailableReason"] = str(graph_error)

        return {
            "answer": answer,
            "metadata": metadata,
        }

    final_response = ""
    fallback_response = ""
    tools_used: List[str] = []

    try:
        events = graph.stream({"messages": [("user", prompt)]}, stream_mode="values")
        for event in events:
            messages = event.get("messages", [])
            if not messages:
                continue

            message = messages[-1]
            text = _extract_text(getattr(message, "content", ""))
            if not text:
                continue

            tool_calls = getattr(message, "tool_calls", None)
            if tool_calls:
                for call in tool_calls:
                    if isinstance(call, dict):
                        name = _to_text(call.get("name"))
                        if name:
                            tools_used.append(name)

            if type(message).__name__ == "AIMessage" and not tool_calls:
                final_response = text
            else:
                fallback_response = text

    except ResourceExhausted as exc:
        raise AIQAServiceError("AI quota exceeded, please retry later", 429) from exc
    except AIQAServiceError:
        raise
    except Exception as exc:
        logger.error("AI QA inference failed: %s", exc)
        raise AIQAServiceError("AI inference failed", 502) from exc

    answer = final_response or fallback_response
    if not answer:
        raise AIQAServiceError("AI returned empty answer", 502)

    deduped_tools = list(dict.fromkeys(tools_used))
    score_recovery_applied = False

    # Guardrail: with score/cutoff questions, run direct lookup only when model
    # did not call score tool or when answer still looks uncertain.
    if _needs_score_lookup(normalized_question):
        should_lookup = (
            "get_historical_scores" not in deduped_tools
            or _looks_like_uncertain_score_answer(answer)
        )
        if should_lookup:
            try:
                score_text = get_historical_scores.invoke(
                    {"query": normalized_question, "top_k": 5}
                )
                if isinstance(score_text, str):
                    score_text = score_text.strip()
                    if _score_result_has_data(score_text):
                        answer = (
                            "Mình đã kiểm tra dữ liệu điểm chuẩn nội bộ và tìm được kết quả sau:\n\n"
                            f"{score_text}\n\n"
                            "Nếu bạn muốn, mình có thể lọc tiếp theo mã ngành hoặc phương thức xét tuyển cụ thể."
                        )
                        deduped_tools = list(
                            dict.fromkeys([*deduped_tools, "get_historical_scores"])
                        )
                        score_recovery_applied = True
            except Exception as exc:
                logger.warning("Score guardrail lookup failed: %s", exc)

    latency_ms = round((time.perf_counter() - started_at) * 1000, 2)

    result = {
        "answer": answer,
        "metadata": {
            "provider": "langgraph",
            "model": "gemini-2.5-flash",
            "latencyMs": latency_ms,
            "toolsUsed": deduped_tools,
            "domain": "admission-rules-and-scores",
            "scoreRecoveryApplied": score_recovery_applied,
            "cache": _build_cache_metadata(
                cache_status, _resolve_cache_ttl_seconds(cache)
            ),
        },
    }
    if (
        cache_enabled
        and cache is not None
        and digest is not None
        and cache_status == "miss"
    ):
        try:
            cache.set(
                digest, {"answer": result["answer"], "metadata": result["metadata"]}
            )
            if not getattr(cache, "enabled", True):
                _mark_cache_runtime_failure(cache)
        except Exception as exc:
            _mark_cache_runtime_failure(cache)
            logger.warning("QA cache write failed, skipping write: %s", exc)
    return result
