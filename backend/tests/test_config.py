import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec

from app.core.config import Settings


def _keys() -> tuple[str, str]:
    k = ec.generate_private_key(ec.SECP256R1())
    priv = k.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8,
                           serialization.NoEncryption()).decode()
    pub = k.public_key().public_bytes(serialization.Encoding.PEM,
                                      serialization.PublicFormat.SubjectPublicKeyInfo).decode()
    return priv, pub


def test_prod_rejects_debug_otp_and_dev_secrets():
    with pytest.raises(ValueError):
        Settings(env="prod", expose_debug_otp=True)
    with pytest.raises(ValueError):
        Settings(env="prod", expose_debug_otp=False)  # sin llaves ES256


def test_prod_accepts_es256_and_builds_tls_db_url():
    priv, pub = _keys()
    s = Settings(env="prod", expose_debug_otp=False, jwt_algorithm="ES256", jwt_private_key=priv, jwt_public_key=pub,
                 pii_hash_salt="x" * 64, db_host="db.internal", db_user="neo_admin", db_password="p@ss/word")
    assert s.database_url.endswith("@db.internal:5432/neobanco?ssl=require")
    assert "p%40ss%2Fword" in s.database_url


def test_es256_tokens_roundtrip(monkeypatch):
    import uuid

    from app.core import config, security

    priv, pub = _keys()
    s = Settings(env="prod", expose_debug_otp=False, jwt_algorithm="ES256", jwt_private_key=priv,
                 jwt_public_key=pub, pii_hash_salt="y" * 64)
    monkeypatch.setattr(security, "get_settings", lambda: s)
    monkeypatch.setattr(config, "get_settings", lambda: s)
    mid = uuid.uuid4()
    assert security.decode_token(security.create_access_token(mid))["sub"] == str(mid)


def test_db_url_with_special_password_survives_alembic_config():
    """RDS genera contraseñas con símbolos; la URL codificada lleva "%" y Alembic no debe romperse."""
    from alembic.config import Config

    pwd = "a#b$c%d!e(f/g"
    s = Settings(env="dev", db_host="db.internal", db_user="neo_admin", db_password=pwd, expose_debug_otp=False)
    assert "%23" in s.database_url and s.database_url.endswith("?ssl=require")
    cfg = Config()
    cfg.set_main_option("sqlalchemy.url", s.database_url.replace("%", "%%"))
    assert cfg.get_main_option("sqlalchemy.url") == s.database_url
