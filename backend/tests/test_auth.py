import pytest

from tests.conftest import ANA, login

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def _onboarding_token(client, phone: str) -> str:
    r = await client.post("/v1/auth/otp/start", json={"phone": phone})
    assert r.status_code == 201, r.text
    body = r.json()
    r = await client.post("/v1/auth/otp/verify",
                          json={"challenge_id": body["challenge_id"], "code": body["debug_code"]})
    assert r.status_code == 200, r.text
    return r.json()["onboarding_token"]


def _register_body(token: str, cedula: str, pin: str = "730518") -> dict:
    return {
        "onboarding_token": token, "cedula": cedula, "full_name": "Sofía Brenes Quesada",
        "email": "sofia@correo.com", "province": "Heredia", "canton": "Barva",
        "kyc": {"occupation": "asalariado", "monthly_volume": "500k_1500k", "source_of_funds": "salario"},
        "pin": pin, "accept_terms": True,
    }


async def test_register_verified_gets_session_and_products(client):
    token = await _onboarding_token(client, "8700-1122")
    r = await client.post("/v1/auth/register", json=_register_body(token, "4-0123-0457"))
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["kyc_status"] == "verified"
    h = {"Authorization": f"Bearer {body['tokens']['access_token']}"}
    names = [a["name"] for a in (await client.get("/v1/accounts", headers=h)).json()["accounts"]]
    assert names == ["Colones", "Dólares", "Capital social"]
    me = (await client.get("/v1/me", headers=h)).json()
    assert me["points"] == 500 and me["phone_masked"] == "87•• ••22"


async def test_register_in_review_has_no_session_and_cannot_login(client):
    token = await _onboarding_token(client, "8700-3344")
    r = await client.post("/v1/auth/register", json=_register_body(token, "4-0123-0450"))
    assert r.status_code == 201
    assert r.json()["kyc_status"] == "in_review" and r.json()["tokens"] is None
    r = await client.post("/v1/auth/login", json={"identifier": "87003344", "pin": "730518"})
    assert r.status_code == 403 and r.json()["code"] == "kyc_pending"


async def test_one_cedula_one_account_and_weak_pin(client):
    token = await _onboarding_token(client, "8700-5566")
    r = await client.post("/v1/auth/register", json=_register_body(token, "1-1234-0567"))
    assert r.status_code == 409
    r = await client.post("/v1/auth/register", json=_register_body(token, "5-0123-0457", pin="123456"))
    assert r.status_code == 422 and r.json()["code"] == "weak_pin"


async def test_otp_wrong_code_and_resend_throttle(client):
    r = await client.post("/v1/auth/otp/start", json={"phone": "8700-7788"})
    cid = r.json()["challenge_id"]
    r = await client.post("/v1/auth/otp/verify", json={"challenge_id": cid, "code": "000000"})
    assert r.status_code == 400
    r = await client.post("/v1/auth/otp/start", json={"phone": "8700-7788"})
    assert r.status_code == 429


async def test_onboarding_token_is_not_a_session(client):
    token = await _onboarding_token(client, "8700-9900")
    r = await client.get("/v1/accounts", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 403


async def test_pin_lockout_after_five_attempts(client):
    for _ in range(5):
        r = await client.post("/v1/auth/login", json={"identifier": "61049932", "pin": "999991"})
        assert r.status_code == 401
    r = await client.post("/v1/auth/login", json={"identifier": "61049932", "pin": "482915"})
    assert r.status_code == 423


async def test_unknown_user_gets_same_error_as_bad_pin(client):
    r = await client.post("/v1/auth/login", json={"identifier": "89999999", "pin": "482915"})
    assert r.status_code == 401 and r.json()["code"] == "bad_credentials"


async def test_refresh_rotation_and_reuse_detection(client):
    r = await client.post("/v1/auth/login", json={"identifier": ANA, "pin": "482915"})
    first = r.json()["refresh_token"]
    r = await client.post("/v1/auth/refresh", json={"refresh_token": first})
    assert r.status_code == 200
    second = r.json()["refresh_token"]
    # Alguien reusa el token viejo: se revoca toda la familia, incluido el nuevo.
    assert (await client.post("/v1/auth/refresh", json={"refresh_token": first})).status_code == 401
    assert (await client.post("/v1/auth/refresh", json={"refresh_token": second})).status_code == 401


async def test_logout_revokes_refresh(client):
    r = await client.post("/v1/auth/login", json={"identifier": ANA, "pin": "482915"})
    rt = r.json()["refresh_token"]
    assert (await client.post("/v1/auth/logout", json={"refresh_token": rt})).status_code == 204
    assert (await client.post("/v1/auth/refresh", json={"refresh_token": rt})).status_code == 401


async def test_login_rate_limit(client):
    await login(client)
    codes = [(await client.post("/v1/auth/login", json={"identifier": "80000001", "pin": "111119"})).status_code
             for _ in range(25)]
    assert 429 in codes
