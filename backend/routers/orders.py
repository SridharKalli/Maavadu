from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException

from db import db
from helpers import cutoff_passed_for, get_current_user, today_ist_date
from models import SIZE_TO_QTY, UpdateOrderMealReq

router = APIRouter()


@router.get("/orders/upcoming")
async def upcoming_orders(user: dict = Depends(get_current_user)):
    today = today_ist_date()
    end = today + timedelta(days=7)
    orders = await db.orders.find(
        {"user_id": user["id"],
         "date": {"$gte": today.isoformat(), "$lt": end.isoformat()}},
        {"_id": 0},
    ).sort("date", 1).to_list(100)
    for o in orders:
        o["cutoff_passed"] = cutoff_passed_for(o["date"])
    return orders


@router.patch("/orders/{order_id}")
async def modify_order(order_id: str, req: UpdateOrderMealReq,
                       user: dict = Depends(get_current_user)):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(404, "Order not found")
    if order["user_id"] != user["id"] and user["role"] != "admin":
        raise HTTPException(403, "Not your order")
    if cutoff_passed_for(order["date"]):
        raise HTTPException(400, "8 PM cutoff has passed for this date")
    sub = await db.subscriptions.find_one(
        {"user_id": order["user_id"], "active": True}, {"_id": 0})
    if sub and req.meal not in sub["meals"]:
        raise HTTPException(400, f"You aren't subscribed for {req.meal}")
    meal = order[req.meal]
    if req.enabled is not None:
        meal["enabled"] = req.enabled
    if req.size is not None:
        if req.size not in SIZE_TO_QTY:
            raise HTTPException(400, "Size must be single, couple or family")
        meal["size"] = req.size
        meal["quantity"] = SIZE_TO_QTY[req.size]
        meal["enabled"] = True
    if req.lunch_variant is not None:
        if req.meal != "lunch":
            raise HTTPException(400, "lunch_variant only applies to lunch")
        meal["lunch_variant"] = req.lunch_variant
    await db.orders.update_one({"id": order_id}, {"$set": {req.meal: meal}})
    return await db.orders.find_one({"id": order_id}, {"_id": 0})
