from __future__ import annotations

import json
import logging
from typing import Any, Iterable, Protocol


class RedisCacheClient(Protocol):
    def get(self, key: str | bytes) -> bytes | str | bytearray | None: ...

    def set(self, key: str | bytes, value: str, ex: int | None = None) -> Any: ...

    def scan_iter(self, match: str | bytes | None = None) -> Iterable[str | bytes]: ...

    def delete(self, *keys: str | bytes) -> int: ...

logger = logging.getLogger(__name__)


class QAResponseCache:
    def __init__(self, client: RedisCacheClient, enabled: bool, namespace: str, ttl_seconds: int):
        self.client = client
        self.enabled = enabled
        self.namespace = namespace
        if ttl_seconds <= 0:
            logger.warning("Invalid QA cache TTL (%s); using 1 second", ttl_seconds)
            ttl_seconds = 1
        self.ttl_seconds = ttl_seconds

    def _key(self, digest: str) -> str:
        return f"{self.namespace}:{digest}"

    def get(self, digest: str) -> dict[str, Any] | None:
        if not self.enabled:
            return None

        try:
            raw = self.client.get(self._key(digest))
            if not raw:
                return None
            if isinstance(raw, bytes):
                raw_value = raw.decode("utf-8")
            elif isinstance(raw, str):
                raw_value = raw
            elif isinstance(raw, bytearray):
                raw_value = raw.decode("utf-8")
            else:
                return None
            parsed = json.loads(raw_value)
            if isinstance(parsed, dict):
                return parsed
            return None
        except Exception as exc:
            self.enabled = False
            logger.warning("QA cache read failed: %s", exc)
            return None

    def set(self, digest: str, payload: dict[str, Any]) -> None:
        if not self.enabled:
            return

        try:
            self.client.set(
                self._key(digest),
                json.dumps(payload, ensure_ascii=False),
                ex=self.ttl_seconds,
            )
        except Exception as exc:
            self.enabled = False
            logger.warning("QA cache write failed: %s", exc)

    def purge_prefix(self, prefix: str) -> int:
        if not self.enabled:
            return 0

        key_prefix = self._key(prefix)
        try:
            keys: list[str] = []
            for key in self.client.scan_iter(match=f"{key_prefix}*"):
                if isinstance(key, bytes):
                    keys.append(key.decode("utf-8"))
                elif isinstance(key, str):
                    keys.append(key)
            if not keys:
                return 0
            return int(self.client.delete(*keys))
        except Exception as exc:
            self.enabled = False
            logger.warning("QA cache purge failed: %s", exc)
            return 0
