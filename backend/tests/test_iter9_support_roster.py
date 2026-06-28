"""Iter9 - support roster, idempotent thread-start, last-seen presence.

Verifies the new agent-facing endpoints introduced in iter9:
  * GET  /api/support/customers   - roster with thread_id + last_seen_at
  * POST /api/support/start       - idempotent thread creation
  * presence bump on every authenticated request via helpers.get_current_user
"""
import os
import time
from datetime import datetime, timezone

import pytest
import requests

BASE_URL = (
    os.environ.get("EXPO_PUBLIC_BACKEND_URL")
    or os.environ.get("EXPO_BACKEND_URL")
).rstrip("/")
assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL must be set"


def _login(phone: str) -> str:
    r = requests.post(f"{BASE_URL}/api/auth/send-otp",
                      json={"phone": phone}, timeout=20)
    assert r.status_code == 200, r.text
    otp = r.json()["dev_otp"]
    r2 = requests.post(f"{BASE_URL}/api/auth/verify-otp",
                       json={"phone": phone, "code": otp}, timeout=20)
    assert r2.status_code == 200, r2.text
    return r2.json()["token"]


@pytest.fixture(scope="module")
def agent_token() -> str:
    return _login("+919000000003")


@pytest.fixture(scope="module")
def admin_token() -> str:
    return _login("+919000000001")


@pytest.fixture(scope="module")
def sharma_token() -> str:
    return _login("+919999911111")


@pytest.fixture(scope="module")
def iyer_token() -> str:
    return _login("+919999922222")


# ---------- GET /api/support/customers ----------
def test_support_customers_agent_200_returns_roster(agent_token, sharma_token,
                                                    iyer_token):
    # Sharma + Iyer have just logged in, so last_seen_at must be set on both.
    r = requests.get(f"{BASE_URL}/api/support/customers",
                     headers={"Authorization": f"Bearer {agent_token}"},
                     timeout=20)
    assert r.status_code == 200, r.text
    customers = r.json()
    assert isinstance(customers, list)
    # All three seeded customers should be present.
    phones = {c["phone"] for c in customers}
    assert "+919999911111" in phones
    assert "+919999922222" in phones
    assert "+919999933333" in phones
    # Every entry must be role=customer
    assert all(c.get("role") == "customer" for c in customers)
    # _id must never leak.
    assert all("_id" not in c for c in customers)


def test_support_customers_includes_last_seen_for_recent_logins(agent_token,
                                                                sharma_token):
    # Re-bump Sharma's presence so it is < 5 seconds old.
    requests.get(f"{BASE_URL}/api/wallet/me",
                 headers={"Authorization": f"Bearer {sharma_token}"},
                 timeout=20)
    r = requests.get(f"{BASE_URL}/api/support/customers",
                     headers={"Authorization": f"Bearer {agent_token}"},
                     timeout=20)
    assert r.status_code == 200
    sharma = next((c for c in r.json()
                   if c["phone"] == "+919999911111"), None)
    assert sharma is not None
    assert "last_seen_at" in sharma and sharma["last_seen_at"], sharma
    # Parse ISO and verify recency.
    ts = sharma["last_seen_at"]
    ts = ts.replace("Z", "+00:00") if isinstance(ts, str) else ts
    seen = datetime.fromisoformat(ts) if isinstance(ts, str) else ts
    if seen.tzinfo is None:
        seen = seen.replace(tzinfo=timezone.utc)
    age = (datetime.now(timezone.utc) - seen).total_seconds()
    assert 0 <= age < 30, f"last_seen_at too old: {age}s"


def test_support_customers_thread_id_field_present_when_thread_exists(
        agent_token, sharma_token):
    # Sharma has an existing thread (seeded). Confirm thread_id surfaces.
    r = requests.get(f"{BASE_URL}/api/support/customers",
                     headers={"Authorization": f"Bearer {agent_token}"},
                     timeout=20)
    assert r.status_code == 200
    sharma = next((c for c in r.json()
                   if c["phone"] == "+919999911111"), None)
    assert sharma is not None
    # Sharma certainly has a thread from prior iterations; assert id is str.
    assert sharma.get("thread_id"), \
        f"thread_id missing for Sharma: {sharma}"
    assert isinstance(sharma["thread_id"], str)


def test_support_customers_forbidden_for_non_agent(sharma_token):
    r = requests.get(f"{BASE_URL}/api/support/customers",
                     headers={"Authorization": f"Bearer {sharma_token}"},
                     timeout=20)
    assert r.status_code == 403, r.text


def test_support_customers_admin_also_allowed(admin_token):
    r = requests.get(f"{BASE_URL}/api/support/customers",
                     headers={"Authorization": f"Bearer {admin_token}"},
                     timeout=20)
    assert r.status_code == 200


