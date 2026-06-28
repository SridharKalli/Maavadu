import logging
import random
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException

from db import db, DEV_RETURN_OTP
from helpers import get_current_user, mk_token
from models import SendOtpReq, UpdateProfileReq, User, VerifyOtpReq

router = APIRouter()
log = logging.getLogger("tiffin")


@router.post("/auth/send-otp")
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


@router.post("/auth/verify-otp")
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
    token = mk_token(user["id"], user["role"])
    return {"token": token, "user": user}


@router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user


@router.patch("/auth/me")
async def update_me(req: UpdateProfileReq, user: dict = Depends(get_current_user)):
    upd = {k: v for k, v in req.dict().items() if v is not None}
    if upd:
        await db.users.update_one({"id": user["id"]}, {"$set": upd})
    return await db.users.find_one({"id": user["id"]}, {"_id": 0})
