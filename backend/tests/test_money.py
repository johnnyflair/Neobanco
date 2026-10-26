from decimal import Decimal

import pytest

from tests.conftest import account, idem

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def test_accounts_order_and_privacy(client, ana, carlos):
    accts = (await client.get("/v1/accounts", headers=ana)).json()["accounts"]
    assert [a["name"] for a in accts][:3] == ["Colones", "Dólares", "Capital social"]
    crc = accts[0]
    assert crc["iban_masked"].startswith("CR21 ••••")
    # Carlos no puede ver la cuenta de Ana: 404, sin revelar que existe.
    assert (await client.get(f"/v1/accounts/{crc['id']}", headers=carlos)).status_code == 404
    assert (await client.get(f"/v1/accounts/{crc['id']}/transactions", headers=carlos)).status_code == 404


async def test_transactions_pagination(client, ana):
    crc = await account(client, ana, "Colones")
    p1 = (await client.get(f"/v1/accounts/{crc['id']}/transactions?limit=5", headers=ana)).json()
    assert len(p1["items"]) == 5 and p1["next_before"]
    p2 = (await client.get(f"/v1/accounts/{crc['id']}/transactions",
                           params={"limit": 5, "before": p1["next_before"]}, headers=ana)).json()
    assert {i["id"] for i in p1["items"]}.isdisjoint({i["id"] for i in p2["items"]})


async def test_sinpe_is_idempotent(client, ana):
    crc = await account(client, ana, "Colones")
    before = Decimal(crc["balance"])
    h = {**ana, **idem()}
    body = {"from_account_id": crc["id"], "phone": "8812-4455", "amount": "5000"}
    r1 = await client.post("/v1/transfers/sinpe", json=body, headers=h)
    r2 = await client.post("/v1/transfers/sinpe", json=body, headers=h)
    assert r1.status_code == 201 and r1.json() == r2.json()
    after = Decimal((await account(client, ana, "Colones"))["balance"])
    assert before - after == Decimal("5000.00")
    # Misma llave con otro monto: conflicto, no un segundo cobro.
    r3 = await client.post("/v1/transfers/sinpe", json={**body, "amount": "6000"}, headers=h)
    assert r3.status_code == 409


async def test_sinpe_requires_idempotency_key_and_funds(client, ana):
    crc = await account(client, ana, "Colones")
    body = {"from_account_id": crc["id"], "phone": "8812-4455", "amount": "99999999"}
    assert (await client.post("/v1/transfers/sinpe", json=body, headers=ana)).status_code == 422
    r = await client.post("/v1/transfers/sinpe", json=body, headers={**ana, **idem()})
    assert r.status_code == 422 and r.json()["code"] == "insufficient_funds"


async def test_sinpe_points_monthly_cap(client, carlos):
    crc = await account(client, carlos, "Colones")
    earned = []
    for _ in range(6):
        r = await client.post("/v1/transfers/sinpe", headers={**carlos, **idem()},
                              json={"from_account_id": crc["id"], "phone": "88124455", "amount": "100"})
        earned.append(r.json()["points_earned"])
    assert sum(earned) == 20 and earned[-1] == 0


async def test_sinpe_cannot_debit_someone_elses_account(client, ana, carlos):
    crc_ana = await account(client, ana, "Colones")
    r = await client.post("/v1/transfers/sinpe", headers={**carlos, **idem()},
                          json={"from_account_id": crc_ana["id"], "phone": "88124455", "amount": "100"})
    assert r.status_code == 404


async def test_pull_from_linked_account_and_daily_limit(client, ana):
    crc = await account(client, ana, "Colones")
    linked = (await client.get("/v1/transfers/linked-accounts", headers=ana)).json()
    bac = next(x for x in linked if x["bank_name"] == "BAC Credomatic")
    r = await client.post("/v1/transfers/pull", headers={**ana, **idem()},
                          json={"to_account_id": crc["id"], "linked_account_id": bac["id"], "amount": "100000"})
    assert r.status_code == 201
    r = await client.post("/v1/transfers/pull", headers={**ana, **idem()},
                          json={"to_account_id": crc["id"], "linked_account_id": bac["id"], "amount": "1950000"})
    assert r.status_code == 422 and r.json()["code"] == "daily_limit"


async def test_pull_new_account_needs_authorization(client, ana):
    crc = await account(client, ana, "Colones")
    r = await client.post("/v1/transfers/pull", headers={**ana, **idem()},
                          json={"to_account_id": crc["id"], "new_iban": "CR05 0152 0200 1026 2840 66",
                                "amount": "1000"})
    assert r.status_code == 201 and r.json()["status"] == "pending_authorization"


