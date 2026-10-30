"""Foto de perfil y demo de solo lectura para visitantes."""

import uuid

import pytest

pytestmark = pytest.mark.asyncio(loop_scope="session")

PNG = ("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9"
       "awAAAABJRU5ErkJggg==")


async def test_profile_photo_set_and_remove(client, ana):
    assert (await client.get("/v1/me", headers=ana)).json()["photo"] is None
    assert (await client.put("/v1/me/photo", json={"data": PNG}, headers=ana)).status_code == 204
    assert (await client.get("/v1/me", headers=ana)).json()["photo"] == PNG
    # Solo imágenes como data URL: nada de enlaces externos ni otros formatos.
    bad = await client.put("/v1/me/photo", json={"data": "https://evil.example/x.png"}, headers=ana)
    assert bad.status_code == 422
    assert (await client.delete("/v1/me/photo", headers=ana)).status_code == 204
    assert (await client.get("/v1/me", headers=ana)).json()["photo"] is None


async def test_demo_is_read_only(client):
    r = await client.post("/v1/auth/demo")
    assert r.status_code == 200, r.text
    demo = {"Authorization": f"Bearer {r.json()['access_token']}"}
    me = (await client.get("/v1/me", headers=demo)).json()
    assert me["is_demo"] is True and me["full_name"] == "Ana Rojas Mora"
    accts = (await client.get("/v1/accounts", headers=demo)).json()["accounts"]
    crc = next(a for a in accts if a["name"] == "Colones")
    assert float(crc["balance"]) > 0
    # Consultas sí; mover plata o cambiar datos, no.
    assert (await client.post("/v1/bills/lookup", json={"provider_id": "cnfl", "reference": "1234567"},
                              headers=demo)).status_code == 200
    sent = await client.post("/v1/transfers/sinpe", headers={**demo, "Idempotency-Key": str(uuid.uuid4())},
                             json={"from_account_id": crc["id"], "phone": "88124455", "amount": "1000"})
    assert sent.status_code == 403 and sent.json()["code"] == "demo"
    assert (await client.put("/v1/me/photo", json={"data": PNG}, headers=demo)).json()["code"] == "demo"
