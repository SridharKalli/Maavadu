from fastapi import APIRouter, Depends, HTTPException

from db import db
from helpers import get_current_user, require_role
from models import UpdateMenuReq

router = APIRouter()


@router.get("/menu/week")
async def get_week_menu(_: dict = Depends(get_current_user)):
    return await db.weekly_menu.find({}, {"_id": 0}) \
        .sort("day_of_week", 1).to_list(10)


@router.get("/menu/public")
async def get_public_menu():
    """Unauthenticated menu preview for the onboarding flow."""
    return await db.weekly_menu.find({}, {"_id": 0}) \
        .sort("day_of_week", 1).to_list(10)


@router.put("/menu/{day_of_week}")
async def update_menu(day_of_week: int, req: UpdateMenuReq,
                      _: dict = Depends(require_role("admin"))):
    if not 0 <= day_of_week <= 6:
        raise HTTPException(400, "day_of_week 0..6")
    upd = {k: (v.dict() if hasattr(v, "dict") else v)
           for k, v in req.dict().items() if v is not None}
    res = await db.weekly_menu.update_one(
        {"day_of_week": day_of_week}, {"$set": upd})
    if res.matched_count == 0:
        raise HTTPException(404, "menu not found")
    return await db.weekly_menu.find_one(
        {"day_of_week": day_of_week}, {"_id": 0})
