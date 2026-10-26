"""Logs JSON estructurados (CloudWatch) con redacción de datos sensibles."""

import logging
import re
import sys
from collections.abc import MutableMapping
from typing import Any

import structlog

SENSITIVE_KEYS = {"pin", "password", "code", "otp", "token", "access_token", "refresh_token", "authorization",
                  "cedula", "iban", "phone", "email", "pan", "cvv"}
_DIGITS = re.compile(r"\b\d{8,}\b")


def _redact(_: Any, __: str, event: MutableMapping[str, Any]) -> MutableMapping[str, Any]:
    for k in list(event.keys()):
        if k.lower() in SENSITIVE_KEYS:
            event[k] = "[redactado]"
        elif isinstance(event[k], str):
            event[k] = _DIGITS.sub("[num]", event[k])
    return event


def configure_logging(level: str = "INFO") -> None:
    logging.basicConfig(format="%(message)s", stream=sys.stdout, level=level)
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso", utc=True),
            _redact,
            structlog.processors.format_exc_info,
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(logging.getLevelName(level)),
        cache_logger_on_first_use=True,
    )