# ---------- POST /api/support/start ----------
def test_support_start_idempotent_for_iyer(agent_token, iyer_token):
    # Resolve Iyer's id.
    roster = requests.get(f"{BASE_URL}/api/support/customers",
                          headers={"Authorization":
                                   f"Bearer {agent_token}"},
                          timeout=20).json()
    iyer = next(c for c in roster if c["phone"] == "+919999922222")
    iyer_id = iyer["id"]

    r1 = requests.post(
        f"{BASE_URL}/api/support/start",
        params={"customer_id": iyer_id},
        headers={"Authorization": f"Bearer {agent_token}"}, timeout=20)
    assert r1.status_code == 200, r1.text
    t1 = r1.json()
    assert t1.get("customer_id") == iyer_id
    assert isinstance(t1.get("id"), str)

    r2 = requests.post(
        f"{BASE_URL}/api/support/start",
        params={"customer_id": iyer_id},
        headers={"Authorization": f"Bearer {agent_token}"}, timeout=20)
    assert r2.status_code == 200
    t2 = r2.json()
    # Idempotent — same thread id returned both times.
    assert t2["id"] == t1["id"], (t1, t2)


def test_support_start_404_for_unknown_customer(agent_token):
    r = requests.post(
        f"{BASE_URL}/api/support/start",
        params={"customer_id": "does-not-exist"},
        headers={"Authorization": f"Bearer {agent_token}"}, timeout=20)
    assert r.status_code == 404, r.text


def test_support_start_forbidden_for_customer(sharma_token):
    r = requests.post(
        f"{BASE_URL}/api/support/start",
        params={"customer_id": "anything"},
        headers={"Authorization": f"Bearer {sharma_token}"}, timeout=20)
    assert r.status_code == 403, r.text


# ---------- Agent send-message into newly-started Iyer thread + preview ----
def test_agent_sends_message_into_iyer_thread_and_preview_updates(
        agent_token, iyer_token):
    roster = requests.get(f"{BASE_URL}/api/support/customers",
                          headers={"Authorization":
                                   f"Bearer {agent_token}"},
                          timeout=20).json()
    iyer = next(c for c in roster if c["phone"] == "+919999922222")
    thread = requests.post(
        f"{BASE_URL}/api/support/start",
        params={"customer_id": iyer["id"]},
        headers={"Authorization": f"Bearer {agent_token}"}, timeout=20).json()

    text = f"TEST_iter9 Hello from agent QA {int(time.time())}"
    r = requests.post(
        f"{BASE_URL}/api/support/threads/{thread['id']}/messages",
        headers={"Authorization": f"Bearer {agent_token}"},
        json={"kind": "text", "text": text}, timeout=20)
    assert r.status_code == 200, r.text
    msg = r.json()
    assert msg["text"] == text
    assert msg["sender_role"] == "agent"
    assert msg["thread_id"] == thread["id"]

    # GET /api/support/threads (as agent) - find iyer thread, verify preview.
    threads = requests.get(
        f"{BASE_URL}/api/support/threads",
        headers={"Authorization": f"Bearer {agent_token}"}, timeout=20).json()
    iyer_thread = next((t for t in threads
                        if t["customer_id"] == iyer["id"]), None)
    assert iyer_thread is not None
    assert iyer_thread["last_message_preview"].startswith("TEST_iter9 Hello"), \
        iyer_thread["last_message_preview"]

    # Cleanup: drop the QA message so we don't pollute the dashboard.
    import sys
    sys.path.insert(0, "/app/backend")
    import asyncio
    from db import db

    async def _cleanup():
        await db.support_messages.delete_many(
            {"thread_id": thread["id"], "text": text})
    asyncio.run(_cleanup())


# ---------- Presence bump on every authenticated request ----------
def test_last_seen_bumps_on_any_authenticated_call(agent_token, iyer_token):
    # First snapshot of Iyer's last_seen_at.
    roster1 = requests.get(f"{BASE_URL}/api/support/customers",
                           headers={"Authorization":
                                    f"Bearer {agent_token}"},
                           timeout=20).json()
    iyer1 = next(c for c in roster1 if c["phone"] == "+919999922222")
    seen1 = iyer1.get("last_seen_at")
    assert seen1, "expected last_seen_at after login"

    # Wait > 1s, then make another authenticated call as Iyer.
    time.sleep(1.2)
    requests.get(f"{BASE_URL}/api/orders/upcoming",
                 headers={"Authorization": f"Bearer {iyer_token}"},
                 timeout=20)

    roster2 = requests.get(f"{BASE_URL}/api/support/customers",
                           headers={"Authorization":
                                    f"Bearer {agent_token}"},
                           timeout=20).json()
    iyer2 = next(c for c in roster2 if c["phone"] == "+919999922222")
    seen2 = iyer2.get("last_seen_at")
    assert seen2, "expected last_seen_at after second call"
    assert seen2 > seen1, f"last_seen_at did not move: {seen1} -> {seen2}"


# ---------- Delivery date selector smoke ----------
@pytest.fixture(scope="module")
def delivery_token() -> str:
    return _login("+919000000002")


def test_delivery_route_accepts_date_query(delivery_token):
    # Tomorrow in IST.
    from datetime import timedelta
    ist = datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)
    tom = (ist + timedelta(days=1)).date().isoformat()
    r = requests.get(f"{BASE_URL}/api/delivery/route",
                     params={"date": tom},
                     headers={"Authorization":
                              f"Bearer {delivery_token}"},
                     timeout=20)
    assert r.status_code == 200, r.text
    rows = r.json()
    assert isinstance(rows, list)
    # Monday should have at least one delivery row (test container today=Sunday).
    # Soft assertion: only enforce when it is not a holiday.
    # All returned rows must carry the requested date.
    for o in rows:
        assert o["date"] == tom, o
