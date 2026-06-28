from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from db import db
from helpers import debit_for_order, require_role, today_ist_date

router = APIRouter()


@router.get("/delivery/route")
async def delivery_route(date: str | None = None,
                         user: dict = Depends(require_role("delivery", "admin"))):
    target = date or today_ist_date().isoformat()
    query = {"date": target}
    if user["role"] == "delivery":
        query["delivery_user_id"] = user["id"]
    orders = await db.orders.find(query, {"_id": 0}).to_list(2000)
    user_ids = list({o["user_id"] for o in orders})
    customers = await db.users.find({"id": {"$in": user_ids}}, {"_id": 0}).to_list(2000)
    umap = {u["id"]: u for u in customers}
    out = []
    for o in orders:
        u = umap.get(o["user_id"], {})
        total_qty = sum(o[m]["quantity"] for m in ("breakfast", "lunch", "dinner")
                        if o[m]["enabled"])
        if total_qty == 0:
            continue
        out.append({
            **o,
            "customer_name": u.get("name", ""),
            "customer_address": u.get("address", ""),
            "customer_phone": u.get("phone", ""),
            "customer_notes": u.get("notes", ""),
            "customer_pincode": u.get("pincode", ""),
            "total_quantity": total_qty,
        })
    out.sort(key=lambda r: (r.get("customer_pincode", ""), r["customer_address"]))
    return out


@router.get("/delivery/pickups")
async def delivery_pickups(user: dict = Depends(require_role("delivery", "admin"))):
    today = today_ist_date().isoformat()
    query = {"delivered": True, "hotbox_collected": False,
             "date": {"$lte": today}}
    if user["role"] == "delivery":
        query["delivery_user_id"] = user["id"]
    orders = await db.orders.find(query, {"_id": 0}) \
        .sort("date", 1).to_list(2000)
    user_ids = list({o["user_id"] for o in orders})
    customers = await db.users.find({"id": {"$in": user_ids}}, {"_id": 0}).to_list(2000)
    umap = {u["id"]: u for u in customers}
    out = []
    for o in orders:
        u = umap.get(o["user_id"], {})
        out.append({
            **o,
            "customer_name": u.get("name", ""),
            "customer_address": u.get("address", ""),
            "customer_phone": u.get("phone", ""),
            "customer_notes": u.get("notes", ""),
        })
    out.sort(key=lambda r: (r["date"], r["customer_address"]))
    return out


@router.post("/delivery/orders/{order_id}/delivered")
async def mark_delivered(order_id: str,
                         user: dict = Depends(require_role("delivery", "admin"))):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(404, "Order not found")
    if user["role"] == "delivery" and order.get("delivery_user_id") != user["id"]:
        raise HTTPException(403, "Not assigned to you")
    if not order.get("delivered"):
        await db.orders.update_one(
            {"id": order_id},
            {"$set": {"delivered": True,
                      "delivered_at": datetime.now(timezone.utc)}},
        )
        order_after = await db.orders.find_one({"id": order_id}, {"_id": 0})
        await debit_for_order(order_after, by_user_id=user["id"])
    return await db.orders.find_one({"id": order_id}, {"_id": 0})


@router.post("/delivery/orders/{order_id}/hotbox")
async def mark_hotbox(order_id: str,
                      user: dict = Depends(require_role("delivery", "admin"))):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(404, "Order not found")
    if user["role"] == "delivery" and order.get("delivery_user_id") != user["id"]:
        raise HTTPException(403, "Not assigned to you")
    await db.orders.update_one({"id": order_id},
                               {"$set": {"hotbox_collected": True}})
    return await db.orders.find_one({"id": order_id}, {"_id": 0})
