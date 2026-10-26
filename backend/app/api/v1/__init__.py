from fastapi import APIRouter

from app.api.v1 import accounts, auth, bills, cards, loans, rewards, savings, transfers

router = APIRouter(prefix="/v1")
for r in (auth, accounts, cards, transfers, bills, savings, loans, rewards):
    router.include_router(r.router)
