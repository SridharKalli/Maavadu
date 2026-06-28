from fastapi import APIRouter, Depends, HTTPException

from db import db
from helpers import (
    cutoff_passed_for, generate_orders_for_subscription, get_current_user,
    today_ist_date,
)
from models import SIZE_TO_QTY, UpdateSubscriptionReq

router = APIRouter()


@router.get("/subscriptions/me")
async def my_subscription(user: dict = Depends(get_current_user)):
    return await db.subscriptions.find_one(
        {"user_id": user["id"], "active": True}, {"_id": 0})


@router.patch("/subscriptions/me")
async def update_subscription(req: UpdateSubscriptionReq,
                              user: dict = Depends(get_current_user)):
    if user["role"] != "customer":
        raise HTTPException(403, "Customers only")
    sub = await db.subscriptions.find_one(
        {"user_id": user["id"], "active": True}, {"_id": 0})
    if not sub:
        raise HTTPException(404, "No active subscription")

    upd: dict = {}
    if req.meals is not None:
        if not req.meals:
            raise HTTPException(400, "Pick at least one meal")
        upd["meals"] = req.meals
    if req.default_size is not None:
        if req.default_size not in SIZE_TO_QTY:
            raise HTTPException(400, "Invalid size")
        upd["default_size"] = req.default_size
        upd["default_quantity"] = SIZE_TO_QTY[req.default_size]
    if req.default_lunch_variant is not None:
        upd["default_lunch_variant"] = req.default_lunch_variant
    if not upd:
        raise HTTPException(400, "Nothing to update")

    await db.subscriptions.update_one({"id": sub["id"]}, {"$set": upd})
    new_sub = await db.subscriptions.find_one({"id": sub["id"]}, {"_id": 0})

    # Reshape any not-yet-locked upcoming orders to honour the new defaults.
    today = today_ist_date().isoformat()
    upcoming = await db.orders.find(
        {"user_id": user["id"], "date": {"$gte": today}, "delivered": False},
        {"_id": 0},
    ).to_list(20)
    new_meals = set(new_sub["meals"])
    size = new_sub["default_size"]
    qty = SIZE_TO_QTY[size]
    variant = new_sub.get("default_lunch_variant", "with_rice")

    for o in upcoming:
        if cutoff_passed_for(o["date"]):
            continue
        updates = {}
        for m in ("breakfast", "lunch", "dinner"):
            meal = dict(o[m])
            if m in new_meals:
                meal["enabled"] = True
                meal["size"] = size
                meal["quantity"] = qty
                if m == "lunch":
                    meal["lunch_variant"] = variant
            else:
                meal["enabled"] = False
                meal["quantity"] = 0
            updates[m] = meal
        await db.orders.update_one({"id": o["id"]}, {"$set": updates})

    # Top up any days the subscription now covers but weren't generated before.
    await generate_orders_for_subscription(new_sub)

    return new_sub
