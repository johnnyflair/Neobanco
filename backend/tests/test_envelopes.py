"""Sobres: se crean solo con el nombre y se configuran después."""

import pytest

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def test_envelope_name_only_then_configure(client, ana):
    r = await client.post("/v1/savings/envelopes", json={"name": "Marchamo"}, headers=ana)
    assert r.status_code == 201, r.text
    env = r.json()
    assert env["goal_amount"] is None and env["savings_mode"] is None

    url = f"/v1/savings/envelopes/{env['id']}/settings"
    # Monto fijo necesita meta y meses para calcular cuánto por quincena.
    bad = await client.put(url, json={"name": "Marchamo", "mode": "fixed"}, headers=ana)
    assert bad.status_code == 422 and bad.json()["code"] == "missing_goal"

    ok = await client.put(url, json={"name": "Marchamo 2027", "goal_amount": "240000", "months": 12, "mode": "fixed"},
                          headers=ana)
    assert ok.status_code == 200, ok.text
    body = ok.json()
    assert body["name"] == "Marchamo 2027" and float(body["goal_amount"]) == 240000
    assert body["savings_mode"].startswith("Monto fijo") and "10,000.00" in body["savings_mode"]

    off = await client.put(url, json={"name": "Marchamo 2027"}, headers=ana)
    assert off.json()["goal_amount"] is None and off.json()["savings_mode"] is None


async def test_envelope_settings_only_own(client, ana, carlos):
    env = (await client.post("/v1/savings/envelopes", json={"name": "Viaje"}, headers=ana)).json()
    r = await client.put(f"/v1/savings/envelopes/{env['id']}/settings", json={"name": "Mío"}, headers=carlos)
    assert r.status_code == 404
