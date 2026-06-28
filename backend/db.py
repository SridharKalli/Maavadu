"""Shared configuration and the Motor MongoDB client.

All routers and helpers import from here so that there is exactly one place
that owns environment variables and the database handle.
"""

import os
from datetime import timezone, timedelta
from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET = os.environ.get("JWT_SECRET",
                            "tiffin-dev-secret-please-change-at-least-32b")
JWT_ALG = "HS256"
JWT_EXP_DAYS = 30
DEV_RETURN_OTP = True
CUTOFF_HOUR_LOCAL = 20
IST = timezone(timedelta(hours=5, minutes=30))

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]
