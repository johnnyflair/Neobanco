import pytest

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def _debit(client, h):
    return next(c for c in (await client.get("/v1/cards", headers=h)).json() if c["kind"] == "debit")


async def test_lock_without_pin_unlock_with_pin(client, ana):
    d = await _debit(client, ana)
    assert (await client.post(f"/v1/cards/{d['id']}/lock", headers=ana)).json()["status"] == "locked"
    assert (await client.post(f"/v1/cards/{d['id']}/unlock", json={"pin": "999991"}, headers=ana)).status_code == 401
    r = await client.post(f"/v1/cards/{d['id']}/unlock", json={"pin": "482915"}, headers=ana)
    assert r.json()["status"] == "active"


async def test_limits_lower_free_raise_needs_pin(client, ana):
    d = await _debit(client, ana)
    lower = {"store": "100000", "online": "200000", "atm": "0"}
    r = await client.put(f"/v1/cards/{d['id']}/limits", json=lower, headers=ana)
    assert r.status_code == 200 and r.json()["limits_are_default"] is False
    raise_ = {"store": "800000", "online": "200000", "atm": "0"}
    r = await client.put(f"/v1/cards/{d['id']}/limits", json=raise_, headers=ana)
    assert r.status_code == 403 and r.json()["code"] == "step_up_required"
    r = await client.put(f"/v1/cards/{d['id']}/limits", json={**raise_, "pin": "482915"}, headers=ana)
    assert r.status_code == 200


async def test_linked_mode_only_on_debit(client, ana):
    cards = (await client.get("/v1/cards", headers=ana)).json()
    d = next(c for c in cards if c["kind"] == "debit")
    cc = next(c for c in cards if c["kind"] == "credit")
    r = await client.patch(f"/v1/cards/{d['id']}/settings", json={"linked_mode": "auto"}, headers=ana)
    assert r.json()["linked_mode"] == "auto"
    r = await client.patch(f"/v1/cards/{cc['id']}/settings", json={"linked_mode": "usd"}, headers=ana)
    assert r.status_code == 422


async def test_reveal_requires_pin(client, ana):
    d = await _debit(client, ana)
    assert (await client.post(f"/v1/cards/{d['id']}/reveal", json={"pin": "999991"}, headers=ana)).status_code == 401
    r = await client.post(f"/v1/cards/{d['id']}/reveal", json={"pin": "482915"}, headers=ana)
    assert r.status_code == 200 and r.json()["pan"].endswith(d["last4"])


async def test_installments_once(client, ana):
    cc = next(c for c in (await client.get("/v1/cards", headers=ana)).json() if c["kind"] == "credit")
    purchases = (await client.get(f"/v1/cards/{cc['id']}/purchases", headers=ana)).json()
    pid = purchases[0]["id"]
    r = await client.post(f"/v1/cards/{cc['id']}/installments", json={"purchase_id": pid, "months": 6}, headers=ana)
    assert r.status_code == 200
    r = await client.post(f"/v1/cards/{cc['id']}/installments", json={"purchase_id": pid, "months": 6}, headers=ana)
    assert r.status_code == 409


async def test_security_headers_and_problem_json(client):
    r = await client.get("/v1/accounts")
    assert r.status_code == 401
    assert r.headers["content-type"].startswith("application/problem+json")
    assert r.headers["x-content-type-options"] == "nosniff"
    assert "max-age" in r.headers["strict-transport-security"]
    assert r.headers["cache-control"] == "no-store"
    assert r.json()["request_id"] == r.headers["x-request-id"]


async def test_tampered_token_rejected(client, ana):
    token = ana["Authorization"].split()[1]
    head, body, sig = token.split(".")
    forged = f"{head}.{body}.{sig[::-1]}"
    assert (await client.get("/v1/me", headers={"Authorization": f"Bearer {forged}"})).status_code == 401


async def test_validation_errors_are_friendly(client, ana):
    r = await client.post("/v1/transfers/sinpe", json={"phone": "12", "amount": "-1"},
                          headers={**ana, "Idempotency-Key": "abcdefgh1"})
    assert r.status_code == 422 and r.json()["code"] == "validation_error" and r.json()["errors"]


async def test_health(client):
    assert (await client.get("/health/live")).json() == {"status": "ok"}
    assert (await client.get("/health/ready")).json() == {"status": "ready"}
