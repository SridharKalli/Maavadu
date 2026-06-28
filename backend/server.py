"""Home Tiffin Service backend.

Phone/OTP authentication (dev mode: OTP is returned in the response — no
SMS provider yet). JWT tokens carry role (customer/admin/delivery).
"""

import os
import uuid
import random
import logging
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
# Config
# ---------------------------------------------------------------------------
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET = os.environ.get("JWT_SECRET", "tiffin-dev-secret-change-me")
JWT_ALG = "HS256"
JWT_EXP_DAYS = 30
DEV_RETURN_OTP = True  # dev mode: return OTP in API response
CUTOFF_HOUR_LOCAL = 20  # 8 PM
TZ_OFFSET_HOURS = 5.5  # IST

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
Role = Literal["customer", "admin", "delivery"]
MealKey = Literal["breakfast", "lunch", "dinner"]
PlanType = Literal["day", "week", "month"]


class User(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    phone: str
    name: str = ""
    role: Role = "customer"
    address: str = ""
    notes: str = ""  # delivery notes / landmark
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class OtpRecord(BaseModel):
    phone: str
    code: str
    expires_at: datetime


class MealItem(BaseModel):
    name: str
    description: str = ""


class WeeklyMenu(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    day_of_week: int  # 0=Sun (holiday) ... 6=Sat
    is_holiday: bool = False
    breakfast: Optional[MealItem] = None
    lunch: Optional[MealItem] = None
    dinner: Optional[MealItem] = None


class Subscription(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    plan_type: PlanType
    meals: List[MealKey] = ["breakfast", "lunch", "dinner"]
    default_quantity: int = 1
    start_date: str  # YYYY-MM-DD
    end_date: str
    active: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class OrderMeal(BaseModel):
    enabled: bool = True
    quantity: int = 1
    item_name: str = ""


class DailyOrder(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    date: str  # YYYY-MM-DD
    breakfast: OrderMeal = Field(default_factory=OrderMeal)
    lunch: OrderMeal = Field(default_factory=OrderMeal)
    dinner: OrderMeal = Field(default_factory=OrderMeal)
    delivery_user_id: Optional[str] = None
    delivered: bool = False
    hotbox_collected: bool = False
    delivered_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# Request / response payloads ------------------------------------------------
class SendOtpReq(BaseModel):
    phone: str


class VerifyOtpReq(BaseModel):
    phone: str
    code: str


class UpdateProfileReq(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    notes: Optional[str] = None


class UpdateOrderMealReq(BaseModel):
    meal: MealKey
    enabled: Optional[bool] = None
    quantity: Optional[int] = None


class AdminCreateUserReq(BaseModel):
    phone: str
    name: str
    role: Role = "customer"
    address: str = ""
    notes: str = ""


class UpdateMenuReq(BaseModel):
    is_holiday: Optional[bool] = None
    breakfast: Optional[MealItem] = None
    lunch: Optional[MealItem] = None
    dinner: Optional[MealItem] = None


class CreateSubscriptionReq(BaseModel):
    user_id: str
    plan_type: PlanType
    start_date: str
    meals: List[MealKey] = ["breakfast", "lunch", "dinner"]
    default_quantity: int = 1


class AssignDeliveryReq(BaseModel):
    order_ids: List[str]
    delivery_user_id: str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _now_ist() -> datetime:
    return datetime.now(IST)


def _doc(d: dict) -> dict:
    """Strip Mongo _id."""
    d.pop("_id", None)
    return d


def _mk_token(user_id: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(days=JWT_EXP_DAYS),
    }
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
    """Return True if we are past 8 PM IST of the day before target_date."""
    target = datetime.strptime(target_date_str, "%Y-%m-%d").date()
    cutoff_day = target - timedelta(days=1)
    cutoff_dt = datetime(cutoff_day.year, cutoff_day.month, cutoff_day.day,
                         CUTOFF_HOUR_LOCAL, 0, 0, tzinfo=IST)
    return _now_ist() >= cutoff_dt


# ---------------------------------------------------------------------------
# Seed data
# ---------------------------------------------------------------------------
WEEKLY_MENU_SEED = [
    {"day_of_week": 0, "is_holiday": True, "breakfast": None, "lunch": None, "dinner": None},
    {"day_of_week": 1, "is_holiday": False,
     "breakfast": {"name": "Poha", "description": "Flattened rice with peanuts & curry leaves"},
     "lunch": {"name": "Dal Tadka, Jeera Rice, Chapati, Aloo Gobi", "description": "North Indian thali"},
     "dinner": {"name": "Rajma Chawal", "description": "Kidney bean curry with steamed rice"}},
    {"day_of_week": 2, "is_holiday": False,
     "breakfast": {"name": "Idli & Sambar", "description": "Steamed rice cakes with lentil stew"},
     "lunch": {"name": "Sambar Rice, Curd Rice, Beans Poriyal", "description": "South Indian thali"},
     "dinner": {"name": "Roti, Mix Veg, Dal Fry", "description": "Light home dinner"}},
    {"day_of_week": 3, "is_holiday": False,
     "breakfast": {"name": "Upma", "description": "Semolina with veggies"},
     "lunch": {"name": "Chole Bhature", "description": "Chickpea curry with fluffy bread"},
     "dinner": {"name": "Paneer Butter Masala, Roti, Salad", "description": "Restaurant-style at home"}},
    {"day_of_week": 4, "is_holiday": False,
     "breakfast": {"name": "Aloo Paratha & Curd", "description": "Stuffed flatbread, fresh curd"},
     "lunch": {"name": "Veg Pulao, Raita, Dal Fry", "description": "Aromatic rice meal"},
     "dinner": {"name": "Khichdi & Papad", "description": "Comforting lentil-rice porridge"}},
    {"day_of_week": 5, "is_holiday": False,
     "breakfast": {"name": "Masala Dosa", "description": "Crisp rice crepe with potato masala"},
     "lunch": {"name": "Bisi Bele Bath, Curd, Pickle", "description": "Karnataka special"},
     "dinner": {"name": "Roti, Bhindi Masala, Dal", "description": "Simple ghar-ka-khana"}},
    {"day_of_week": 6, "is_holiday": False,
     "breakfast": {"name": "Puri Sabzi", "description": "Fried bread with potato curry"},
     "lunch": {"name": "Veg Biryani, Mirchi Salan, Raita", "description": "Saturday special biryani"},
     "dinner": {"name": "Dosa & Chutney", "description": "Light south-style dinner"}},
]


SEED_USERS = [
    {"phone": "+919000000001", "name": "Owner Admin", "role": "admin", "address": "HQ Kitchen, Bangalore"},
    {"phone": "+919000000002", "name": "Ravi Delivery", "role": "delivery", "address": "Indiranagar Hub"},
    {"phone": "+919999911111", "name": "Sharma Family", "role": "customer",
     "address": "Flat 302, Green Acres, Indiranagar, Bangalore", "notes": "Ring twice"},
    {"phone": "+919999922222", "name": "Iyer Family", "role": "customer",
     "address": "Villa 12, Palm Meadows, Whitefield, Bangalore", "notes": "Leave at gate"},
    {"phone": "+919999933333", "name": "Khan Family", "role": "customer",
     "address": "House 7, Cooke Town, Bangalore", "notes": "Hand to security"},
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

    # Subscriptions + orders for customers — start today, end +30 days
    customers = await db.users.find({"role": "customer"}, {"_id": 0}).to_list(1000)
    delivery = await db.users.find_one({"role": "delivery"}, {"_id": 0})
    today = _today_ist_date()
    end = today + timedelta(days=29)

    for c in customers:
        existing = await db.subscriptions.find_one({"user_id": c["id"], "active": True})
        if existing:
            continue
        sub = Subscription(
            user_id=c["id"], plan_type="month",
            start_date=today.isoformat(), end_date=end.isoformat(),
            meals=["breakfast", "lunch", "dinner"], default_quantity=1,
        )
        await db.subscriptions.insert_one(sub.dict())

    # Generate 7 days of daily orders if not present (skip Sundays).
    # Also seed one "yesterday delivered, hotbox not collected" entry so the
    # delivery person sees a pending pickup demo.
    yesterday = today - timedelta(days=1)
    yesterday_dow = (yesterday.weekday() + 1) % 7
    y_menu = await db.weekly_menu.find_one({"day_of_week": yesterday_dow}, {"_id": 0})
    if customers and y_menu and not y_menu.get("is_holiday"):
        c = customers[0]
        existing = await db.orders.find_one({"user_id": c["id"], "date": yesterday.isoformat()})
        if not existing:
            await db.orders.insert_one(DailyOrder(
                user_id=c["id"], date=yesterday.isoformat(),
                breakfast=OrderMeal(enabled=True, quantity=2,
                                    item_name=(y_menu.get("breakfast") or {}).get("name", "")),
                lunch=OrderMeal(enabled=True, quantity=2,
                                item_name=(y_menu.get("lunch") or {}).get("name", "")),
                dinner=OrderMeal(enabled=True, quantity=2,
                                 item_name=(y_menu.get("dinner") or {}).get("name", "")),
                delivery_user_id=delivery["id"] if delivery else None,
                delivered=True, hotbox_collected=False,
                delivered_at=datetime.now(timezone.utc) - timedelta(hours=18),
            ).dict())

    for offset in range(7):
        d = today + timedelta(days=offset)
        dow = (d.weekday() + 1) % 7  # python: Mon=0..Sun=6 -> Sun=0..Sat=6
        menu = await db.weekly_menu.find_one({"day_of_week": dow}, {"_id": 0})
        if not menu or menu.get("is_holiday"):
            continue
        for c in customers:
            existing = await db.orders.find_one({"user_id": c["id"], "date": d.isoformat()})
            if existing:
                continue
            order = DailyOrder(
                user_id=c["id"],
                date=d.isoformat(),
                breakfast=OrderMeal(enabled=True, quantity=1,
                                    item_name=(menu["breakfast"] or {}).get("name", "")),
                lunch=OrderMeal(enabled=True, quantity=1,
                                item_name=(menu["lunch"] or {}).get("name", "")),
                dinner=OrderMeal(enabled=True, quantity=1,
                                 item_name=(menu["dinner"] or {}).get("name", "")),
                delivery_user_id=delivery["id"] if delivery else None,
            )
            await db.orders.insert_one(order.dict())
    log.info("Seed complete")


# ---------------------------------------------------------------------------
# Auth routes
# ---------------------------------------------------------------------------
@api.post("/auth/send-otp")
async def send_otp(req: SendOtpReq):
    phone = req.phone.strip()
    if not phone:
        raise HTTPException(400, "phone required")

    # Auto-create customer on first login
    user = await db.users.find_one({"phone": phone}, {"_id": 0})
    if not user:
        new_user = User(phone=phone, name="", role="customer")
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
# Menu
# ---------------------------------------------------------------------------
@api.get("/menu/week")
async def get_week_menu(_: dict = Depends(get_current_user)):
    items = await db.weekly_menu.find({}, {"_id": 0}).sort("day_of_week", 1).to_list(10)
    return items


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
# Orders (customer)
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


@api.get("/orders/today")
async def today_order(user: dict = Depends(get_current_user)):
    today = _today_ist_date().isoformat()
    order = await db.orders.find_one({"user_id": user["id"], "date": today}, {"_id": 0})
    if order:
        order["cutoff_passed"] = True
    return order


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

    meal = order[req.meal]
    if req.enabled is not None:
        meal["enabled"] = req.enabled
    if req.quantity is not None:
        if req.quantity < 0 or req.quantity > 3:
            raise HTTPException(400, "Members per meal must be 0..3")
        meal["quantity"] = req.quantity
    await db.orders.update_one({"id": order_id}, {"$set": {req.meal: meal}})
    return await db.orders.find_one({"id": order_id}, {"_id": 0})


# ---------------------------------------------------------------------------
# Subscriptions
# ---------------------------------------------------------------------------
@api.get("/subscriptions/me")
async def my_subscription(user: dict = Depends(get_current_user)):
    sub = await db.subscriptions.find_one(
        {"user_id": user["id"], "active": True}, {"_id": 0}
    )
    return sub


@api.post("/subscriptions")
async def create_subscription(req: CreateSubscriptionReq,
                              actor: dict = Depends(get_current_user)):
    if actor["role"] != "admin" and actor["id"] != req.user_id:
        raise HTTPException(403, "forbidden")
    start = datetime.strptime(req.start_date, "%Y-%m-%d").date()
    duration = {"day": 1, "week": 7, "month": 30}[req.plan_type]
    end = start + timedelta(days=duration - 1)
    sub = Subscription(
        user_id=req.user_id, plan_type=req.plan_type,
        start_date=start.isoformat(), end_date=end.isoformat(),
        meals=req.meals, default_quantity=req.default_quantity,
    )
    await db.subscriptions.update_many({"user_id": req.user_id, "active": True},
                                       {"$set": {"active": False}})
    await db.subscriptions.insert_one(sub.dict())
    return sub.dict()


# ---------------------------------------------------------------------------
# Admin
# ---------------------------------------------------------------------------
@api.get("/admin/users")
async def admin_list_users(_: dict = Depends(require_role("admin"))):
    return await db.users.find({}, {"_id": 0}).to_list(1000)


@api.post("/admin/users")
async def admin_create_user(req: AdminCreateUserReq,
                            _: dict = Depends(require_role("admin"))):
    existing = await db.users.find_one({"phone": req.phone}, {"_id": 0})
    if existing:
        raise HTTPException(400, "User already exists")
    u = User(**req.dict())
    await db.users.insert_one(u.dict())
    return u.dict()


@api.get("/admin/orders")
async def admin_orders(date: Optional[str] = None,
                       _: dict = Depends(require_role("admin"))):
    target = date or _today_ist_date().isoformat()
    orders = await db.orders.find({"date": target}, {"_id": 0}).to_list(1000)
    # join user info
    user_ids = list({o["user_id"] for o in orders})
    users = await db.users.find({"id": {"$in": user_ids}}, {"_id": 0}).to_list(1000)
    umap = {u["id"]: u for u in users}
    for o in orders:
        u = umap.get(o["user_id"], {})
        o["customer_name"] = u.get("name", "")
        o["customer_address"] = u.get("address", "")
        o["customer_phone"] = u.get("phone", "")
    return orders


@api.post("/admin/orders/assign")
async def admin_assign(req: AssignDeliveryReq,
                       _: dict = Depends(require_role("admin"))):
    res = await db.orders.update_many(
        {"id": {"$in": req.order_ids}},
        {"$set": {"delivery_user_id": req.delivery_user_id}},
    )
    return {"updated": res.modified_count}


@api.get("/admin/stats")
async def admin_stats(_: dict = Depends(require_role("admin"))):
    today = _today_ist_date().isoformat()
    total_customers = await db.users.count_documents({"role": "customer"})
    today_orders = await db.orders.count_documents({"date": today})
    delivered_today = await db.orders.count_documents({"date": today, "delivered": True})
    active_subs = await db.subscriptions.count_documents({"active": True})
    return {
        "total_customers": total_customers,
        "active_subscriptions": active_subs,
        "today_orders": today_orders,
        "delivered_today": delivered_today,
    }


# ---------------------------------------------------------------------------
# Delivery routes
# ---------------------------------------------------------------------------
@api.get("/delivery/route")
async def delivery_route(date: Optional[str] = None,
                         user: dict = Depends(require_role("delivery", "admin"))):
    target = date or _today_ist_date().isoformat()
    query = {"date": target}
    if user["role"] == "delivery":
        query["delivery_user_id"] = user["id"]
    orders = await db.orders.find(query, {"_id": 0}).to_list(1000)
    user_ids = list({o["user_id"] for o in orders})
    customers = await db.users.find({"id": {"$in": user_ids}}, {"_id": 0}).to_list(1000)
    umap = {u["id"]: u for u in customers}
    out = []
    for o in orders:
        u = umap.get(o["user_id"], {})
        # Count meals + skip orders where everything is disabled or qty=0
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
            "total_quantity": total_qty,
        })
    out.sort(key=lambda r: r["customer_address"])
    return out


@api.get("/delivery/pickups")
async def delivery_pickups(user: dict = Depends(require_role("delivery", "admin"))):
    """Empty hotboxes still pending pick-up from previous days.

    Convention: a hotbox is left at the customer's place on delivery and must
    be collected before the next drop. So we surface every past-or-today order
    that was delivered but the box has not yet been collected.
    """
    today = _today_ist_date().isoformat()
    query = {"delivered": True, "hotbox_collected": False, "date": {"$lte": today}}
    if user["role"] == "delivery":
        query["delivery_user_id"] = user["id"]
    orders = await db.orders.find(query, {"_id": 0}).sort("date", 1).to_list(1000)
    user_ids = list({o["user_id"] for o in orders})
    customers = await db.users.find({"id": {"$in": user_ids}}, {"_id": 0}).to_list(1000)
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
    await db.orders.update_one(
        {"id": order_id},
        {"$set": {"delivered": True, "delivered_at": datetime.now(timezone.utc)}},
    )
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
# Misc
# ---------------------------------------------------------------------------
@api.get("/")
async def root():
    return {"app": "home-tiffin", "status": "ok"}


@api.get("/cutoff")
async def cutoff_info(_: dict = Depends(get_current_user)):
    now = _now_ist()
    tomorrow = (_today_ist_date() + timedelta(days=1)).isoformat()
    today_cutoff = datetime(now.year, now.month, now.day, CUTOFF_HOUR_LOCAL, 0, tzinfo=IST)
    return {
        "now_ist": now.isoformat(),
        "today_cutoff_8pm_ist": today_cutoff.isoformat(),
        "tomorrow_date": tomorrow,
        "cutoff_passed_for_tomorrow": _cutoff_passed_for(tomorrow),
    }


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
