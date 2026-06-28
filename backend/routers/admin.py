from fastapi import APIRouter, Depends, HTTPException

from db import db
from helpers import require_role, today_ist_date
from models import AdminCreateUserReq, User

router = APIRouter()


@router.get("/admin/users")
async def admin_list_users(_: dict = Depends(require_role("admin"))):
    return await db.users.find({}, {"_id": 0}).to_list(2000)


@router.post("/admin/users")
async def admin_create_user(req: AdminCreateUserReq,
                            _: dict = Depends(require_role("admin"))):
    if await db.users.find_one({"phone": req.phone}, {"_id": 0}):
        raise HTTPException(400, "User already exists")
    u = User(**req.dict(),
             onboarded=True if req.role != "customer" else False)
    await db.users.insert_one(u.dict())
    return u.dict()


@router.get("/admin/orders")
async def admin_orders(date: str | None = None,
                       _: dict = Depends(require_role("admin"))):
    target = date or today_ist_date().isoformat()
    orders = await db.orders.find({"date": target}, {"_id": 0}).to_list(2000)
    user_ids = list({o["user_id"] for o in orders})
    users = await db.users.find({"id": {"$in": user_ids}}, {"_id": 0}).to_list(2000)
    umap = {u["id"]: u for u in users}
    for o in orders:
        u = umap.get(o["user_id"], {})
        o["customer_name"] = u.get("name", "")
        o["customer_address"] = u.get("address", "")
        o["customer_phone"] = u.get("phone", "")
        o["customer_pincode"] = u.get("pincode", "")
    return orders


@router.get("/admin/stats")
async def admin_stats(_: dict = Depends(require_role("admin"))):
    today = today_ist_date().isoformat()
    low_pipe = [
        {"$match": {"role": "customer", "onboarded": True}},
        {"$addFields": {
            "_th": {"$ifNull": ["$wallet_threshold", 500.0]},
            "_bal": {"$ifNull": ["$wallet_balance", 0.0]},
        }},
        {"$match": {"$expr": {"$lt": ["$_bal", "$_th"]}}},
        {"$count": "n"},
    ]
    low_doc = await db.users.aggregate(low_pipe).to_list(1)
    wallet_low = (low_doc[0]["n"] if low_doc else 0)

    return {
        "total_customers": await db.users.count_documents(
            {"role": "customer", "onboarded": True}),
        "pending_onboarding": await db.users.count_documents(
            {"role": "customer", "onboarded": False}),
        "active_subscriptions": await db.subscriptions.count_documents({"active": True}),
        "today_orders": await db.orders.count_documents({"date": today}),
        "delivered_today": await db.orders.count_documents(
            {"date": today, "delivered": True}),
        "pincodes": await db.pincodes.count_documents({"active": True}),
        "wallet_low": wallet_low,
    }
