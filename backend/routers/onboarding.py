from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException

from db import db
from helpers import (
    generate_orders_for_subscription, get_current_user,
    record_wallet_txn, today_ist_date,
)
from models import OnboardReq, SIZE_TO_QTY, Subscription

router = APIRouter()


@router.get("/onboarding/check-pincode/{code}")
async def check_pincode(code: str, _: dict = Depends(get_current_user)):
    p = await db.pincodes.find_one({"code": code, "active": True}, {"_id": 0})
    return {"serviceable": bool(p), "pincode": p}


@router.post("/onboarding/complete")
async def complete_onboarding(req: OnboardReq,
                              user: dict = Depends(get_current_user)):
    if user["role"] != "customer":
        raise HTTPException(403, "Only customers can onboard")
    if not req.meals:
        raise HTTPException(400, "Pick at least one meal")
    if req.default_size not in SIZE_TO_QTY:
        raise HTTPException(400, "Size must be single, couple or family")
    p = await db.pincodes.find_one(
        {"code": req.pincode, "active": True}, {"_id": 0})
    if not p:
        raise HTTPException(400, "Sorry, we don't deliver to that pincode yet")

    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {
            "name": req.name, "address": req.address,
            "pincode": req.pincode, "notes": req.notes,
            "onboarded": True,
        }},
    )

    await db.subscriptions.update_many(
        {"user_id": user["id"], "active": True}, {"$set": {"active": False}},
    )
    today = today_ist_date()
    end = today + timedelta(days=365)
    sub = Subscription(
        user_id=user["id"], plan_type="month",
        start_date=today.isoformat(), end_date=end.isoformat(),
        meals=req.meals,
        default_size=req.default_size,
        default_lunch_variant=req.default_lunch_variant,
        default_quantity=SIZE_TO_QTY[req.default_size],
    )
    sub_d = sub.dict()
    await db.subscriptions.insert_one(sub_d)
    await generate_orders_for_subscription(sub_d)
    sub_d.pop("_id", None)

    if req.initial_topup and req.initial_topup > 0:
        await record_wallet_txn(user["id"], "credit",
                                float(req.initial_topup),
                                reason="Welcome top-up",
                                by_user_id=user["id"])

    refreshed = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    return {"user": refreshed, "subscription": sub_d}
