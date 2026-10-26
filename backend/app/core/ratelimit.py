"""Límite de intentos por ventana fija. Usa Redis (ElastiCache) cuando está configurado, para que
el límite se comparta entre todas las réplicas; en local cae a memoria."""

import time
from collections import defaultdict

from fastapi import Request

from app.core.config import get_settings
from app.core.errors import ApiError
from app.core.middleware import client_ip

_memory: dict[str, tuple[int, float]] = defaultdict(lambda: (0, 0.0))
_redis = None


def _get_redis():
    global _redis
    url = get_settings().redis_url
    if url and _redis is None:
        import redis.asyncio as aioredis

        _redis = aioredis.from_url(url, socket_timeout=0.5)
    return _redis


async def hit(key: str, limit: int, window_s: int) -> None:
    r = _get_redis()
    if r is not None:
        k = f"rl:{key}:{int(time.time() // window_s)}"
        count = await r.incr(k)
        if count == 1:
            await r.expire(k, window_s)
    else:
        count, reset = _memory[key]
        now = time.time()
        if now > reset:
            count, reset = 0, now + window_s
        count += 1
        _memory[key] = (count, reset)
    if count > limit:
        raise ApiError(429, "too_many_requests", "Hiciste demasiados intentos. Esperá un momento.",
                       {"retry_after_seconds": window_s})


def limiter(name: str, limit: int, window_s: int):
    """Dependencia de FastAPI: limita por IP para el endpoint."""

    async def _dep(request: Request) -> None:
        await hit(f"{name}:{client_ip(request)}", limit, window_s)

    return _dep


def reset_memory() -> None:
    _memory.clear()
