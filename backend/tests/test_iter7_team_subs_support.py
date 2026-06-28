"""Iteration 7 backend tests:
- PATCH /api/subscriptions/me daily defaults reshape upcoming orders
- GET /api/support/contact returns seeded agent (Priya)
- POST /api/admin/users adds team members + duplicate guard
"""
import os
import asyncio
import pytest
import requests
from motor.motor_asyncio import AsyncIOMotorClient

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL must be set"

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

SHARMA_PHONE = "+919999911111"
ADMIN_PHONE = "+919000000001"
TEST_AGENT_PHONE = "+919000077777"


def _login(phone: str) -> str:
    r = requests.post(f"{BASE_URL}/api/auth/send-otp", json={"phone": phone}, timeout=20)
    r.raise_for_status()
    otp = r.json().get("dev_otp")
    assert otp, f"dev_otp not returned for {phone}: {r.text}"
    r2 = requests.post(f"{BASE_URL}/api/auth/verify-otp",
                       json={"phone": phone, "code": otp}, timeout=20)
    r2.raise_for_status()
    return r2.json()["token"]


@pytest.fixture(scope="module")
def sharma_token():
    return _login(SHARMA_PHONE)


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN_PHONE)


# ---------------- Support contact ----------------
def test_support_contact_returns_priya(sharma_token):
    r = requests.get(f"{BASE_URL}/api/support/contact",
                     headers={"Authorization": f"Bearer {sharma_token}"}, timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("phone") == "+919000000003", data
    assert "Priya" in (data.get("name") or ""), data
    assert (data.get("available") or "").strip(), data


# ---------------- Subscription PATCH ----------------
def _get_sub(token):
    r = requests.get(f"{BASE_URL}/api/subscriptions/me",
                     headers={"Authorization": f"Bearer {token}"}, timeout=20)
    r.raise_for_status()
    return r.json()


def _get_upcoming(token):
    r = requests.get(f"{BASE_URL}/api/orders/upcoming",
                     headers={"Authorization": f"Bearer {token}"}, timeout=20)
    r.raise_for_status()
    return r.json()


def _tomorrow_order(orders):
    from datetime import datetime, timedelta, timezone
    # backend uses today_ist_date; IST is UTC+5:30
    ist = datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)
    tom = (ist + timedelta(days=1)).date().isoformat()
    return next((o for o in orders if o["date"] == tom), None)


def test_subscription_default_size_family_reshapes_tomorrow(sharma_token):
    r = requests.patch(
        f"{BASE_URL}/api/subscriptions/me",
        headers={"Authorization": f"Bearer {sharma_token}"},
        json={"default_size": "family", "default_lunch_variant": "without_rice"},
        timeout=20,
    )
    assert r.status_code == 200, r.text
    sub = r.json()
    assert sub["default_size"] == "family"
    assert sub["default_quantity"] == 4
    assert sub["default_lunch_variant"] == "without_rice"

    upcoming = _get_upcoming(sharma_token)
    tom = _tomorrow_order(upcoming)
    assert tom is not None, f"no tomorrow order in {[o['date'] for o in upcoming]}"
    if not tom.get("cutoff_passed"):
        assert tom["lunch"]["size"] == "family", tom["lunch"]
        assert tom["lunch"]["lunch_variant"] == "without_rice", tom["lunch"]


def test_subscription_meals_lunch_only_disables_other_meals(sharma_token):
    r = requests.patch(
        f"{BASE_URL}/api/subscriptions/me",
        headers={"Authorization": f"Bearer {sharma_token}"},
        json={"meals": ["lunch"]},
        timeout=20,
    )
    assert r.status_code == 200, r.text
    sub = r.json()
    assert sub["meals"] == ["lunch"]

    upcoming = _get_upcoming(sharma_token)
    tom = _tomorrow_order(upcoming)
    assert tom is not None
    if not tom.get("cutoff_passed"):
        assert tom["breakfast"]["enabled"] is False, tom["breakfast"]
        assert tom["dinner"]["enabled"] is False, tom["dinner"]
        assert tom["lunch"]["enabled"] is True, tom["lunch"]


def test_zz_restore_sharma_defaults(sharma_token):
    r = requests.patch(
        f"{BASE_URL}/api/subscriptions/me",
        headers={"Authorization": f"Bearer {sharma_token}"},
        json={
            "meals": ["breakfast", "lunch", "dinner"],
            "default_size": "couple",
            "default_lunch_variant": "with_rice",
        },
        timeout=20,
    )
    assert r.status_code == 200, r.text
    sub = r.json()
    assert sub["meals"] == ["breakfast", "lunch", "dinner"]
    assert sub["default_size"] == "couple"
    assert sub["default_quantity"] == 2
    assert sub["default_lunch_variant"] == "with_rice"


# ---------------- Admin team creation ----------------
def _delete_test_agent():
    async def _go():
        client = AsyncIOMotorClient(MONGO_URL)
        try:
            await client[DB_NAME].users.delete_many({"phone": TEST_AGENT_PHONE})
        finally:
            client.close()
    asyncio.get_event_loop().run_until_complete(_go())


def test_admin_create_agent_then_duplicate(admin_token):
    _delete_test_agent()  # clean slate
    payload = {"phone": TEST_AGENT_PHONE, "name": "Test Agent 2", "role": "agent"}
    r = requests.post(f"{BASE_URL}/api/admin/users",
                      headers={"Authorization": f"Bearer {admin_token}"},
                      json=payload, timeout=20)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["role"] == "agent", body
    assert body["onboarded"] is True, body
    assert body["phone"] == TEST_AGENT_PHONE

    # Duplicate -> 400
    r2 = requests.post(f"{BASE_URL}/api/admin/users",
                       headers={"Authorization": f"Bearer {admin_token}"},
                       json=payload, timeout=20)
    assert r2.status_code == 400, r2.text

    _delete_test_agent()
