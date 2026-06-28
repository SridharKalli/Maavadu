"""Iteration 3 backend tests:
- New pricing grid (Breakfast/Lunch with-rice/Lunch no-rice/Dinner × single/couple/family)
- Wallet daily_burn / days_left math
- Onboarding wallet top-up flow
- Admin stats wallet_low key
- Predictive low-balance nudge auto-message
- Regression of auth, menu, orders, delivery
"""
import time
from datetime import datetime, timedelta, timezone

import pytest
import requests

IST = timezone(timedelta(hours=5, minutes=30))


def _login(api_client, base_url, phone):
    r = api_client.post(f"{base_url}/api/auth/send-otp", json={"phone": phone})
    assert r.status_code == 200, r.text
    otp = r.json()["dev_otp"]
    r = api_client.post(
        f"{base_url}/api/auth/verify-otp", json={"phone": phone, "code": otp}
    )
    assert r.status_code == 200, r.text
    data = r.json()
    return data["token"], data["user"]


def _headers(tok):
    return {"Authorization": f"Bearer {tok}"}


# ---------- helpers exposed as fixtures ----------
@pytest.fixture(scope="module")
def khan_auth(api_client, base_url):
    tok, user = _login(api_client, base_url, "+919999933333")
    return {"token": tok, "user": user, "headers": _headers(tok)}


@pytest.fixture(scope="module")
def agent_auth(api_client, base_url):
    tok, user = _login(api_client, base_url, "+919000000003")
    return {"token": tok, "user": user, "headers": _headers(tok)}


# ===== 1. Pricing schema =====
def test_pricing_returns_new_shape(base_url, api_client, sharma_auth):
    r = api_client.get(f"{base_url}/api/wallet/pricing", headers=sharma_auth["headers"])
    assert r.status_code == 200, r.text
    p = r.json()
    for key in ("breakfast", "lunch_with_rice", "lunch_without_rice", "dinner"):
        assert key in p, f"missing {key} in pricing: {p}"
    assert "lunch" not in p, f"flat 'lunch' key must NOT be present, got {p}"
    # spot-check values per spec
    assert p["breakfast"]["single"] == 230 and p["breakfast"]["couple"] == 340 \
        and p["breakfast"]["family"] == 460
    assert p["lunch_with_rice"]["single"] == 268 \
        and p["lunch_with_rice"]["couple"] == 385 \
        and p["lunch_with_rice"]["family"] == 530
    assert p["lunch_without_rice"]["single"] == 240 \
        and p["lunch_without_rice"]["couple"] == 340 \
        and p["lunch_without_rice"]["family"] == 460
    assert p["dinner"]["single"] == 230 and p["dinner"]["couple"] == 340 \
        and p["dinner"]["family"] == 460


