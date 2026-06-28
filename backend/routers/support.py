from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from db import db
from helpers import (
    get_current_user, get_or_create_thread, preview_for, record_wallet_txn,
    require_role,
)
from models import SendMessageReq, SupportMessage

router = APIRouter()


@router.get("/support/contact")
async def support_contact(_: dict = Depends(get_current_user)):
    """Public-to-customers info: who to talk to and where."""
    agent = await db.users.find_one({"role": "agent"}, {"_id": 0})
    if not agent:
        return {"name": "Support", "phone": "", "available": "10am – 8pm"}
    return {
        "name": agent.get("name", "Support"),
        "phone": agent.get("phone", ""),
        "available": "10am – 8pm IST · all 7 days",
    }


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
        t["customer_last_seen"] = u.get("last_seen_at")
    return threads


@router.get("/support/customers")
async def support_customers(_: dict = Depends(require_role("agent", "admin"))):
    """Customer roster for agents — includes last-seen and existing thread id
    so the agent can start a new conversation with anyone."""
    customers = await db.users.find(
        {"role": "customer"}, {"_id": 0}).sort("name", 1).to_list(2000)
    threads = await db.support_threads.find({}, {"_id": 0}).to_list(2000)
    tmap = {t["customer_id"]: t["id"] for t in threads}
    for c in customers:
        c["thread_id"] = tmap.get(c["id"])
    return customers


@router.post("/support/start")
async def start_thread(customer_id: str,
                       _: dict = Depends(require_role("agent", "admin"))):
    """Idempotent — returns the existing thread or creates a new one for
    the given customer so the agent can drop the first message."""
    customer = await db.users.find_one({"id": customer_id}, {"_id": 0})
    if not customer or customer.get("role") != "customer":
        raise HTTPException(404, "Customer not found")
    return await get_or_create_thread(customer_id)


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



# ---------------------------------------------------------------------------
# Topup-request actions (inline Approve / Reject buttons in chat)
# ---------------------------------------------------------------------------
async def _action_topup(message_id: str, action: str, actor: dict) -> dict:
    msg = await db.support_messages.find_one({"id": message_id}, {"_id": 0})
    if not msg:
        raise HTTPException(404, "Message not found")
    meta = dict(msg.get("meta") or {})
    if meta.get("type") != "topup_request":
        raise HTTPException(400, "Not a top-up request message")
    if meta.get("status") != "pending":
        raise HTTPException(400,
                            f"Already {meta.get('status', 'actioned')}")
    thread = await db.support_threads.find_one(
        {"id": msg["thread_id"]}, {"_id": 0})
    if not thread:
        raise HTTPException(404, "Thread not found")
    customer_id = thread["customer_id"]
    amount = float(meta.get("amount") or 0)

    new_balance = None
    if action == "approve":
        if amount <= 0:
            raise HTTPException(400, "Invalid amount on request")
        result = await record_wallet_txn(
            customer_id, "credit", amount,
            reason="Top-up confirmed via chat",
            by_user_id=actor["id"])
        new_balance = result["balance"]
        confirm_text = (
            f"\u2705 Top-up of \u20b9{int(amount)} confirmed. New balance: "
            f"\u20b9{int(new_balance)}.")
    else:
        confirm_text = (
            f"\u274c Top-up request for \u20b9{int(amount)} was not "
            f"approved. Please reach out if this seems wrong.")

    meta["status"] = "approved" if action == "approve" else "rejected"
    meta["actioned_by"] = actor["id"]
    meta["actioned_at"] = datetime.now(timezone.utc).isoformat()
    await db.support_messages.update_one(
        {"id": message_id}, {"$set": {"meta": meta}})

    follow = SupportMessage(
        thread_id=msg["thread_id"], sender_id=actor["id"],
        sender_role=actor["role"], kind="text", text=confirm_text,
        meta={"type": "topup_action", "amount": amount,
              "status": meta["status"]},
    )
    await db.support_messages.insert_one(follow.dict())
    await db.support_threads.update_one(
        {"id": msg["thread_id"]},
        {"$set": {"last_message_at": follow.created_at,
                  "last_message_preview": confirm_text[:60]},
         "$inc": {"unread_for_customer": 1}},
    )
    return {"status": meta["status"], "balance": new_balance,
            "message_id": message_id, "follow_id": follow.id}


@router.post("/support/messages/{message_id}/topup-approve")
async def approve_topup(message_id: str,
                        actor: dict = Depends(require_role("admin", "agent"))):
    return await _action_topup(message_id, "approve", actor)


@router.post("/support/messages/{message_id}/topup-reject")
async def reject_topup(message_id: str,
                       actor: dict = Depends(require_role("admin", "agent"))):
    return await _action_topup(message_id, "reject", actor)
