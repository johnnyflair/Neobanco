"""Panel de administración: acceso del equipo, roles, bandeja, ficha del asociado y bitácora."""

import pytest

from app.db.models import StaffRole
from app.seed import DEMO_PANEL_PASSWORD, DEMO_PIN
from app.staff_cli import upsert

pytestmark = pytest.mark.asyncio(loop_scope="session")

LUCIA = "61049932"


async def staff_login(client, email="diana@demo.coop", password=DEMO_PANEL_PASSWORD) -> dict[str, str]:
    r = await client.post("/admin/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


async def test_panel_page_is_served_with_strict_csp(client):
    r = await client.get("/admin")
    assert r.status_code == 200 and "text/html" in r.headers["content-type"]
    csp = r.headers["content-security-policy"]
    assert "script-src 'self'" in csp and "unsafe-inline" not in csp.split("script-src")[1].split(";")[0]
    assert (await client.get("/admin/app.js")).status_code == 200


async def test_staff_and_member_tokens_do_not_mix(client, ana):
    assert (await client.get("/admin/api/summary", headers=ana)).status_code == 403
    staff = await staff_login(client)
    assert (await client.get("/v1/accounts", headers=staff)).status_code == 403
    assert (await client.get("/admin/api/summary")).status_code == 401


async def test_login_locks_after_repeated_wrong_passwords(client):
    await upsert("temporal@demo.coop", "Temporal", StaffRole.operaciones, "una-clave-larga-123")
    for _ in range(5):
        r = await client.post("/admin/api/auth/login", json={"email": "temporal@demo.coop", "password": "mala"})
        assert r.status_code == 401
    good = {"email": "temporal@demo.coop", "password": "una-clave-larga-123"}
    r = await client.post("/admin/api/auth/login", json=good)
    assert r.status_code == 423
    unknown = await client.post("/admin/api/auth/login", json={"email": "nadie@demo.coop", "password": "x"})
    assert unknown.status_code == 401 and unknown.json()["code"] == "bad_credentials"


async def test_summary_and_queue(client):
    h = await staff_login(client)
    s = (await client.get("/admin/api/summary", params={"range": "7d"}, headers=h)).json()
    assert len(s["kpis"]) == 5 and len(s["new_per_day"]) == 14
    today = {t["kind"]: t["count"] for t in s["today"]}
    assert today["kyc"] >= 1 and today["case"] >= 1 and today["loan"] >= 1
    q = (await client.get("/admin/api/queue", headers=h)).json()
    kinds = [i["kind"] for i in q["items"]]
    assert kinds[0] == "case" and {"kyc", "loan"} <= set(kinds)  # fraude primero


async def test_kyc_approval_lets_the_member_in(client):
    h = await staff_login(client)
    item = next(i for i in (await client.get("/admin/api/queue", params={"kind": "kyc"}, headers=h)).json()["items"]
                if i["name"] == "María Fernanda Solís")
    detail = (await client.get(f"/admin/api/queue/kyc/{item['id']}", headers=h)).json()
    assert {k["label"] for k in detail["kyc"]} >= {"Actividad", "Origen de fondos"}
    blocked = await client.post("/v1/auth/login", json={"identifier": "87014455", "pin": DEMO_PIN})
    assert blocked.status_code == 403
    r = await client.post(f"/admin/api/members/{item['id']}/kyc", json={"decision": "approve"}, headers=h)
    assert r.status_code == 200 and r.json()["status"] == "verified"
    again = await client.post(f"/admin/api/members/{item['id']}/kyc", json={"decision": "approve"}, headers=h)
    assert again.status_code == 409
    ok = await client.post("/v1/auth/login", json={"identifier": "87014455", "pin": DEMO_PIN})
    assert ok.status_code == 200


async def test_read_only_role_sees_masked_data_and_cannot_act(client):
    ro = await staff_login(client, "lectura@demo.coop")
    found = (await client.get("/admin/api/members", params={"q": "Ana Rojas"}, headers=ro)).json()["items"][0]
    assert "•" in found["cedula"] and "•" in found["phone"] and "•" in found["email"]
    r = await client.post(f"/admin/api/members/{found['id']}/notes", json={"text": "Hola"}, headers=ro)
    assert r.status_code == 403 and r.json()["code"] == "read_only"


async def test_member_360_actions_and_audit_log(client):
    h = await staff_login(client)
    m = (await client.get("/admin/api/members", params={"q": LUCIA}, headers=h)).json()["items"][0]
    assert m["phone"] == LUCIA  # operaciones ve el dato completo
    assert (await client.post(f"/admin/api/members/{m['id']}/notes", json={"text": "Prefiere WhatsApp"},
                              headers=h)).status_code == 201
    locked = (await client.post(f"/admin/api/members/{m['id']}/lock-cards", headers=h)).json()
    assert locked["cards_locked"] >= 1
    assert (await client.post(f"/admin/api/members/{m['id']}/logout-all", headers=h)).status_code == 200
    ficha = (await client.get(f"/admin/api/members/{m['id']}", headers=h)).json()
    assert ficha["notes"][0]["text"] == "Prefiere WhatsApp" and ficha["notes"][0]["by"] == "Diana M."
    assert all(c["status"] == "locked" for c in ficha["cards"]) and ficha["timeline"]
    case = next(i for i in (await client.get("/admin/api/queue", params={"kind": "case"}, headers=h)).json()["items"])
    assert (await client.post(f"/admin/api/cases/{case['id']}/close", json={"note": "Cargo reconocido por la asociada"},
                              headers=h)).status_code == 200
    assert (await client.post(f"/admin/api/cases/{case['id']}/close", json={"note": "otra vez"},
                              headers=h)).status_code == 409
    actions = [a["action"] for a in (await client.get("/admin/api/audit", headers=h)).json()["items"]]
    assert {"Agregó una nota", "Bloqueó tarjetas", "Cerró las sesiones", "Cerró un caso"} <= set(actions)


async def test_loan_decision(client):
    h = await staff_login(client)
    loan = (await client.get("/admin/api/queue", params={"kind": "loan"}, headers=h)).json()["items"][0]
    body = {"decision": "approve", "note": "Ingresos ok"}
    r = await client.post(f"/admin/api/loans/{loan['id']}/decision", json=body, headers=h)
    assert r.status_code == 200 and r.json()["status"] == "approved"