# ===== 2. Wallet daily_burn for Sharma (couple, B+L+D, with_rice) =====
def test_wallet_me_sharma_daily_burn(base_url, api_client, sharma_auth):
    r = api_client.get(f"{base_url}/api/wallet/me", headers=sharma_auth["headers"])
    assert r.status_code == 200, r.text
    w = r.json()
    # 340 (B couple) + 385 (L couple +rice) + 340 (D couple) = 1065
    assert w["daily_burn"] == 1065, f"expected 1065, got {w['daily_burn']}"
    bal = float(w["balance"])
    assert w["days_left"] == int(bal // 1065), \
        f"days_left mismatch: bal={bal}, got {w['days_left']}"
    # sanity: subscription introspection
    assert w["default_size"] == "couple"
    assert w["default_lunch_variant"] == "with_rice"
    assert set(w["subscribed_meals"]) == {"breakfast", "lunch", "dinner"}


# ===== 3. Wallet daily_burn for Iyer (single, L+D, without_rice) =====
def test_wallet_me_iyer_daily_burn(base_url, api_client, iyer_auth):
    r = api_client.get(f"{base_url}/api/wallet/me", headers=iyer_auth["headers"])
    assert r.status_code == 200, r.text
    w = r.json()
    # 240 (L single no-rice) + 230 (D single) = 470
    assert w["daily_burn"] == 470, f"expected 470, got {w['daily_burn']}"
    assert w["default_size"] == "single"
    assert w["default_lunch_variant"] == "without_rice"
    assert set(w["subscribed_meals"]) == {"lunch", "dinner"}


# ===== 4. PATCH order lunch_variant -> delivery debit reason =====
def _find_editable_lunch_order(orders):
    for o in orders:
        if not o["cutoff_passed"] and o.get("lunch", {}).get("enabled"):
            return o
    return None


def test_patch_lunch_variant_and_debit_reason(base_url, api_client,
                                              sharma_auth, delivery_auth):
    r = api_client.get(f"{base_url}/api/orders/upcoming",
                       headers=sharma_auth["headers"])
    assert r.status_code == 200
    target = _find_editable_lunch_order(r.json())
    if not target:
        pytest.skip("No editable lunch order in next 7 days")

    # Force variant = without_rice and size = couple
    r = api_client.patch(
        f"{base_url}/api/orders/{target['id']}",
        json={"meal": "lunch", "size": "couple",
              "lunch_variant": "without_rice", "enabled": True},
        headers=sharma_auth["headers"],
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["lunch"]["lunch_variant"] == "without_rice"
    assert body["lunch"]["size"] == "couple"
    assert body["lunch"]["enabled"] is True

    # Disable breakfast and dinner so debit only reflects lunch
    api_client.patch(
        f"{base_url}/api/orders/{target['id']}",
        json={"meal": "breakfast", "enabled": False},
        headers=sharma_auth["headers"],
    )
    api_client.patch(
        f"{base_url}/api/orders/{target['id']}",
        json={"meal": "dinner", "enabled": False},
        headers=sharma_auth["headers"],
    )

    # Mark delivered as delivery user
    r = api_client.post(
        f"{base_url}/api/delivery/orders/{target['id']}/delivered",
        headers=delivery_auth["headers"],
    )
    assert r.status_code == 200, r.text

    # Check debit reason
    r = api_client.get(
        f"{base_url}/api/admin/wallet/transactions",
        params={"user_id": sharma_auth["user"]["id"]},
        headers=delivery_auth["headers"],
    )
    # delivery user has no admin/agent role; use admin instead
    if r.status_code == 403:
        admin_tok, _ = _login(api_client, base_url, "+919000000001")
        r = api_client.get(
            f"{base_url}/api/admin/wallet/transactions",
            params={"user_id": sharma_auth["user"]["id"]},
            headers=_headers(admin_tok),
        )
    assert r.status_code == 200, r.text
    txns = r.json()
    debit = next(
        (t for t in txns if t["type"] == "debit"
         and t.get("ref_order_id") == target["id"]),
        None,
    )
    assert debit is not None, "No debit txn recorded for the patched order"
    # lunch_without_rice * couple = 340
    assert debit["amount"] == 340.0, f"expected 340.0, got {debit['amount']}"
    assert "no rice" in debit["reason"], \
        f"reason missing 'no rice': {debit['reason']}"
    assert "lunch cou" in debit["reason"], \
        f"reason missing 'lunch cou': {debit['reason']}"


# ===== 5. Onboarding completes with wallet top-up =====
import random
def test_onboarding_with_initial_topup_creates_welcome_credit(base_url, api_client):
    # Use a randomized phone to keep the test idempotent across repeated runs.
    phone = f"+9199{int(time.time()) % 10}{random.randint(10000000, 99999999)}"
    # Send OTP (creates user if missing)
    r = api_client.post(f"{base_url}/api/auth/send-otp", json={"phone": phone})
    assert r.status_code == 200, r.text
    otp = r.json()["dev_otp"]
    r = api_client.post(
        f"{base_url}/api/auth/verify-otp", json={"phone": phone, "code": otp}
    )
    assert r.status_code == 200, r.text
    tok = r.json()["token"]
    hdrs = _headers(tok)

    payload = {
        "name": "TEST Onboard User",
        "address": "Flat 1, TestVille, Adyar",
        "pincode": "600020",
        "notes": "TEST",
        "meals": ["lunch", "dinner"],
        "default_size": "couple",
        "default_lunch_variant": "without_rice",
        "initial_topup": 3000,
    }
    r = api_client.post(
        f"{base_url}/api/onboarding/complete", json=payload, headers=hdrs
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["user"]["onboarded"] is True
    assert body["user"]["pincode"] == "600020"
    assert body["subscription"]["default_size"] == "couple"
    assert body["subscription"]["default_lunch_variant"] == "without_rice"

    # /wallet/me balance == 3000
    r = api_client.get(f"{base_url}/api/wallet/me", headers=hdrs)
    assert r.status_code == 200
    w = r.json()
    assert w["balance"] == 3000.0, f"expected balance 3000, got {w['balance']}"
    # Welcome top-up credit txn exists
    welcome = next(
        (t for t in w["recent"]
         if t["type"] == "credit" and t["reason"] == "Welcome top-up"),
        None,
    )
    assert welcome is not None, f"no Welcome top-up txn in {w['recent']}"
    assert welcome["amount"] == 3000.0


# ===== 6. Onboarding accepts payload with extra unknown fields (pydantic ignores) =====
def test_onboarding_accepts_extra_fields(base_url, api_client):
    phone = "+919900088888"
    r = api_client.post(f"{base_url}/api/auth/send-otp", json={"phone": phone})
    otp = r.json()["dev_otp"]
    r = api_client.post(
        f"{base_url}/api/auth/verify-otp", json={"phone": phone, "code": otp}
    )
    tok = r.json()["token"]
    hdrs = _headers(tok)

    payload = {
        "name": "TEST Extra Fields",
        "address": "Old shape payload",
        "pincode": "600020",
        "notes": "",
        "meals": ["lunch"],
        "default_size": "single",
        "default_lunch_variant": "with_rice",
        "initial_topup": 0,
        # Old/unknown fields — should be ignored, not 400
        "plan_type": "month",
        "default_quantity": 1,
    }
    r = api_client.post(
        f"{base_url}/api/onboarding/complete", json=payload, headers=hdrs
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["user"]["onboarded"] is True


# ===== 7. Admin stats wallet_low key =====
def test_admin_stats_wallet_low_present(base_url, api_client, admin_auth):
    r = api_client.get(f"{base_url}/api/admin/stats", headers=admin_auth["headers"])
    assert r.status_code == 200, r.text
    s = r.json()
    assert "wallet_low" in s, f"wallet_low missing from {s}"
    assert isinstance(s["wallet_low"], int), \
        f"wallet_low not int: {type(s['wallet_low'])}"
    # Khan starts at 480, threshold 500 → at least 1
    assert s["wallet_low"] >= 1, f"expected >=1, got {s['wallet_low']}"


# ===== 8. Predictive low-balance nudge auto-message =====
def test_predictive_low_balance_nudge(base_url, api_client, admin_auth):
    # Re-login Khan fresh
    khan_tok, khan_user = _login(api_client, base_url, "+919999933333")
    khan_hdrs = _headers(khan_tok)

    # Force Khan balance < threshold using admin debits/credits
    # Read current balance
    r = api_client.get(f"{base_url}/api/wallet/me", headers=khan_hdrs)
    assert r.status_code == 200
    bal_before = float(r.json()["balance"])
    daily = float(r.json()["daily_burn"])
    assert daily > 0

    # Force balance to ~daily * 1 (so days_left < 3) via admin credit then we
    # cannot debit directly (no admin debit endpoint) — instead: credit Khan
    # enough to be over, then deliver a fresh order to debit. Simpler: rely
    # on delivery debit below. First ensure balance is between 0 and 3*daily.
    # If bal_before already < 3*daily we just need to trigger a delivery to
    # invoke _maybe_nudge_low_balance.
    target_bal = daily  # ~1 day of meals
    if bal_before < target_bal:
        # credit up to target
        diff = target_bal - bal_before
        r = api_client.post(
            f"{base_url}/api/admin/wallet/{khan_user['id']}/credit",
            json={"amount": diff, "reason": "TEST setup"},
            headers=admin_auth["headers"],
        )
        assert r.status_code == 200, r.text

    # Find Khan's today's lunch order; if missing, find any editable lunch
    r = api_client.get(f"{base_url}/api/orders/upcoming", headers=khan_hdrs)
    assert r.status_code == 200
    orders = r.json()
    today_iso = datetime.now(IST).date().isoformat()
    target = next(
        (o for o in orders if o["date"] == today_iso
         and o.get("lunch", {}).get("enabled")),
        None,
    )
    if not target:
        target = next(
            (o for o in orders if o.get("lunch", {}).get("enabled")
             and not o["cutoff_passed"]),
            None,
        )
    if not target:
        pytest.skip("No deliverable lunch order found for Khan")

    # Login delivery and mark delivered (auto-debits + triggers nudge)
    deliv_tok, _ = _login(api_client, base_url, "+919000000002")
    r = api_client.post(
        f"{base_url}/api/delivery/orders/{target['id']}/delivered",
        headers=_headers(deliv_tok),
    )
    # If already delivered (today's order possibly already done), continue —
    # need to ensure the support message exists
    assert r.status_code == 200, r.text

    # Slight delay (in case insert is racing)
    time.sleep(1)

    # Get Khan's thread and messages
    r = api_client.get(f"{base_url}/api/support/me", headers=khan_hdrs)
    assert r.status_code == 200, r.text
    tid = r.json()["id"]
    r = api_client.get(
        f"{base_url}/api/support/threads/{tid}/messages", headers=khan_hdrs
    )
    assert r.status_code == 200, r.text
    msgs = r.json()
    today_utc_iso = datetime.now(timezone.utc).date().isoformat()
    auto_msgs = [
        m for m in msgs
        if m["sender_role"] == "agent"
        and m["text"].startswith(f"[Auto · {today_utc_iso}]")
    ]
    assert len(auto_msgs) >= 1, \
        f"no auto nudge found. messages: {[m.get('text') for m in msgs]}"
    # last message should be the auto one
    assert msgs[-1]["sender_role"] == "agent"
    assert msgs[-1]["text"].startswith(f"[Auto · {today_utc_iso}]")

    # De-dup: only ONE auto message per UTC day
    assert len(auto_msgs) == 1, \
        f"expected 1 auto nudge per day, got {len(auto_msgs)}"


# ===== 9. Regression: critical endpoints still work =====
def test_regression_send_otp(base_url, api_client):
    r = api_client.post(
        f"{base_url}/api/auth/send-otp", json={"phone": "+919999911111"}
    )
    assert r.status_code == 200
    assert "dev_otp" in r.json()


def test_regression_menu_week(base_url, api_client, sharma_auth):
    r = api_client.get(f"{base_url}/api/menu/week", headers=sharma_auth["headers"])
    assert r.status_code == 200
    assert len(r.json()) == 7


def test_regression_orders_upcoming(base_url, api_client, sharma_auth):
    r = api_client.get(
        f"{base_url}/api/orders/upcoming", headers=sharma_auth["headers"]
    )
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_regression_delivery_route(base_url, api_client, delivery_auth):
    r = api_client.get(
        f"{base_url}/api/delivery/route", headers=delivery_auth["headers"]
    )
    assert r.status_code == 200
    assert isinstance(r.json(), list)
