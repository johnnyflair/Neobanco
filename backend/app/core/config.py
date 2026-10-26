"""Configuración por variables de entorno. En AWS los secretos llegan desde Secrets Manager
como variables del contenedor; nunca se guardan en el repositorio."""

from functools import lru_cache
from typing import Literal

from pydantic import Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="NEO_", env_file=".env", extra="ignore")

    env: Literal["local", "test", "dev", "staging", "prod"] = "local"
    app_name: str = "Neobanco API"
    database_url: str = "postgresql+asyncpg://neo:neo@localhost:5432/neobanco"
    # En AWS la conexión se arma con estas piezas: la contraseña llega desde el secreto que RDS
    # rota solo, así nunca hay una URL con contraseña guardada en ningún lado.
    db_host: str | None = None
    db_name: str = "neobanco"
    db_user: str | None = None
    db_password: SecretStr | None = None
    redis_url: str | None = None

    # JWT: firma asimétrica en producción (ES256 con llave en Secrets Manager) o HS256 local.
    jwt_algorithm: Literal["HS256", "ES256"] = "HS256"
    jwt_secret: SecretStr = SecretStr("solo-para-desarrollo-local-cambiar")
    jwt_private_key: SecretStr | None = None
    jwt_public_key: str | None = None
    jwt_issuer: str = "neobanco-api"
    jwt_audience: str = "neobanco-app"
    access_token_minutes: int = 10
    refresh_token_days: int = 30

    # Protección de credenciales
    pin_max_attempts: int = 5
    pin_lock_minutes: int = 15
    otp_ttl_seconds: int = 300
    otp_resend_seconds: int = 30
    otp_max_per_hour: int = 6
    otp_max_attempts: int = 5

    # Límites de negocio por defecto (los define la cooperativa)
    pull_daily_limit_crc: int = 2_000_000
    pii_hash_salt: SecretStr = SecretStr("sal-local-para-hashes-de-auditoria")

    cors_origins: list[str] = Field(default_factory=list)
    expose_docs: bool = True
    # Solo en local/test: devuelve el código OTP en la respuesta para poder probar sin SMS.
    expose_debug_otp: bool = False

    @model_validator(mode="after")
    def _assemble_db_url(self) -> "Settings":
        if self.db_host and self.db_user and self.db_password:
            from urllib.parse import quote

            pwd = quote(self.db_password.get_secret_value(), safe="")
            self.database_url = (f"postgresql+asyncpg://{quote(self.db_user, safe='')}:{pwd}"
                                 f"@{self.db_host}:5432/{self.db_name}?ssl=require")
        return self

    @model_validator(mode="after")
    def _prod_hardening(self) -> "Settings":
        if self.env in ("staging", "prod"):
            if self.expose_debug_otp:
                raise ValueError("expose_debug_otp no se permite en staging ni prod")
            if self.jwt_algorithm != "ES256" or not self.jwt_private_key or not self.jwt_public_key:
                raise ValueError("staging y prod requieren JWT ES256 con llaves desde Secrets Manager")
            if "solo-para-desarrollo" in self.jwt_secret.get_secret_value() and self.jwt_algorithm == "HS256":
                raise ValueError("secreto JWT de desarrollo en un ambiente productivo")
            if self.pii_hash_salt.get_secret_value().startswith("sal-local"):
                raise ValueError("NEO_PII_HASH_SALT debe venir de Secrets Manager")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
