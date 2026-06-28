from fastapi import APIRouter, Depends

from db import db
from helpers import get_current_user

router = APIRouter()


@router.get("/subscriptions/me")
async def my_subscription(user: dict = Depends(get_current_user)):
    return await db.subscriptions.find_one(
        {"user_id": user["id"], "active": True}, {"_id": 0})
