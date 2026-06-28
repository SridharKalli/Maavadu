"""Idempotent startup seed for users, weekly menu, pincodes and a demo
subscription + yesterday pickup demo for the delivery route.
"""

import logging
from datetime import datetime, timedelta, timezone

from db import db
from helpers import generate_orders_for_subscription, today_ist_date
from models import (
    DailyOrder, OrderMeal, Pincode, Subscription, User, WeeklyMenu,
    SIZE_TO_QTY,
)

log = logging.getLogger("tiffin")


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
     "wallet_balance": 480.0},
]


SEED_SUBS = [
    ("+919999911111", ["breakfast", "lunch", "dinner"], "month", 0, "couple", "with_rice"),
    ("+919999922222", ["lunch", "dinner"], "month", 0, "single", "without_rice"),
    ("+919999933333", ["lunch"], "week", -5, "single", "with_rice"),
]


async def run_seed() -> None:
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

    today = today_ist_date()

    for phone, meals, plan, start_offset, default_size, lunch_variant in SEED_SUBS:
        c = await db.users.find_one({"phone": phone}, {"_id": 0})
        if not c:
            continue
        existing = await db.subscriptions.find_one(
            {"user_id": c["id"], "active": True})
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
        await generate_orders_for_subscription(sub_d)

    delivery = await db.users.find_one({"role": "delivery"}, {"_id": 0})
    sharma = await db.users.find_one({"phone": "+919999911111"}, {"_id": 0})
    if sharma:
        yesterday = today - timedelta(days=1)
        ydow = (yesterday.weekday() + 1) % 7
        y_menu = await db.weekly_menu.find_one({"day_of_week": ydow}, {"_id": 0})
        if y_menu and not y_menu.get("is_holiday"):
            existing = await db.orders.find_one(
                {"user_id": sharma["id"], "date": yesterday.isoformat()})
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
