from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException

from db import db
from helpers import (
    generate_orders_for_subscription, get_current_user,
    get_or_create_thread, today_ist_date,
)
from models import OnboardReq, SIZE_TO_QTY, Subscription, SupportMessage

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
    # Rolling, BB-Daily-style — keep the subscription open indefinitely. The
    # 10-year horizon is just a far-future sentinel; deliveries are gated by
    # wallet balance and per-day modifications, not by this end_date.
    end = today + timedelta(days=365 * 10)
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

    topup_request_id = None
    if req.initial_topup and req.initial_topup > 0:
        # IMPORTANT: do NOT auto-credit the wallet. We have no proof of payment
        # yet — instead we post a pending top-up request into the user's
        # support thread. An admin/agent confirms payment offline and approves
        # the request from chat, which is the only path that touches the
        # ledger.
        thread = await get_or_create_thread(user["id"])
        amount = float(req.initial_topup)
        msg = SupportMessage(
            thread_id=thread["id"], sender_id=user["id"],
            sender_role="customer", kind="text",
            text=(f"Welcome to Maavadu \U0001F44B \u2014 I'd like to start "
                  f"with \u20b9{int(amount)} in my wallet. Please confirm "
                  f"the easiest way to pay."),
            meta={"type": "topup_request",
                  "amount": amount,
                  "status": "pending",
                  "source": "onboarding"},
        )
        await db.support_messages.insert_one(msg.dict())
        await db.support_threads.update_one(
            {"id": thread["id"]},
            {"$set": {"last_message_at": msg.created_at,
                      "last_message_preview": msg.text[:60]},
             "$inc": {"unread_for_agent": 1}},
        )
        topup_request_id = msg.id

    refreshed = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    return {
        "user": refreshed,
        "subscription": sub_d,
        "topup_request_id": topup_request_id,
    }
