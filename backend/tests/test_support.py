import pytest

pytestmark = pytest.mark.asyncio(loop_scope="session")



async def test_me_has_masked_cedula(client, ana):
    me = (await client.get("/v1/me", headers=ana)).json()
    assert "••••" in me["cedula_masked"] and me["cedula_masked"][-4:].isdigit()


async def test_auto_redeem_rule(client, ana):
    assert (await client.get("/v1/rewards/auto-rule", headers=ana)).json()["destination"] is None
    r = await client.put("/v1/rewards/auto-rule", json={"destination": "loan"}, headers=ana)
    assert r.status_code == 200
    assert (await client.get("/v1/rewards/auto-rule", headers=ana)).json()["destination"] == "loan"
    bad = await client.put("/v1/rewards/auto-rule", json={"destination": "casino"}, headers=ana)
    assert bad.status_code == 422
    await client.put("/v1/rewards/auto-rule", json={"destination": None}, headers=ana)


async def test_fraud_report_locks_all_cards(client, carlos, ana):
    r = await client.post("/v1/support/fraud", json={"reason": "unknown_charge"}, headers=carlos)
    assert r.status_code == 201, r.text
    case = r.json()
    assert len(case["number"]) == 6 and case["status"] == "open"
    cards = (await client.get("/v1/cards", headers=carlos)).json()
    assert cards and all(c["status"] == "locked" for c in cards)
    assert case["cards_locked"] == len(cards)
    got = await client.get(f"/v1/support/cases/{case['number']}", headers=carlos)
    assert got.status_code == 200
    # Otro asociado no puede ver el caso.
    assert (await client.get(f"/v1/support/cases/{case['number']}", headers=ana)).status_code == 404
    assert (await client.get("/v1/support/cases", headers=carlos)).json()[0]["number"] == case["number"]


async def test_levels_and_perks(client, ana):
    from decimal import Decimal

    from app.db.models import Member
    from app.services import member_perks

    r = (await client.get("/v1/rewards", headers=ana)).json()
    assert [lv["name"] for lv in r["levels"]] == ["Bronce", "Plata", "Oro"]
    assert r["levels"][0]["reached"] is True and r["levels"][1]["reached"] is False
    assert member_perks(Member(points_lifetime=2500)) == (Decimal("1.25"), Decimal("0.25"))
    assert member_perks(Member(points_lifetime=9000)) == (Decimal("1.50"), Decimal("0.50"))