async def test_bill_lookup_pay_and_save(client, ana):
    found = (await client.get("/v1/bills/providers", params={"q": "agua"})).json()
    assert any(p["id"] == "aya" for p in found)
    q = await client.post("/v1/bills/lookup", json={"provider_id": "jasec", "reference": "5550123"}, headers=ana)
    assert q.status_code == 200
    crc = await account(client, ana, "Colones")
    r = await client.post("/v1/bills/pay", headers={**ana, **idem()},
                          json={"provider_id": "jasec", "reference": "5550123", "from_account_id": crc["id"]})
    assert r.status_code == 201 and r.json()["amount"] == q.json()["amount"]
    saved = (await client.get("/v1/bills/saved", headers=ana)).json()
    assert any(s["provider_id"] == "jasec" for s in saved)


async def test_credit_card_payment_rules(client, ana):
    cards = (await client.get("/v1/cards", headers=ana)).json()
    cc = next(c for c in cards if c["kind"] == "credit")
    crc = await account(client, ana, "Colones")
    bad = await client.post(f"/v1/cards/{cc['id']}/payments", headers={**ana, **idem()},
                            json={"mode": "other", "amount": "10", "from_account_id": crc["id"]})
    assert bad.status_code == 422 and bad.json()["code"] == "bad_amount"
    ok = await client.post(f"/v1/cards/{cc['id']}/payments", headers={**ana, **idem()},
                           json={"mode": "minimum", "from_account_id": crc["id"]})
    assert ok.status_code == 201
    credit = cc["credit"]
    assert Decimal(ok.json()["new_balance"]) == Decimal(credit["balance"]) - Decimal(credit["minimum_payment"])


async def test_envelope_and_term_deposit(client, ana):
    crc = await account(client, ana, "Colones")
    env = (await client.post("/v1/savings/envelopes", headers=ana,
                             json={"name": "Marchamo 2027", "goal_amount": "250000", "months": 12,
                                   "mode": "fixed"})).json()
    r = await client.post(f"/v1/savings/envelopes/{env['id']}/deposit", headers={**ana, **idem()},
                          json={"amount": "10000", "account_id": crc["id"]})
    assert r.status_code == 201 and r.json()["envelope_balance"] == "10000.00"
    r = await client.post(f"/v1/savings/envelopes/{env['id']}/withdraw", headers={**ana, **idem()},
                          json={"amount": "20000", "account_id": crc["id"]})
    assert r.status_code == 422
    r = await client.post("/v1/savings/term-deposits", headers={**ana, **idem()},
                          json={"from_account_id": crc["id"], "amount": "50000", "term_months": 12})
    assert r.status_code == 201 and r.json()["annual_rate"] == "6.75"


async def test_rewards_redeem_to_account(client, ana):
    before = Decimal((await account(client, ana, "Colones"))["balance"])
    pts = (await client.get("/v1/rewards", headers=ana)).json()["points"]
    r = await client.post("/v1/rewards/redeem", json={"destination": "account"}, headers=ana)
    assert r.status_code == 200 and r.json()["points_used"] == pts
    after = Decimal((await account(client, ana, "Colones"))["balance"])
    assert after - before == Decimal(pts)
    r = await client.post("/v1/rewards/redeem", json={"destination": "account"}, headers=ana)
    assert r.status_code == 422


async def test_loan_simulation_is_public(client):
    r = await client.post("/v1/loans/simulate", json={"amount": "1500000", "term_months": 36})
    assert r.status_code == 200 and r.json()["monthly_payment"] == "54228.59"


async def test_sinpe_recent_recipients(client, ana, carlos):
    recent = (await client.get("/v1/transfers/sinpe/recent", headers=ana)).json()
    phones = [r["phone"] for r in recent]
    assert len(phones) == len(set(phones)) and "88112030" not in phones  # sin repetidos ni ella misma
    assert recent[0]["name"]
    # Cada quien ve solo los suyos: Carlos sí le envió a Ana.
    carlos_recent = (await client.get("/v1/transfers/sinpe/recent", headers=carlos)).json()
    assert "88112030" in [r["phone"] for r in carlos_recent] and "70231188" not in [r["phone"] for r in carlos_recent]


async def test_account_detail_has_client_account(client, ana):
    crc = await account(client, ana, "Colones")
    d = (await client.get(f"/v1/accounts/{crc['id']}", headers=ana)).json()
    assert d["iban"].startswith("CR") and len(d["iban"]) == 22
    assert d["client_account"] == d["iban"][5:] and len(d["client_account"]) == 17
    assert d["holder_name"] == "Ana Rojas Mora"
