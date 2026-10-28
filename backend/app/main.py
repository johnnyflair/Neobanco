from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import admin
from app.api.v1 import router as v1
from app.core.config import get_settings
from app.core.errors import ApiError, install_error_handlers
from app.core.logging import configure_logging
from app.core.middleware import RequestContextMiddleware
from app.db.session import dispose_engine, get_session


@asynccontextmanager
async def lifespan(_: FastAPI):
    yield
    await dispose_engine()


def create_app() -> FastAPI:
    s = get_settings()
    configure_logging("INFO" if s.env != "local" else "DEBUG")
    docs = s.expose_docs and s.env != "prod"
    app = FastAPI(
        title=s.app_name,
        version="0.1.0",
        description="API del neobanco cooperativo. Todos los montos viajan como texto decimal.",
        lifespan=lifespan,
        docs_url="/docs" if docs else None,
        redoc_url="/redoc" if docs else None,
        openapi_url="/openapi.json" if docs else None,
    )
    app.add_middleware(RequestContextMiddleware)
    if s.cors_origins:
        app.add_middleware(CORSMiddleware, allow_origins=s.cors_origins, allow_methods=["*"],
                           allow_headers=["Authorization", "Content-Type", "Idempotency-Key", "X-Request-ID"])
    install_error_handlers(app)
    app.include_router(v1)
    app.include_router(admin.router)
    app.include_router(admin.pages)

    @app.get("/health/live", tags=["Salud"], include_in_schema=False)
    async def live():
        return {"status": "ok"}

    @app.get("/health/ready", tags=["Salud"], include_in_schema=False)
    async def ready(session: AsyncSession = Depends(get_session)):
        try:
            await session.execute(text("select 1"))
        except Exception as e:
            raise ApiError(503, "not_ready", "Base de datos no disponible.") from e
        return {"status": "ready"}

    return app


app = create_app()
