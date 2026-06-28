"""Cross-cutting helpers shared by all routers.

Auth dependencies, IST date math, pricing access, wallet ledger writes, the
low-balance nudge, and order generation all live here so router modules can
stay focused on HTTP concerns.
"""

from datetime import datetime, timedelta, timezone, date as date_cls
from typing import Optional

import jwt
from fastapi import Depends, Header, HTTPException

from db import (
    db, IST, CUTOFF_HOUR_LOCAL, JWT_SECRET, JWT_ALG, JWT_EXP_DAYS,
)
from models import (
    Pricing, Subscription, DailyOrder, OrderMeal, SupportThread,
    SupportMessage, WalletTxn, Role, SIZE_TO_QTY,
)


# ---------------------------------------------------------------------------
# Time / cutoff
# ---------------------------------------------------------------------------
def now_ist() -> datetime:
    return datetime.now(IST)


def today_ist_date() -> date_cls:
    return now_ist().date()


def cutoff_passed_for(target_date_str: str) -> bool:
    target = datetime.strptime(target_date_str, "%Y-%m-%d").date()
    cutoff_day = target - timedelta(days=1)
    cutoff_dt = datetime(cutoff_day.year, cutoff_day.month, cutoff_day.day,
                         CUTOFF_HOUR_LOCAL, 0, 0, tzinfo=IST)
    return now_ist() >= cutoff_dt


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------
def mk_token(user_id: str, role: str) -> str:
    payload = {"sub": user_id, "role": role,
               "exp": datetime.now(timezone.utc) + timedelta(days=JWT_EXP_DAYS)}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


async def get_current_user(authorization: Optional[str] = Header(None)) -> dict:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Missing token")
    token = authorization.split(" ", 1)[1].strip()
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
    except jwt.PyJWTError as e:
        raise HTTPException(401, f"Invalid token: {e}")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0})
    if not user:
        raise HTTPException(401, "User not found")
    # Lightweight presence tracking. Fire-and-forget update.
    try:
        now_utc = datetime.now(timezone.utc)
        await db.users.update_one({"id": user["id"]},
                                  {"$set": {"last_seen_at": now_utc}})
        user["last_seen_at"] = now_utc
    except Exception:  # noqa: BLE001
        pass
    return user


def require_role(*roles: Role):
    async def dep(user: dict = Depends(get_current_user)) -> dict:
        if user["role"] not in roles:
            raise HTTPException(403, f"Requires role: {','.join(roles)}")
        return user
    return dep


# ---------------------------------------------------------------------------
# Pricing / wallet
# ---------------------------------------------------------------------------
async def get_pricing() -> dict:
    p = await db.pricing.find_one({"_id": "current"})
    if not p:
        defaults = Pricing().dict()
        defaults["_id"] = "current"
        await db.pricing.insert_one(defaults)
        return Pricing().dict()
    p.pop("_id", None)
    return p


async def record_wallet_txn(user_id: str, ttype: str, amount: float,
                            reason: str, ref_order_id: Optional[str] = None,
                            by_user_id: Optional[str] = None) -> dict:
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(404, "user not found")
    delta = amount if ttype == "credit" else -amount
    new_bal = round(float(user.get("wallet_balance", 0.0)) + delta, 2)
    await db.users.update_one({"id": user_id},
                              {"$set": {"wallet_balance": new_bal}})
    txn = WalletTxn(user_id=user_id, type=ttype, amount=amount,
                    balance_after=new_bal, reason=reason,
                    ref_order_id=ref_order_id, by_user_id=by_user_id)
    await db.wallet_txns.insert_one(txn.dict())
    return {"balance": new_bal, "txn": txn.dict()}


async def debit_for_order(order: dict, by_user_id: str) -> None:
    """Debit the customer's wallet for what was actually delivered.

    Idempotent: if a debit txn already exists for this order, returns silently.
    Triggers a low-balance nudge after a successful debit.
    """
    existing = await db.wallet_txns.find_one(
        {"ref_order_id": order["id"], "type": "debit"}, {"_id": 0})
    if existing:
        return
    pricing = await get_pricing()
    total = 0.0
    parts = []
    for m in ("breakfast", "lunch", "dinner"):
        meal = order.get(m, {})
        if not meal.get("enabled"):
            continue
        size = meal.get("size") or "single"
        if m == "lunch":
            variant = meal.get("lunch_variant") or "with_rice"
            price = float(pricing[f"lunch_{variant}"][size])
            label = f"lunch {size[:3]} ({'+rice' if variant == 'with_rice' else 'no rice'})"
        else:
            price = float(pricing[m][size])
            label = f"{m[:3]} {size[:3]}"
        total += price
        parts.append(f"{label} \u20b9{int(price)}")
    if total <= 0:
        return
    reason = f"Delivery {order['date']}: " + " \u00b7 ".join(parts)
    await record_wallet_txn(order["user_id"], "debit", round(total, 2),
                            reason, ref_order_id=order["id"],
                            by_user_id=by_user_id)
    await maybe_nudge_low_balance(order["user_id"])


