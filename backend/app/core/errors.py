"""Errores en formato RFC 9457 (problem+json) con mensajes pensados para mostrarse en la App."""

from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str, extra: dict[str, Any] | None = None) -> None:
        self.status = status
        self.code = code
        self.message = message
        self.extra = extra or {}


def not_found(what: str = "recurso") -> ApiError:
    # 404 también cuando el recurso existe pero es de otra persona: no revela su existencia.
    return ApiError(404, "not_found", f"No encontramos ese {what}.")


def _problem(request: Request, status: int, code: str, message: str, extra: dict[str, Any] | None = None):
    body = {
        "type": f"https://errors.neobanco.app/{code}",
        "title": message,
        "status": status,
        "code": code,
        "request_id": getattr(request.state, "request_id", None),
        **(extra or {}),
    }
    return JSONResponse(body, status_code=status, media_type="application/problem+json")


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def _api_error(request: Request, exc: ApiError):
        return _problem(request, exc.status, exc.code, exc.message, exc.extra)

    @app.exception_handler(RequestValidationError)
    async def _validation(request: Request, exc: RequestValidationError):
        fields = [
            {"field": ".".join(str(p) for p in e["loc"] if p != "body"), "message": e["msg"]}
            for e in exc.errors()
        ]
        return _problem(request, 422, "validation_error", "Revisá los datos enviados.", {"errors": fields})

    @app.exception_handler(StarletteHTTPException)
    async def _http(request: Request, exc: StarletteHTTPException):
        code = {401: "unauthorized", 403: "forbidden", 404: "not_found", 405: "method_not_allowed"}.get(
            exc.status_code, "http_error"
        )
        return _problem(request, exc.status_code, code, str(exc.detail))

    @app.exception_handler(Exception)
    async def _unhandled(request: Request, exc: Exception):
        import structlog

        structlog.get_logger().exception("unhandled_error")
        return _problem(request, 500, "internal_error", "Algo salió mal. Intentá de nuevo en un momento.")
