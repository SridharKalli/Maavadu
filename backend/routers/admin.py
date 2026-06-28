from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException

from db import db, IST
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


def _as_aware(dt):
    if isinstance(dt, str):
        dt = datetime.fromisoformat(dt.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


async def _support_metrics(today_start_utc: datetime) -> dict:
    """Tickets opened today + avg first-response time today."""
    cust_msgs = await db.support_messages.find(
        {"sender_role": "customer",
         "created_at": {"$gte": today_start_utc}},
        {"_id": 0},
    ).sort("created_at", 1).to_list(5000)

    if not cust_msgs:
        return {"tickets": 0, "open": 0, "avg_response_seconds": 0}

    thread_ids = list({m["thread_id"] for m in cust_msgs})
    agent_msgs = await db.support_messages.find(
        {"sender_role": {"$in": ["agent", "admin"]},
         "thread_id": {"$in": thread_ids},
         "created_at": {"$gte": today_start_utc}},
        {"_id": 0},
    ).sort("created_at", 1).to_list(5000)

    agent_by_thread: dict = {}
    for m in agent_msgs:
        agent_by_thread.setdefault(m["thread_id"], []).append(
            _as_aware(m["created_at"]))

    deltas = []
    open_count = 0
    for m in cust_msgs:
        msg_time = _as_aware(m["created_at"])
        replies = agent_by_thread.get(m["thread_id"], [])
        next_reply = next((r for r in replies if r > msg_time), None)
        if next_reply:
            deltas.append((next_reply - msg_time).total_seconds())
        else:
            open_count += 1

    avg = int(sum(deltas) / len(deltas)) if deltas else 0
    return {"tickets": len(cust_msgs), "open": open_count,
            "avg_response_seconds": avg}


@router.get("/admin/stats")
async def admin_stats(_: dict = Depends(require_role("admin"))):
    today = today_ist_date().isoformat()
    # Customers with wallet below threshold (defaults to 500).
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

    # Balance roll-up.
    bal_pipe = [
        {"$match": {"role": "customer", "onboarded": True}},
        {"$addFields": {"_bal": {"$ifNull": ["$wallet_balance", 0.0]}}},
        {"$group": {
            "_id": None,
            "with_balance": {"$sum": {"$cond": [{"$gt": ["$_bal", 0]}, 1, 0]}},
            "total_positive": {"$sum": {
                "$cond": [{"$gt": ["$_bal", 0]}, "$_bal", 0]}},
        }},
    ]
    bal_doc = await db.users.aggregate(bal_pipe).to_list(1)
    if bal_doc:
        members_with_balance = int(bal_doc[0]["with_balance"])
        total_positive_balance = round(float(bal_doc[0]["total_positive"]), 2)
    else:
        members_with_balance = 0
        total_positive_balance = 0.0

    # Today's meal-by-meal counts (each enabled meal in today's orders).
    today_orders = await db.orders.find({"date": today}, {"_id": 0}).to_list(2000)
    today_breakfast = sum(1 for o in today_orders if o.get("breakfast", {}).get("enabled"))
    today_lunch = sum(1 for o in today_orders if o.get("lunch", {}).get("enabled"))
    today_dinner = sum(1 for o in today_orders if o.get("dinner", {}).get("enabled"))
    households_today = sum(
        1 for o in today_orders
        if o["breakfast"]["enabled"] or o["lunch"]["enabled"] or o["dinner"]["enabled"])

    # Support metrics — anchor on local-IST midnight, convert to UTC for query.
    today_start_ist = datetime.now(IST).replace(hour=0, minute=0, second=0, microsecond=0)
    today_start_utc = today_start_ist.astimezone(timezone.utc)
    support = await _support_metrics(today_start_utc)

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
        "members_with_balance": members_with_balance,
        "total_positive_balance": total_positive_balance,
        "households_today": households_today,
        "today_breakfast": today_breakfast,
        "today_lunch": today_lunch,
        "today_dinner": today_dinner,
        "support_tickets": support["tickets"],
        "support_open": support["open"],
        "support_avg_response_seconds": support["avg_response_seconds"],
    }
