import os

os.environ.update(
    NEO_ENV="test",
    NEO_DATABASE_URL=os.environ.get("NEO_TEST_DATABASE_URL",
                                    "postgresql+asyncpg://neo:neo@localhost:5432/neobanco_test"),
    NEO_EXPOSE_DEBUG_OTP="true",
)

import uuid

import httpx
import pytest

from app.core.ratelimit import reset_memory
from app.main import create_app
from app.seed import DEMO_PIN, seed

ANA = "88112030"
CARLOS = "70231188"


@pytest.fixture(scope="session", autouse=True)
async def _db():
    await seed(reset=True)
    yield


@pytest.fixture(autouse=True)
def _limits():
    reset_memory()


@pytest.fixture(scope="session")
def app():
    return create_app()


@pytest.fixture
async def client(app):
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as c:
        yield c


async def login(client: httpx.AsyncClient, phone: str = ANA, pin: str = DEMO_PIN) -> dict[str, str]:
    r = await client.post("/v1/auth/login", json={"identifier": phone, "pin": pin})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture
async def ana(client):
    return await login(client, ANA)


@pytest.fixture
async def carlos(client):
    return await login(client, CARLOS)


def idem() -> dict[str, str]:
    return {"Idempotency-Key": str(uuid.uuid4())}


async def account(client, headers, name: str) -> dict:
    accts = (await client.get("/v1/accounts", headers=headers)).json()["accounts"]
    return next(a for a in accts if a["name"] == name)

