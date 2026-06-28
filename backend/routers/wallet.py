from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException

from db import db
from helpers import (
    get_current_user, get_or_create_thread, get_pricing,
    record_wallet_txn, require_role,
)
from models import CreditWalletReq, SupportMessage, TopupRequestReq, UpdatePricingReq

router = APIRouter()


def _suggest_topups(threshold: float) -> List[int]:
    return [3000, 6000, 10000]


@router.get("/wallet/me")
async def wallet_me(user: dict = Depends(get_current_user)):
    pricing = await get_pricing()
    sub = await db.subscriptions.find_one(
        {"user_id": user["id"], "active": True}, {"_id": 0})
    size = (sub or {}).get("default_size", "single")
    lunch_variant = (sub or {}).get("default_lunch_variant", "with_rice")
    meals_subbed = (sub or {}).get("meals", [])
    daily_burn = 0.0
    for m in meals_subbed:
        if m == "lunch":
            daily_burn += float(pricing[f"lunch_{lunch_variant}"][size])
        else:
            daily_burn += float(pricing[m][size])
    bal = float(user.get("wallet_balance", 0.0))
    days_left = int(bal / daily_burn) if daily_burn > 0 else 999
    recent = await db.wallet_txns.find({"user_id": user["id"]}, {"_id": 0}) \
        .sort("created_at", -1).limit(30).to_list(30)
    return {
        "balance": bal,
        "threshold": float(user.get("wallet_threshold", 500.0)),
        "pricing": pricing,
        "daily_burn": round(daily_burn, 2),
        "days_left": days_left,
        "low": bal < float(user.get("wallet_threshold", 500.0)),
        "recent": recent,
        "suggested_topups": _suggest_topups(
            float(user.get("wallet_threshold", 500.0))),
        "default_size": size,
        "default_lunch_variant": lunch_variant,
        "subscribed_meals": meals_subbed,
    }


@router.get("/wallet/pricing")
async def get_pricing_api(_: dict = Depends(get_current_user)):
    return await get_pricing()


@router.put("/admin/wallet/pricing")
async def update_pricing(req: UpdatePricingReq,
                         _: dict = Depends(require_role("admin"))):
    # Pydantic v2: iterating the model yields (field_name, value) where value is
    # the nested PriceRow instance (or None for unset fields).
    upd: dict = {}
    for k, v in req:
        if v is None:
            continue
        row = v.dict() if hasattr(v, "dict") else dict(v)
        for size_key in ("single", "couple", "family"):
            val = row.get(size_key)
            if val is None or float(val) < 0:
                raise HTTPException(
                    400, f"{k}.{size_key} must be a non-negative number")
            row[size_key] = float(val)
        upd[k] = row
    if not upd:
        raise HTTPException(400, "Nothing to update")
    await db.pricing.update_one({"_id": "current"}, {"$set": upd}, upsert=True)
    return await get_pricing()


@router.post("/wallet/topup-request")
async def request_topup(req: TopupRequestReq,
                        user: dict = Depends(get_current_user)):
    if user["role"] != "customer":
        raise HTTPException(403, "Customers only")
    if req.amount <= 0:
        raise HTTPException(400, "Amount must be positive")
    thread = await get_or_create_thread(user["id"])
    msg = SupportMessage(
        thread_id=thread["id"], sender_id=user["id"], sender_role="customer",
        kind="text",
        text=f"Hi \u2014 I'd like to top up \u20b9{int(req.amount)} to my wallet. "
             f"Please confirm the easiest way to pay.",
    )
    await db.support_messages.insert_one(msg.dict())
    await db.support_threads.update_one(
        {"id": thread["id"]},
        {"$set": {"last_message_at": msg.created_at,
                  "last_message_preview": msg.text[:60]},
         "$inc": {"unread_for_agent": 1}},
    )
    return {"sent": True, "thread_id": thread["id"]}


@router.post("/admin/wallet/{user_id}/credit")
async def admin_credit(user_id: str, req: CreditWalletReq,
                       actor: dict = Depends(require_role("admin", "agent"))):
    if req.amount <= 0:
        raise HTTPException(400, "Amount must be positive")
    return await record_wallet_txn(user_id, "credit", req.amount,
                                   req.reason, by_user_id=actor["id"])


@router.get("/admin/wallet/transactions")
async def admin_txns(user_id: Optional[str] = None,
                     _: dict = Depends(require_role("admin", "agent"))):
    q = {"user_id": user_id} if user_id else {}
    return await db.wallet_txns.find(q, {"_id": 0}) \
        .sort("created_at", -1).limit(500).to_list(500)


@router.get("/admin/wallet/customers")
async def admin_wallet_customers(_: dict = Depends(require_role("admin", "agent"))):
    return await db.users.find(
        {"role": "customer"}, {"_id": 0}).sort("name", 1).to_list(2000)
