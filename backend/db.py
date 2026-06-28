"""Shared configuration and the Motor MongoDB client.

All routers and helpers import from here so that there is exactly one place
that owns environment variables and the database handle.
"""

import logging
import os
import secrets
from datetime import timezone, timedelta
from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

log = logging.getLogger("tiffin")

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]

# JWT — fail loudly if no real secret is provided in production. We generate
# a strong per-process secret as a safety net so JWTs can't be forged with the
# old default committed to source.
_DEFAULT_DEV_SECRET = "tiffin-dev-secret-please-change-at-least-32b"
_env_secret = os.environ.get("JWT_SECRET", "").strip()
if _env_secret and _env_secret != _DEFAULT_DEV_SECRET and len(_env_secret) >= 32:
    JWT_SECRET = _env_secret
elif os.environ.get("DEV_MODE", "1") == "1":
    JWT_SECRET = _DEFAULT_DEV_SECRET
    log.warning("JWT_SECRET unset or weak — using DEV default. Set a 32+ byte "
                "JWT_SECRET in env before production deploys.")
else:
    # In prod with no real secret, prefer randomness over the committed dev key.
    JWT_SECRET = secrets.token_urlsafe(48)
    log.error("JWT_SECRET is missing in production. Generated an ephemeral "
              "secret — all existing tokens will be invalidated on restart.")

JWT_ALG = "HS256"
JWT_EXP_DAYS = 30

# Whether /auth/send-otp echoes the OTP back in the response payload. Defaults
# to TRUE in DEV_MODE (so the in-app banner works), FALSE everywhere else.
DEV_RETURN_OTP = (
    os.environ.get("DEV_RETURN_OTP",
                   "1" if os.environ.get("DEV_MODE", "1") == "1" else "0") == "1"
)

# CORS — comma-separated list of allowed origins.
# Production default is the marketing/app domain. In DEV_MODE we relax to "*"
# so the Expo dev server and tooling can talk to the API freely.
_default_cors = "*" if os.environ.get("DEV_MODE", "1") == "1" else "https://maavadu.in"
CORS_ALLOWED_ORIGINS = [
    o.strip() for o in os.environ.get("CORS_ALLOWED_ORIGINS", _default_cors).split(",")
    if o.strip()
] or [_default_cors]

# OTP throttle — sliding window. Production defaults to 3 requests / 60s per
# phone. In DEV (where the OTP is echoed in the response) we relax to 100/60
# so pytest reruns / Expo dev loops don't trip the limit during development.
_dev = os.environ.get("DEV_MODE", "1") == "1"
OTP_RATE_MAX = int(os.environ.get("OTP_RATE_MAX", "100" if _dev else "3"))
OTP_RATE_WINDOW_SECONDS = int(os.environ.get("OTP_RATE_WINDOW_SECONDS", "60"))

CUTOFF_HOUR_LOCAL = 20
IST = timezone(timedelta(hours=5, minutes=30))

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]


async def ensure_indexes() -> None:
    """Idempotent — create indexes that matter at small/medium scale."""
    await db.users.create_index("phone", unique=True)
    await db.users.create_index("role")
    await db.users.create_index("last_seen_at")
    await db.orders.create_index([("user_id", 1), ("date", 1)], unique=True)
    await db.orders.create_index("date")
    await db.orders.create_index([("delivery_user_id", 1), ("date", 1)])
    await db.wallet_txns.create_index([("user_id", 1), ("created_at", -1)])
    await db.wallet_txns.create_index("ref_order_id")
    await db.support_messages.create_index([("thread_id", 1), ("created_at", 1)])
    await db.support_messages.create_index("sender_role")
    await db.support_threads.create_index("customer_id", unique=True)
    await db.pincodes.create_index("code", unique=True)
    await db.subscriptions.create_index([("user_id", 1), ("active", 1)])
    await db.otps.create_index("phone", unique=True)
    log.info("Mongo indexes ensured")
