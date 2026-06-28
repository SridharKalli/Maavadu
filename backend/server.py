"""Home Tiffin Service backend — Chennai edition.

Phone/OTP authentication (dev mode: OTP returned in response). JWT tokens
carry role (customer/admin/delivery/agent). Customers self-onboard with a
pincode-gate, choose a meal combo (any subset of B/L/D), and pick a
Day/Week/Month plan. Voice + text support chat between customer and agent.
"""

import os
import uuid
import random
import logging
import re
from pathlib import Path
from datetime import datetime, timedelta, timezone, date as date_cls
from typing import List, Optional, Literal

import jwt
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Header
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# ---------------------------------------------------------------------------
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET = os.environ.get("JWT_SECRET", "tiffin-dev-secret-please-change-at-least-32b")
JWT_ALG = "HS256"
JWT_EXP_DAYS = 30
DEV_RETURN_OTP = True
CUTOFF_HOUR_LOCAL = 20
IST = timezone(timedelta(hours=5, minutes=30))

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI(title="Home Tiffin API")
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("tiffin")


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------
Role = Literal["customer", "admin", "delivery", "agent"]
MealKey = Literal["breakfast", "lunch", "dinner"]
PlanType = Literal["day", "week", "month"]


class User(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    phone: str
    name: str = ""
    role: Role = "customer"
    address: str = ""
    pincode: str = ""
    notes: str = ""
    onboarded: bool = False
    wallet_balance: float = 0.0
    wallet_threshold: float = 500.0
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class WalletTxn(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    type: Literal["credit", "debit"] = "credit"
    amount: float
    balance_after: float
    reason: str = ""
    ref_order_id: Optional[str] = None
    by_user_id: Optional[str] = None  # who performed the txn (admin/agent)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class Pricing(BaseModel):
    breakfast: dict = Field(default_factory=lambda:
        {"single": 230.0, "couple": 340.0, "family": 460.0})
    lunch_without_rice: dict = Field(default_factory=lambda:
        {"single": 240.0, "couple": 340.0, "family": 460.0})
    lunch_with_rice: dict = Field(default_factory=lambda:
        {"single": 268.0, "couple": 385.0, "family": 530.0})
    dinner: dict = Field(default_factory=lambda:
        {"single": 230.0, "couple": 340.0, "family": 460.0})


class Pincode(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    code: str
    area: str = ""
    active: bool = True


class MealItem(BaseModel):
    name: str
    description: str = ""


class WeeklyMenu(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    day_of_week: int
    is_holiday: bool = False
    breakfast: Optional[MealItem] = None
    lunch: Optional[MealItem] = None
    dinner: Optional[MealItem] = None


SizeKey = Literal["single", "couple", "family"]
LunchVariant = Literal["with_rice", "without_rice"]
SIZE_TO_QTY = {"single": 1, "couple": 2, "family": 4}


class Subscription(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    plan_type: PlanType
    meals: List[MealKey] = ["breakfast", "lunch", "dinner"]
    default_size: SizeKey = "single"
    default_lunch_variant: LunchVariant = "with_rice"
    default_quantity: int = 1  # kept for legacy display
    start_date: str
    end_date: str
    active: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class OrderMeal(BaseModel):
    enabled: bool = True
    quantity: int = 1  # derived from size (skip=0, single=1, couple=2, family=4)
    size: SizeKey = "single"
    item_name: str = ""
    lunch_variant: Optional[LunchVariant] = None  # only meaningful for lunch


class DailyOrder(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    date: str
    breakfast: OrderMeal = Field(default_factory=lambda: OrderMeal(enabled=False, quantity=0))
    lunch: OrderMeal = Field(default_factory=lambda: OrderMeal(enabled=False, quantity=0))
    dinner: OrderMeal = Field(default_factory=lambda: OrderMeal(enabled=False, quantity=0))
    delivery_user_id: Optional[str] = None
    delivered: bool = False
    hotbox_collected: bool = False
    delivered_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# Support chat
class SupportThread(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    customer_id: str
    last_message_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    last_message_preview: str = ""
    unread_for_customer: int = 0
    unread_for_agent: int = 0
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class SupportMessage(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    thread_id: str
    sender_id: str
    sender_role: Role
    kind: Literal["text", "voice"] = "text"
    text: str = ""
    voice_b64: str = ""  # data URI: "data:audio/mp4;base64,..."
    voice_duration_ms: int = 0
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# Payloads ------------------------------------------------------------------
class SendOtpReq(BaseModel):
    phone: str


class VerifyOtpReq(BaseModel):
    phone: str
    code: str


class UpdateProfileReq(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    notes: Optional[str] = None
    pincode: Optional[str] = None


class OnboardReq(BaseModel):
    name: str
    address: str
    pincode: str
    notes: str = ""
    meals: List[MealKey]
    default_size: SizeKey = "single"
    default_lunch_variant: LunchVariant = "with_rice"
    initial_topup: float = 0.0


class UpdateOrderMealReq(BaseModel):
    meal: MealKey
    enabled: Optional[bool] = None
    size: Optional[SizeKey] = None
    lunch_variant: Optional[LunchVariant] = None


class AdminCreateUserReq(BaseModel):
    phone: str
    name: str
    role: Role = "customer"
    address: str = ""
    pincode: str = ""
    notes: str = ""


class UpdateMenuReq(BaseModel):
    is_holiday: Optional[bool] = None
    breakfast: Optional[MealItem] = None
    lunch: Optional[MealItem] = None
    dinner: Optional[MealItem] = None


class CreatePincodeReq(BaseModel):
    code: str
    area: str = ""


class BulkPincodeReq(BaseModel):
    text: str  # comma/space/newline separated. Optional "code:Area" pairs.


class SendMessageReq(BaseModel):
    kind: Literal["text", "voice"] = "text"
    text: str = ""
    voice_b64: str = ""
    voice_duration_ms: int = 0


class CreditWalletReq(BaseModel):
    amount: float
    reason: str = "Top-up"


class TopupRequestReq(BaseModel):
    amount: float


class UpdatePricingReq(BaseModel):
    breakfast: Optional[float] = None
    lunch: Optional[float] = None
    dinner: Optional[float] = None


# Helpers -------------------------------------------------------------------
def _now_ist() -> datetime:
    return datetime.now(IST)


def _mk_token(user_id: str, role: str) -> str:
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
    return user


def require_role(*roles: Role):
    async def dep(user: dict = Depends(get_current_user)) -> dict:
        if user["role"] not in roles:
            raise HTTPException(403, f"Requires role: {','.join(roles)}")
        return user
    return dep


def _today_ist_date() -> date_cls:
    return _now_ist().date()


def _cutoff_passed_for(target_date_str: str) -> bool:
    target = datetime.strptime(target_date_str, "%Y-%m-%d").date()
    cutoff_day = target - timedelta(days=1)
    cutoff_dt = datetime(cutoff_day.year, cutoff_day.month, cutoff_day.day,
                         CUTOFF_HOUR_LOCAL, 0, 0, tzinfo=IST)
    return _now_ist() >= cutoff_dt


async def _get_pricing() -> dict:
    p = await db.pricing.find_one({"_id": "current"})
    if not p:
        defaults = Pricing().dict()
        defaults["_id"] = "current"
        await db.pricing.insert_one(defaults)
        return Pricing().dict()
    p.pop("_id", None)
    return p


async def _record_wallet_txn(user_id: str, ttype: str, amount: float,
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


async def _debit_for_order(order: dict, by_user_id: str) -> None:
    """Debit the customer's wallet for what was actually delivered."""
    # Idempotency: if a debit txn already exists for this order, skip.
    existing = await db.wallet_txns.find_one(
        {"ref_order_id": order["id"], "type": "debit"}, {"_id": 0})
    if existing:
        return
    pricing = await _get_pricing()
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
        parts.append(f"{label} ₹{int(price)}")
    if total <= 0:
        return
    reason = f"Delivery {order['date']}: " + " · ".join(parts)
    await _record_wallet_txn(order["user_id"], "debit", round(total, 2),
                             reason, ref_order_id=order["id"],
                             by_user_id=by_user_id)
    # Predictive low-balance nudge: post a friendly support message if the
    # customer is now within ~3 days of running out.
    await _maybe_nudge_low_balance(order["user_id"])


async def _maybe_nudge_low_balance(user_id: str) -> None:
    """If the customer's wallet now covers <3 days of meals, post a system
    message into their support thread (de-duped: at most one nudge per day)."""
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user or user.get("role") != "customer":
        return
    bal = float(user.get("wallet_balance", 0.0))
    sub = await db.subscriptions.find_one(
        {"user_id": user_id, "active": True}, {"_id": 0})
    if not sub:
        return
    pricing = await _get_pricing()
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
    # Don't spam: only one auto-nudge per UTC day.
    today_iso = datetime.now(timezone.utc).date().isoformat()
    thread = await _get_or_create_thread(user_id)
    already = await db.support_messages.find_one(
        {"thread_id": thread["id"],
         "sender_role": "agent",
         "text": {"$regex": f"^\\[Auto · {today_iso}\\]"}},
        {"_id": 0},
    )
    if already:
        return
    days_int = max(0, int(days_left))
    if days_int <= 0:
        body = (f"Hi {user.get('name', '').split(' ')[0] or 'there'} — your wallet "
                f"won't cover tomorrow's meals (₹{int(bal)} left). Tap top-up "
                f"and we'll keep the kitchen rolling for you.")
    else:
        body = (f"Hi {user.get('name', '').split(' ')[0] or 'there'} — quick "
                f"heads-up: your wallet covers about {days_int} more "
                f"day{'s' if days_int != 1 else ''} of meals. A small top-up "
                f"now keeps deliveries uninterrupted 💛")
    text = f"[Auto · {today_iso}] {body}"
    # Use the seeded support agent as the sender if available.
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




async def _generate_orders_for_subscription(sub: dict) -> int:
    """Create DailyOrder rows for the next 7 days based on the subscription's
    meals list. Only includes the meals the customer subscribed to. Skips days
    that already have an order for the same user (idempotent).
    """
    today = _today_ist_date()
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
        existing = await db.orders.find_one({"user_id": sub["user_id"], "date": d.isoformat()})
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


# Seed data -----------------------------------------------------------------
WEEKLY_MENU_SEED = [
    {"day_of_week": 0, "is_holiday": True},
    {"day_of_week": 1, "is_holiday": False,
     "breakfast": {"name": "Idli with Sambar & Chutney",
                   "description": "Steamed rice cakes, lentil stew, coconut chutney"},
     "lunch": {"name": "Sambar Rice, Rasam, Beans Poriyal, Curd Rice",
               "description": "Tamil classic thali"},
     "dinner": {"name": "Chapati, Dal Tadka, Mix Veg",
                "description": "Light evening meal"}},
    {"day_of_week": 2, "is_holiday": False,
     "breakfast": {"name": "Pongal & Vada",
                   "description": "Ghee pongal with crisp medu vadai"},
     "lunch": {"name": "Lemon Rice, Vatha Kuzhambu, Appalam, Curd",
               "description": "Tangy Tamil staple"},
     "dinner": {"name": "Dosa, Tomato Chutney, Sambar",
                "description": "Crisp dosa dinner"}},
    {"day_of_week": 3, "is_holiday": False,
     "breakfast": {"name": "Upma with Coconut Chutney", "description": "Semolina with veggies"},
     "lunch": {"name": "Bisi Bele Bath, Boondi Raita, Salad",
               "description": "Tangy spicy rice dish"},
     "dinner": {"name": "Roti, Channa Masala", "description": "North-Indian style"}},
    {"day_of_week": 4, "is_holiday": False,
     "breakfast": {"name": "Adai with Avial", "description": "Mixed-lentil pancake"},
     "lunch": {"name": "Curd Rice, Karuvepillai Podi, Pickle, Banana",
               "description": "Comforting curd-rice meal"},
     "dinner": {"name": "Chapati, Mushroom Masala", "description": "Soft chapatis"}},
    {"day_of_week": 5, "is_holiday": False,
     "breakfast": {"name": "Poha & Filter Coffee", "description": "Flattened rice with peanuts"},
     "lunch": {"name": "Veg Biryani, Onion Raita, Brinjal Curry",
               "description": "Friday special"},
     "dinner": {"name": "Roti, Paneer Butter Masala", "description": "Restaurant-style at home"}},
    {"day_of_week": 6, "is_holiday": False,
     "breakfast": {"name": "Puri Sabzi", "description": "Fried bread with potato curry"},
     "lunch": {"name": "Tamarind Rice, Curd, Vadagam, Sweet",
               "description": "Saturday Tamil special"},
     "dinner": {"name": "Idiyappam with Vegetable Stew", "description": "Light dinner"}},
]


# Chennai pincodes (representative sample of areas served)
CHENNAI_PINCODES = [
    ("600001", "George Town"),
    ("600002", "Anna Salai"),
    ("600004", "Mylapore"),
    ("600005", "Triplicane"),
    ("600006", "Greams Road"),
    ("600010", "Kilpauk"),
    ("600017", "T. Nagar"),
    ("600020", "Adyar"),
    ("600028", "R.A. Puram"),
    ("600040", "Anna Nagar"),
    ("600041", "Thiruvanmiyur"),
    ("600042", "Velachery"),
    ("600045", "Pallavaram"),
    ("600090", "Besant Nagar"),
    ("600096", "Perungudi"),
    ("600100", "Sholinganallur"),
    ("600101", "Anna Nagar West Extn"),
    ("600113", "Taramani"),
]


SEED_USERS = [
    {"phone": "+919000000001", "name": "Owner Admin", "role": "admin",
     "address": "HQ Kitchen, Mylapore, Chennai", "pincode": "600004", "onboarded": True},
    {"phone": "+919000000002", "name": "Ravi Delivery", "role": "delivery",
     "address": "Adyar Hub, Chennai", "pincode": "600020", "onboarded": True},
    {"phone": "+919000000003", "name": "Priya Support", "role": "agent",
     "address": "Customer Care, Chennai", "pincode": "600004", "onboarded": True},
    {"phone": "+919999911111", "name": "Sharma Family", "role": "customer",
     "address": "Flat 302, Green Acres, Adyar, Chennai",
     "pincode": "600020", "notes": "Ring twice", "onboarded": True,
     "wallet_balance": 8500.0},
    {"phone": "+919999922222", "name": "Iyer Family", "role": "customer",
     "address": "Villa 12, Palm Meadows, Velachery, Chennai",
     "pincode": "600042", "notes": "Leave at gate", "onboarded": True,
     "wallet_balance": 3200.0},
    {"phone": "+919999933333", "name": "Khan Family", "role": "customer",
     "address": "House 7, R.A. Puram, Chennai",
     "pincode": "600028", "notes": "Hand to security", "onboarded": True,
     "wallet_balance": 480.0},  # low balance → triggers banner
]


SEED_SUBS = [
    # phone, meals, plan, start_offset_days, default_size, lunch_variant
    ("+919999911111", ["breakfast", "lunch", "dinner"], "month", 0, "couple", "with_rice"),
    ("+919999922222", ["lunch", "dinner"], "month", 0, "single", "without_rice"),
    ("+919999933333", ["lunch"], "week", -5, "single", "with_rice"),  # low balance
]


async def _seed() -> None:
    if await db.users.count_documents({}) == 0:
        for u in SEED_USERS:
            await db.users.insert_one(User(**u).dict())
        log.info("Seeded %d users", len(SEED_USERS))

    if await db.weekly_menu.count_documents({}) == 0:
        for m in WEEKLY_MENU_SEED:
            await db.weekly_menu.insert_one(WeeklyMenu(**m).dict())
        log.info("Seeded weekly menu")

    if await db.pincodes.count_documents({}) == 0:
        for code, area in CHENNAI_PINCODES:
            await db.pincodes.insert_one(Pincode(code=code, area=area).dict())
        log.info("Seeded %d Chennai pincodes", len(CHENNAI_PINCODES))

    today = _today_ist_date()

    # Customer subscriptions
    for phone, meals, plan, start_offset, default_size, lunch_variant in SEED_SUBS:
        c = await db.users.find_one({"phone": phone}, {"_id": 0})
        if not c:
            continue
        existing = await db.subscriptions.find_one({"user_id": c["id"], "active": True})
        if existing:
            continue
        duration = {"day": 1, "week": 7, "month": 30}[plan]
        start = today + timedelta(days=start_offset)
        end = start + timedelta(days=duration - 1)
        sub = Subscription(
            user_id=c["id"], plan_type=plan,
            start_date=start.isoformat(), end_date=end.isoformat(),
            meals=meals,
            default_size=default_size,
            default_lunch_variant=lunch_variant,
            default_quantity=SIZE_TO_QTY[default_size],
        )
        sub_d = sub.dict()
        await db.subscriptions.insert_one(sub_d)
        await _generate_orders_for_subscription(sub_d)

    # Yesterday pickup demo
    delivery = await db.users.find_one({"role": "delivery"}, {"_id": 0})
    sharma = await db.users.find_one({"phone": "+919999911111"}, {"_id": 0})
    if sharma:
        yesterday = today - timedelta(days=1)
        ydow = (yesterday.weekday() + 1) % 7
        y_menu = await db.weekly_menu.find_one({"day_of_week": ydow}, {"_id": 0})
        if y_menu and not y_menu.get("is_holiday"):
            existing = await db.orders.find_one({"user_id": sharma["id"],
                                                 "date": yesterday.isoformat()})
            if not existing:
                o = DailyOrder(
                    user_id=sharma["id"], date=yesterday.isoformat(),
                    breakfast=OrderMeal(enabled=True, quantity=2,
                                        item_name=(y_menu.get("breakfast") or {}).get("name", "")),
                    lunch=OrderMeal(enabled=True, quantity=2,
                                    item_name=(y_menu.get("lunch") or {}).get("name", "")),
                    dinner=OrderMeal(enabled=True, quantity=2,
                                     item_name=(y_menu.get("dinner") or {}).get("name", "")),
                    delivery_user_id=delivery["id"] if delivery else None,
                    delivered=True, hotbox_collected=False,
                    delivered_at=datetime.now(timezone.utc) - timedelta(hours=18),
                )
                await db.orders.insert_one(o.dict())

    log.info("Seed complete")


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------
@api.post("/auth/send-otp")
async def send_otp(req: SendOtpReq):
    phone = req.phone.strip()
    if not phone:
        raise HTTPException(400, "phone required")
    user = await db.users.find_one({"phone": phone}, {"_id": 0})
    if not user:
        new_user = User(phone=phone, role="customer", onboarded=False)
        await db.users.insert_one(new_user.dict())

    code = f"{random.randint(0, 999999):06d}"
    expires = datetime.now(timezone.utc) + timedelta(minutes=10)
    await db.otps.update_one(
        {"phone": phone},
        {"$set": {"phone": phone, "code": code, "expires_at": expires}},
        upsert=True,
    )
    log.info("OTP for %s = %s", phone, code)
    resp = {"sent": True, "phone": phone}
    if DEV_RETURN_OTP:
        resp["dev_otp"] = code
    return resp


@api.post("/auth/verify-otp")
async def verify_otp(req: VerifyOtpReq):
    rec = await db.otps.find_one({"phone": req.phone}, {"_id": 0})
    if not rec:
        raise HTTPException(400, "OTP not requested")
    expires = rec["expires_at"]
    if isinstance(expires, str):
        expires = datetime.fromisoformat(expires)
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if datetime.now(timezone.utc) > expires:
        raise HTTPException(400, "OTP expired")
    if rec["code"] != req.code.strip():
        raise HTTPException(400, "Invalid OTP")
    user = await db.users.find_one({"phone": req.phone}, {"_id": 0})
    if not user:
        raise HTTPException(404, "User not found")
    await db.otps.delete_one({"phone": req.phone})
    token = _mk_token(user["id"], user["role"])
    return {"token": token, "user": user}


@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user


@api.patch("/auth/me")
async def update_me(req: UpdateProfileReq, user: dict = Depends(get_current_user)):
    upd = {k: v for k, v in req.dict().items() if v is not None}
    if upd:
        await db.users.update_one({"id": user["id"]}, {"$set": upd})
    return await db.users.find_one({"id": user["id"]}, {"_id": 0})


# ---------------------------------------------------------------------------
# Onboarding (customer self-signup)
# ---------------------------------------------------------------------------
@api.get("/onboarding/check-pincode/{code}")
async def check_pincode(code: str, _: dict = Depends(get_current_user)):
    p = await db.pincodes.find_one({"code": code, "active": True}, {"_id": 0})
    return {"serviceable": bool(p), "pincode": p}


@api.post("/onboarding/complete")
async def complete_onboarding(req: OnboardReq, user: dict = Depends(get_current_user)):
    if user["role"] != "customer":
        raise HTTPException(403, "Only customers can onboard")
    if not req.meals:
        raise HTTPException(400, "Pick at least one meal")
    if req.default_size not in SIZE_TO_QTY:
        raise HTTPException(400, "Size must be single, couple or family")
    p = await db.pincodes.find_one({"code": req.pincode, "active": True}, {"_id": 0})
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

    # Deactivate previous subs
    await db.subscriptions.update_many(
        {"user_id": user["id"], "active": True}, {"$set": {"active": False}},
    )
    today = _today_ist_date()
    # Wallet model: subscription is just rolling meal preferences. Keep schema
    # compatible by giving it a far-future end date.
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
    await _generate_orders_for_subscription(sub_d)
    sub_d.pop("_id", None)

    # Optional initial wallet top-up.
    if req.initial_topup and req.initial_topup > 0:
        await _record_wallet_txn(user["id"], "credit",
                                 float(req.initial_topup),
                                 reason="Welcome top-up",
                                 by_user_id=user["id"])

    refreshed = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    return {"user": refreshed, "subscription": sub_d}


# ---------------------------------------------------------------------------
# Pincodes
# ---------------------------------------------------------------------------
@api.get("/pincodes")
async def list_pincodes(_: dict = Depends(get_current_user)):
    return await db.pincodes.find({"active": True}, {"_id": 0}).sort("code", 1).to_list(1000)


@api.get("/admin/pincodes")
async def admin_list_pincodes(_: dict = Depends(require_role("admin"))):
    return await db.pincodes.find({}, {"_id": 0}).sort("code", 1).to_list(2000)


@api.post("/admin/pincodes")
async def admin_create_pincode(req: CreatePincodeReq,
                               _: dict = Depends(require_role("admin"))):
    code = req.code.strip()
    if not re.fullmatch(r"\d{6}", code):
        raise HTTPException(400, "Pincode must be 6 digits")
    existing = await db.pincodes.find_one({"code": code}, {"_id": 0})
    if existing:
        await db.pincodes.update_one({"code": code},
                                     {"$set": {"area": req.area, "active": True}})
        return await db.pincodes.find_one({"code": code}, {"_id": 0})
    p = Pincode(code=code, area=req.area)
    await db.pincodes.insert_one(p.dict())
    return p.dict()


@api.post("/admin/pincodes/bulk")
async def admin_bulk_pincodes(req: BulkPincodeReq,
                              _: dict = Depends(require_role("admin"))):
    """Accepts a free-form blob. Each token can be either "600001" or
    "600001:Mylapore" (separator `:` or `-`)."""
    added = 0
    updated = 0
    for raw in re.split(r"[,\n\r]+", req.text):
        raw = raw.strip()
        if not raw:
            continue
        parts = re.split(r"[:\-]", raw, maxsplit=1)
        code = parts[0].strip()
        area = parts[1].strip() if len(parts) > 1 else ""
        if not re.fullmatch(r"\d{6}", code):
            continue
        existing = await db.pincodes.find_one({"code": code}, {"_id": 0})
        if existing:
            await db.pincodes.update_one(
                {"code": code},
                {"$set": {"active": True, "area": area or existing.get("area", "")}},
            )
            updated += 1
        else:
            await db.pincodes.insert_one(Pincode(code=code, area=area).dict())
            added += 1
    return {"added": added, "updated": updated}


@api.delete("/admin/pincodes/{code}")
async def admin_delete_pincode(code: str, _: dict = Depends(require_role("admin"))):
    res = await db.pincodes.update_one({"code": code}, {"$set": {"active": False}})
    if res.matched_count == 0:
        raise HTTPException(404, "Pincode not found")
    return {"deactivated": code}


# ---------------------------------------------------------------------------
# Menu
# ---------------------------------------------------------------------------
@api.get("/menu/week")
async def get_week_menu(_: dict = Depends(get_current_user)):
    return await db.weekly_menu.find({}, {"_id": 0}).sort("day_of_week", 1).to_list(10)


@api.get("/menu/public")
async def get_public_menu():
    """Unauthenticated menu preview for the onboarding flow."""
    return await db.weekly_menu.find({}, {"_id": 0}).sort("day_of_week", 1).to_list(10)


@api.put("/menu/{day_of_week}")
async def update_menu(day_of_week: int, req: UpdateMenuReq,
                      _: dict = Depends(require_role("admin"))):
    if not 0 <= day_of_week <= 6:
        raise HTTPException(400, "day_of_week 0..6")
    upd = {k: (v.dict() if hasattr(v, "dict") else v)
           for k, v in req.dict().items() if v is not None}
    res = await db.weekly_menu.update_one({"day_of_week": day_of_week}, {"$set": upd})
    if res.matched_count == 0:
        raise HTTPException(404, "menu not found")
    return await db.weekly_menu.find_one({"day_of_week": day_of_week}, {"_id": 0})


# ---------------------------------------------------------------------------
# Orders
# ---------------------------------------------------------------------------
@api.get("/orders/upcoming")
async def upcoming_orders(user: dict = Depends(get_current_user)):
    today = _today_ist_date()
    end = today + timedelta(days=7)
    orders = await db.orders.find(
        {"user_id": user["id"], "date": {"$gte": today.isoformat(), "$lt": end.isoformat()}},
        {"_id": 0},
    ).sort("date", 1).to_list(100)
    for o in orders:
        o["cutoff_passed"] = _cutoff_passed_for(o["date"])
    return orders


@api.patch("/orders/{order_id}")
async def modify_order(order_id: str, req: UpdateOrderMealReq,
                       user: dict = Depends(get_current_user)):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(404, "Order not found")
    if order["user_id"] != user["id"] and user["role"] != "admin":
        raise HTTPException(403, "Not your order")
    if _cutoff_passed_for(order["date"]):
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


# ---------------------------------------------------------------------------
# Subscriptions
# ---------------------------------------------------------------------------
@api.get("/subscriptions/me")
async def my_subscription(user: dict = Depends(get_current_user)):
    return await db.subscriptions.find_one(
        {"user_id": user["id"], "active": True}, {"_id": 0})


# ---------------------------------------------------------------------------
# Admin
# ---------------------------------------------------------------------------
@api.get("/admin/users")
async def admin_list_users(_: dict = Depends(require_role("admin"))):
    return await db.users.find({}, {"_id": 0}).to_list(2000)


@api.post("/admin/users")
async def admin_create_user(req: AdminCreateUserReq,
                            _: dict = Depends(require_role("admin"))):
    if await db.users.find_one({"phone": req.phone}, {"_id": 0}):
        raise HTTPException(400, "User already exists")
    u = User(**req.dict(), onboarded=True if req.role != "customer" else False)
    await db.users.insert_one(u.dict())
    return u.dict()


@api.get("/admin/orders")
async def admin_orders(date: Optional[str] = None,
                       _: dict = Depends(require_role("admin"))):
    target = date or _today_ist_date().isoformat()
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


@api.get("/admin/stats")
async def admin_stats(_: dict = Depends(require_role("admin"))):
    today = _today_ist_date().isoformat()
    # Customers with wallet below their threshold (defaults to 500)
    low_pipe = [
        {"$match": {"role": "customer", "onboarded": True}},
        {"$addFields": {
            "_th": {"$ifNull": ["$wallet_threshold", 500.0]},
            "_bal": {"$ifNull": ["$wallet_balance", 0.0]},
        }},
        {"$match": {"$expr": {"$lt": ["$_bal", "$_th"]}}},
        {"$count": "n"},
    ]
    low_cur = db.users.aggregate(low_pipe)
    low_doc = await low_cur.to_list(1)
    wallet_low = (low_doc[0]["n"] if low_doc else 0)

    return {
        "total_customers": await db.users.count_documents({"role": "customer",
                                                            "onboarded": True}),
        "pending_onboarding": await db.users.count_documents({"role": "customer",
                                                               "onboarded": False}),
        "active_subscriptions": await db.subscriptions.count_documents({"active": True}),
        "today_orders": await db.orders.count_documents({"date": today}),
        "delivered_today": await db.orders.count_documents({"date": today, "delivered": True}),
        "pincodes": await db.pincodes.count_documents({"active": True}),
        "wallet_low": wallet_low,
    }


# ---------------------------------------------------------------------------
# Delivery
# ---------------------------------------------------------------------------
@api.get("/delivery/route")
async def delivery_route(date: Optional[str] = None,
                         user: dict = Depends(require_role("delivery", "admin"))):
    target = date or _today_ist_date().isoformat()
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


@api.get("/delivery/pickups")
async def delivery_pickups(user: dict = Depends(require_role("delivery", "admin"))):
    today = _today_ist_date().isoformat()
    query = {"delivered": True, "hotbox_collected": False, "date": {"$lte": today}}
    if user["role"] == "delivery":
        query["delivery_user_id"] = user["id"]
    orders = await db.orders.find(query, {"_id": 0}).sort("date", 1).to_list(2000)
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


@api.post("/delivery/orders/{order_id}/delivered")
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
        # Auto-debit the wallet for what was just delivered.
        order_after = await db.orders.find_one({"id": order_id}, {"_id": 0})
        await _debit_for_order(order_after, by_user_id=user["id"])
    return await db.orders.find_one({"id": order_id}, {"_id": 0})


@api.post("/delivery/orders/{order_id}/hotbox")
async def mark_hotbox(order_id: str,
                      user: dict = Depends(require_role("delivery", "admin"))):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(404, "Order not found")
    if user["role"] == "delivery" and order.get("delivery_user_id") != user["id"]:
        raise HTTPException(403, "Not assigned to you")
    await db.orders.update_one({"id": order_id}, {"$set": {"hotbox_collected": True}})
    return await db.orders.find_one({"id": order_id}, {"_id": 0})


# ---------------------------------------------------------------------------
# Support chat
# ---------------------------------------------------------------------------
async def _get_or_create_thread(customer_id: str) -> dict:
    t = await db.support_threads.find_one({"customer_id": customer_id}, {"_id": 0})
    if t:
        return t
    new = SupportThread(customer_id=customer_id)
    await db.support_threads.insert_one(new.dict())
    return new.dict()


def _preview_for(msg: SupportMessage) -> str:
    return msg.text[:60] if msg.kind == "text" else "🎤 Voice message"


@api.get("/support/me")
async def my_thread(user: dict = Depends(get_current_user)):
    if user["role"] != "customer":
        raise HTTPException(403, "Customers only")
    t = await _get_or_create_thread(user["id"])
    return t


@api.get("/support/threads")
async def list_threads(_: dict = Depends(require_role("agent", "admin"))):
    threads = await db.support_threads.find({}, {"_id": 0}) \
        .sort("last_message_at", -1).to_list(500)
    user_ids = list({t["customer_id"] for t in threads})
    users = await db.users.find({"id": {"$in": user_ids}}, {"_id": 0}).to_list(500)
    umap = {u["id"]: u for u in users}
    for t in threads:
        u = umap.get(t["customer_id"], {})
        t["customer_name"] = u.get("name", "")
        t["customer_phone"] = u.get("phone", "")
        t["customer_pincode"] = u.get("pincode", "")
    return threads


@api.get("/support/threads/{thread_id}/messages")
async def list_messages(thread_id: str, user: dict = Depends(get_current_user)):
    t = await db.support_threads.find_one({"id": thread_id}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Thread not found")
    if user["role"] == "customer" and t["customer_id"] != user["id"]:
        raise HTTPException(403, "Not your thread")
    if user["role"] not in ("customer", "agent", "admin"):
        raise HTTPException(403, "forbidden")
    msgs = await db.support_messages.find({"thread_id": thread_id}, {"_id": 0}) \
        .sort("created_at", 1).to_list(2000)
    # Reset unread for this side
    if user["role"] == "customer":
        await db.support_threads.update_one({"id": thread_id},
                                            {"$set": {"unread_for_customer": 0}})
    else:
        await db.support_threads.update_one({"id": thread_id},
                                            {"$set": {"unread_for_agent": 0}})
    return msgs


@api.post("/support/threads/{thread_id}/messages")
async def send_message(thread_id: str, req: SendMessageReq,
                       user: dict = Depends(get_current_user)):
    t = await db.support_threads.find_one({"id": thread_id}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Thread not found")
    if user["role"] == "customer" and t["customer_id"] != user["id"]:
        raise HTTPException(403, "Not your thread")
    if user["role"] not in ("customer", "agent", "admin"):
        raise HTTPException(403, "forbidden")

    if req.kind == "text" and not req.text.strip():
        raise HTTPException(400, "Message cannot be empty")
    if req.kind == "voice" and not req.voice_b64:
        raise HTTPException(400, "voice_b64 required")
    if req.kind == "voice" and len(req.voice_b64) > 8_000_000:
        raise HTTPException(400, "Voice clip too large (keep < 2 min)")

    msg = SupportMessage(
        thread_id=thread_id, sender_id=user["id"], sender_role=user["role"],
        kind=req.kind, text=req.text.strip(),
        voice_b64=req.voice_b64, voice_duration_ms=req.voice_duration_ms,
    )
    await db.support_messages.insert_one(msg.dict())

    upd = {"last_message_at": msg.created_at,
           "last_message_preview": _preview_for(msg)}
    if user["role"] == "customer":
        upd["$inc"] = {"unread_for_agent": 1}
    else:
        upd["$inc"] = {"unread_for_customer": 1}
    inc = upd.pop("$inc")
    await db.support_threads.update_one({"id": thread_id},
                                        {"$set": upd, "$inc": inc})
    return msg.dict()


@api.get("/support/unread")
async def unread_count(user: dict = Depends(get_current_user)):
    if user["role"] == "customer":
        t = await db.support_threads.find_one({"customer_id": user["id"]}, {"_id": 0})
        return {"unread": (t or {}).get("unread_for_customer", 0)}
    if user["role"] in ("agent", "admin"):
        threads = await db.support_threads.find({}, {"_id": 0}).to_list(2000)
        return {"unread": sum(t.get("unread_for_agent", 0) for t in threads)}
    return {"unread": 0}


# ---------------------------------------------------------------------------
# Wallet
# ---------------------------------------------------------------------------
def _suggest_topups(threshold: float) -> List[int]:
    return [1500, 2000, 3000, 5000]


@api.get("/wallet/me")
async def wallet_me(user: dict = Depends(get_current_user)):
    pricing = await _get_pricing()
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


@api.get("/wallet/pricing")
async def get_pricing_api(_: dict = Depends(get_current_user)):
    return await _get_pricing()


@api.put("/admin/wallet/pricing")
async def update_pricing(req: UpdatePricingReq,
                         _: dict = Depends(require_role("admin"))):
    upd = {k: v for k, v in req.dict().items() if v is not None}
    if not upd:
        raise HTTPException(400, "Nothing to update")
    await db.pricing.update_one({"_id": "current"}, {"$set": upd}, upsert=True)
    return await _get_pricing()


@api.post("/wallet/topup-request")
async def request_topup(req: TopupRequestReq,
                        user: dict = Depends(get_current_user)):
    if user["role"] != "customer":
        raise HTTPException(403, "Customers only")
    if req.amount <= 0:
        raise HTTPException(400, "Amount must be positive")
    thread = await _get_or_create_thread(user["id"])
    msg = SupportMessage(
        thread_id=thread["id"], sender_id=user["id"], sender_role="customer",
        kind="text",
        text=f"Hi — I'd like to top up ₹{int(req.amount)} to my wallet. "
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


@api.post("/admin/wallet/{user_id}/credit")
async def admin_credit(user_id: str, req: CreditWalletReq,
                       actor: dict = Depends(require_role("admin", "agent"))):
    if req.amount <= 0:
        raise HTTPException(400, "Amount must be positive")
    return await _record_wallet_txn(user_id, "credit", req.amount,
                                    req.reason, by_user_id=actor["id"])


@api.get("/admin/wallet/transactions")
async def admin_txns(user_id: Optional[str] = None,
                     _: dict = Depends(require_role("admin", "agent"))):
    q = {"user_id": user_id} if user_id else {}
    txns = await db.wallet_txns.find(q, {"_id": 0}) \
        .sort("created_at", -1).limit(500).to_list(500)
    return txns


@api.get("/admin/wallet/customers")
async def admin_wallet_customers(_: dict = Depends(require_role("admin", "agent"))):
    customers = await db.users.find(
        {"role": "customer"}, {"_id": 0}).sort("name", 1).to_list(2000)
    return customers


# ---------------------------------------------------------------------------
@api.get("/")
async def root():
    return {"app": "home-tiffin", "status": "ok", "city": "Chennai"}


app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def on_startup():
    await _seed()


@app.on_event("shutdown")
async def on_shutdown():
    client.close()
