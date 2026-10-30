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


async def test_saved_bill_with_stale_amount_is_updated_not_charged(client, ana):
    crc = await account(client, ana, "Colones")
    bill = next(b for b in (await client.get("/v1/bills/saved", headers=ana)).json() if b["pending_amount"])
    before = (await account(client, ana, "Colones"))["balance"]
    body = {"provider_id": bill["provider_id"], "reference": bill["reference"], "from_account_id": crc["id"]}
    bad = await client.post("/v1/bills/pay", headers={**ana, **idem()}, json={**body, "expected_amount": "1.00"})
    assert bad.status_code == 409
    assert (await account(client, ana, "Colones"))["balance"] == before  # no se cobró nada
    again = next(b for b in (await client.get("/v1/bills/saved", headers=ana)).json() if b["id"] == bill["id"])
    look = {"provider_id": bill["provider_id"], "reference": bill["reference"]}
    q = (await client.post("/v1/bills/lookup", json=look, headers=ana)).json()
    assert again["pending_amount"] == q["amount"]


async def test_bill_pay_rejects_amount_other_than_approved(client, ana):
    crc = await account(client, ana, "Colones")
    look = {"provider_id": "kolbi", "reference": "88554433"}
    q = (await client.post("/v1/bills/lookup", json=look, headers=ana)).json()
    body = {**look, "from_account_id": crc["id"]}
    bad = await client.post("/v1/bills/pay", headers={**ana, **idem()}, json={**body, "expected_amount": "1.00"})
    assert bad.status_code == 409 and bad.json()["code"] == "bill_amount_changed"
    ok = await client.post("/v1/bills/pay", headers={**ana, **idem()}, json={**body, "expected_amount": q["amount"]})
    assert ok.status_code == 201 and ok.json()["amount"] == q["amount"]


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


async def test_close_envelope_returns_balance(client, ana):
    crc = await account(client, ana, "Colones")
    body = {"name": "Para cerrar", "goal_amount": "100000", "months": 6, "mode": "roundup"}
    env = (await client.post("/v1/savings/envelopes", headers=ana, json=body)).json()
    await client.post(f"/v1/savings/envelopes/{env['id']}/deposit", headers={**ana, **idem()},
                      json={"amount": "7500", "account_id": crc["id"]})
    before = Decimal((await account(client, ana, "Colones"))["balance"])
    key = idem()
    r = await client.post(f"/v1/savings/envelopes/{env['id']}/close", headers={**ana, **key},
                          json={"account_id": crc["id"]})
    assert r.status_code == 200 and r.json()["returned"] == "7500.00"
    again = await client.post(f"/v1/savings/envelopes/{env['id']}/close", headers={**ana, **key},
                              json={"account_id": crc["id"]})
    assert again.json() == r.json()  # reintento idempotente: no devuelve dos veces
    after = Decimal((await account(client, ana, "Colones"))["balance"])
    assert after - before == Decimal("7500")
    names = [a["name"] for a in (await client.get("/v1/accounts", headers=ana)).json()["accounts"]]
    assert "Para cerrar" not in names
    r = await client.post(f"/v1/savings/envelopes/{env['id']}/deposit", headers={**ana, **idem()},
                          json={"amount": "100", "account_id": crc["id"]})
    assert r.status_code == 404


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
    assert recent[0]["name"] and recent[0]["last_amount"] and recent[0]["last_at"]
    # Cada quien ve solo los suyos: Carlos sí le envió a Ana.
    carlos_recent = (await client.get("/v1/transfers/sinpe/recent", headers=carlos)).json()
    assert "88112030" in [r["phone"] for r in carlos_recent] and "70231188" not in [r["phone"] for r in carlos_recent]


async def test_account_detail_has_client_account(client, ana):
    crc = await account(client, ana, "Colones")
    d = (await client.get(f"/v1/accounts/{crc['id']}", headers=ana)).json()
    assert d["iban"].startswith("CR") and len(d["iban"]) == 22
    assert d["client_account"] == d["iban"][5:] and len(d["client_account"]) == 17
    assert d["holder_name"] == "Ana Rojas Mora"


async def test_saved_bills_and_autopay(client, ana):
    bills = (await client.get("/v1/bills/saved", headers=ana)).json()
    assert bills and all(b["provider_name"] and b["category"] for b in bills)
    manual = next(b for b in bills if not b["autopay"])
    pts = (await client.get("/v1/me", headers=ana)).json()["points"]
    r = await client.patch(f"/v1/bills/saved/{manual['id']}", json={"autopay": True}, headers=ana)
    assert r.status_code == 200 and r.json()["autopay"] is True
    assert (await client.get("/v1/me", headers=ana)).json()["points"] == pts + 20
    # Apagarlo no resta ni suma puntos.
    await client.patch(f"/v1/bills/saved/{manual['id']}", json={"autopay": False}, headers=ana)
    assert (await client.get("/v1/me", headers=ana)).json()["points"] == pts + 20


async def test_preapproved_loan_disbursement(client, ana):
    crc = await account(client, ana, "Colones")
    before = Decimal(crc["balance"])
    body = {"amount": "1500000", "term_months": 36, "to_account_id": crc["id"], "pin": "000000"}
    bad = await client.post("/v1/loans/disbursements", json=body, headers={**ana, **idem()})
    assert bad.status_code in (401, 403, 422)  # clave incorrecta: no hay desembolso
    h = {**ana, **idem()}
    r = await client.post("/v1/loans/disbursements", json={**body, "pin": "482915"}, headers=h)
    assert r.status_code == 201, r.text
    again = await client.post("/v1/loans/disbursements", json={**body, "pin": "482915"}, headers=h)
    assert again.json() == r.json()  # reintento: un solo desembolso
    after = Decimal((await account(client, ana, "Colones"))["balance"])
    assert after - before == Decimal("1500000.00")
    assert r.json()["first_due"].endswith("-15")
    over = await client.post("/v1/loans/disbursements", json={**body, "amount": "6000000", "pin": "482915"},
                             headers={**ana, **idem()})
    assert over.status_code == 422
    apps = (await client.get("/v1/loans/applications", headers=ana)).json()
    assert apps[0]["status"] == "disbursed"


async def test_transactions_have_titles_and_counterparty(client, ana):
    crc = await account(client, ana, "Colones")
    items = (await client.get(f"/v1/accounts/{crc['id']}/transactions?limit=50", headers=ana)).json()["items"]
    received = next(t for t in items if t["category"] == "sinpe" and Decimal(t["amount"]) > 0)
    assert received["title"] == "Recibiste por SINPE Móvil" and received["counterparty"] == "María Rojas"
    card = next(t for t in items if t["category"] == "card")
    assert card["title"] == "Compra con tarjeta" and card["detail"].startswith("Débito")
    assert all(t["title"] for t in items)


async def test_combined_transactions(client, ana, carlos):
    r = (await client.get("/v1/transactions?limit=100", headers=ana)).json()
    names = {t["account_name"] for t in r["items"]}
    assert "Colones" in names and all(t["currency"] in ("CRC", "USD") for t in r["items"])
    dates = [t["created_at"] for t in r["items"]]
    assert dates == sorted(dates, reverse=True)
    crc = await account(client, ana, "Colones")
    only = (await client.get(f"/v1/transactions?account_id={crc['id']}", headers=ana)).json()["items"]
    assert only and {t["account_name"] for t in only} == {"Colones"}
    # Cuentas de otro asociado se ignoran.
    other = (await client.get(f"/v1/transactions?account_id={crc['id']}", headers=carlos)).json()
    assert other["items"] == []
