"""Home Tiffin Service backend \u2014 Chennai edition.

FastAPI entry point. Configuration, the Mongo client and helpers live in
sibling modules; this file only wires the router tree together, applies the
CORS middleware, and registers the startup seed.
"""

import logging

from fastapi import APIRouter, FastAPI
from starlette.middleware.cors import CORSMiddleware

from db import client, CORS_ALLOWED_ORIGINS, ensure_indexes
from routers import (
    admin, auth, delivery, menu, onboarding, orders, pincodes,
    subscriptions, support, wallet,
)
from seed import run_seed

logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("tiffin")

app = FastAPI(title="Home Tiffin API")
api = APIRouter(prefix="/api")

for mod in (auth, onboarding, pincodes, menu, orders, subscriptions,
            admin, delivery, support, wallet):
    api.include_router(mod.router)


@api.get("/")
async def root():
    return {"app": "home-tiffin", "status": "ok", "city": "Chennai"}


app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=CORS_ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def on_startup():
    await ensure_indexes()
    await run_seed()


@app.on_event("shutdown")
async def on_shutdown():
    client.close()