async def maybe_nudge_low_balance(user_id: str) -> None:
    """Post a friendly system message into the customer's support thread when
    their wallet now covers fewer than 3 days of their default meal plan.
    De-duped: at most one auto-nudge per UTC day per customer.
    """
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user or user.get("role") != "customer":
        return
    bal = float(user.get("wallet_balance", 0.0))
    sub = await db.subscriptions.find_one(
        {"user_id": user_id, "active": True}, {"_id": 0})
    if not sub:
        return
    pricing = await get_pricing()
    size = sub.get("default_size", "single")
    variant = sub.get("default_lunch_variant", "with_rice")
    daily = 0.0
    for m in sub.get("meals", []):
        if m == "lunch":
            daily += float(pricing[f"lunch_{variant}"][size])
        else:
            daily += float(pricing[m][size])
    if daily <= 0:
        return
    days_left = bal / daily
    if days_left >= 3:
        return
    today_iso = datetime.now(timezone.utc).date().isoformat()
    thread = await get_or_create_thread(user_id)
    already = await db.support_messages.find_one(
        {"thread_id": thread["id"],
         "sender_role": "agent",
         "text": {"$regex": f"^\\[Auto \u00b7 {today_iso}\\]"}},
        {"_id": 0},
    )
    if already:
        return
    days_int = max(0, int(days_left))
    first = (user.get("name") or "").split(" ")[0] or "there"
    if days_int <= 0:
        body = (f"Hi {first} \u2014 your wallet won't cover tomorrow's meals "
                f"(\u20b9{int(bal)} left). Tap top-up and we'll keep the "
                f"kitchen rolling for you.")
    else:
        body = (f"Hi {first} \u2014 quick heads-up: your wallet covers about "
                f"{days_int} more day{'s' if days_int != 1 else ''} of meals. "
                f"A small top-up now keeps deliveries uninterrupted \U0001f49b")
    text = f"[Auto \u00b7 {today_iso}] {body}"
    agent = await db.users.find_one({"role": "agent"}, {"_id": 0})
    sender_id = (agent or {}).get("id", "system")
    msg = SupportMessage(
        thread_id=thread["id"], sender_id=sender_id, sender_role="agent",
        kind="text", text=text,
    )
    await db.support_messages.insert_one(msg.dict())
    await db.support_threads.update_one(
        {"id": thread["id"]},
        {"$set": {"last_message_at": msg.created_at,
                  "last_message_preview": text[:60]},
         "$inc": {"unread_for_customer": 1}},
    )


# ---------------------------------------------------------------------------
# Support thread
# ---------------------------------------------------------------------------
async def get_or_create_thread(customer_id: str) -> dict:
    t = await db.support_threads.find_one({"customer_id": customer_id}, {"_id": 0})
    if t:
        return t
    new = SupportThread(customer_id=customer_id)
    await db.support_threads.insert_one(new.dict())
    return new.dict()


def preview_for(msg: SupportMessage) -> str:
    return msg.text[:60] if msg.kind == "text" else "\U0001f3a4 Voice message"


# ---------------------------------------------------------------------------
# Orders
# ---------------------------------------------------------------------------
async def generate_orders_for_subscription(sub: dict) -> int:
    """Create DailyOrder rows for the next 8 days based on the subscription's
    meal list. Idempotent per (user, date).
    """
    today = today_ist_date()
    delivery = await db.users.find_one({"role": "delivery"}, {"_id": 0})
    end_date = datetime.strptime(sub["end_date"], "%Y-%m-%d").date()
    size = sub.get("default_size", "single")
    qty = SIZE_TO_QTY.get(size, 1)
    lunch_variant = sub.get("default_lunch_variant", "with_rice")
    inserted = 0
    for offset in range(8):
        d = today + timedelta(days=offset)
        if d > end_date:
            break
        dow = (d.weekday() + 1) % 7
        menu = await db.weekly_menu.find_one({"day_of_week": dow}, {"_id": 0})
        if not menu or menu.get("is_holiday"):
            continue
        existing = await db.orders.find_one({"user_id": sub["user_id"],
                                              "date": d.isoformat()})
        if existing:
            continue
        order = DailyOrder(
            user_id=sub["user_id"], date=d.isoformat(),
            delivery_user_id=delivery["id"] if delivery else None,
        )
        order_d = order.dict()
        for m in ("breakfast", "lunch", "dinner"):
            if m in sub["meals"]:
                order_d[m] = {
                    "enabled": True,
                    "quantity": qty,
                    "size": size,
                    "item_name": (menu.get(m) or {}).get("name", ""),
                    "lunch_variant": lunch_variant if m == "lunch" else None,
                }
        await db.orders.insert_one(order_d)
        inserted += 1
    return inserted
