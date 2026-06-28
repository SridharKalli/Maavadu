from fastapi import APIRouter, Depends, HTTPException

from db import db
from helpers import get_current_user, get_or_create_thread, preview_for, require_role
from models import SendMessageReq, SupportMessage

router = APIRouter()


@router.get("/support/me")
async def my_thread(user: dict = Depends(get_current_user)):
    if user["role"] != "customer":
        raise HTTPException(403, "Customers only")
    return await get_or_create_thread(user["id"])


@router.get("/support/threads")
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


@router.get("/support/threads/{thread_id}/messages")
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
    if user["role"] == "customer":
        await db.support_threads.update_one(
            {"id": thread_id}, {"$set": {"unread_for_customer": 0}})
    else:
        await db.support_threads.update_one(
            {"id": thread_id}, {"$set": {"unread_for_agent": 0}})
    return msgs


@router.post("/support/threads/{thread_id}/messages")
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
           "last_message_preview": preview_for(msg)}
    if user["role"] == "customer":
        inc = {"unread_for_agent": 1}
    else:
        inc = {"unread_for_customer": 1}
    await db.support_threads.update_one(
        {"id": thread_id}, {"$set": upd, "$inc": inc})
    return msg.dict()


@router.get("/support/unread")
async def unread_count(user: dict = Depends(get_current_user)):
    if user["role"] == "customer":
        t = await db.support_threads.find_one(
            {"customer_id": user["id"]}, {"_id": 0})
        return {"unread": (t or {}).get("unread_for_customer", 0)}
    if user["role"] in ("agent", "admin"):
        threads = await db.support_threads.find({}, {"_id": 0}).to_list(2000)
        return {"unread": sum(t.get("unread_for_agent", 0) for t in threads)}
    return {"unread": 0}
