"""Iteration 10 — Final 10-of-16 hardening pass.

Covers:
- E.164 phone validation on /auth/send-otp (422 with helpful message)
- Per-phone OTP rate-limit (3 / 60s sliding)
- Atomic $inc wallet ledger (record_wallet_txn)
- Onboarding initial_topup NO LONGER auto-credits (pending top-up message)
- Subscription end_date is ~10 years out
- Approve / reject endpoints (admin/agent only) + double-approve = 400
- _suggest_topups returns [3000, 6000, 10000] for threshold 500
- CORS_ALLOWED_ORIGINS prod default = https://maavadu.in
- Regression: pricing math, debit, admin stats, support roster
"""
import os
import random
import time
import importlib
from datetime import datetime, timedelta, timezone

import pytest
import requests

IST = timezone(timedelta(hours=5, minutes=30))


def _headers(tok):
    return {"Authorization": f"Bearer {tok}"}


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


# ============ 1. E.164 phone validation ============
class TestPhoneValidation:
    def test_invalid_phone_returns_422(self, api_client, base_url):
        r = api_client.post(f"{base_url}/api/auth/send-otp",
                            json={"phone": "invalid"})
        assert r.status_code == 422, r.text
        body = r.json()
        # FastAPI/Pydantic error payload — message must mention E.164
        msg = str(body)
        assert "E.164" in msg or "e.164" in msg.lower(), \
            f"expected E.164 error msg, got: {body}"

    def test_invalid_phone_no_plus(self, api_client, base_url):
        r = api_client.post(f"{base_url}/api/auth/send-otp",
                            json={"phone": "919000000001"})
        assert r.status_code == 422

    def test_invalid_phone_too_short(self, api_client, base_url):
        r = api_client.post(f"{base_url}/api/auth/send-otp",
                            json={"phone": "+91"})
        assert r.status_code == 422

    def test_valid_phone_returns_200_with_dev_otp(self, api_client, base_url):
        r = api_client.post(f"{base_url}/api/auth/send-otp",
                            json={"phone": "+919000000001"})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("sent") is True
        assert body.get("phone") == "+919000000001"
        assert "dev_otp" in body and len(body["dev_otp"]) == 6


# ============ 2. OTP rate-limit ============
# In DEV the cap defaults to 100/60s so pytest reruns don't cascade 429s.
# Production defaults to 3/60s. Either way, exceeding the cap returns 429.
def _otp_cap_from_backend() -> int:
    # Import after the backend env has been loaded (it's the same process
    # under supervisor — pytest imports it directly).
    import sys, importlib  # noqa: PLC0415
    sys.path.insert(0, "/app/backend")
    import db as backend_db  # noqa: PLC0415
    importlib.reload(backend_db)
    return int(backend_db.OTP_RATE_MAX)


class TestOtpRateLimit:
    def test_exceeding_cap_returns_429(self, api_client, base_url):
        cap = _otp_cap_from_backend()
        # Use a unique phone to avoid colliding with other tests' buckets
        phone = f"+9199{random.randint(10000000, 99999999)}"
        # All requests up to the cap should succeed
        for i in range(cap):
            r = api_client.post(f"{base_url}/api/auth/send-otp",
                                json={"phone": phone})
            assert r.status_code == 200, f"req {i+1}/{cap}: {r.text}"
        # Cap + 1 must be 429
        r = api_client.post(f"{base_url}/api/auth/send-otp",
                            json={"phone": phone})
        assert r.status_code == 429, r.text
        assert "Too many" in r.text or "too many" in r.text.lower()

    def test_different_phones_dont_share_bucket(self, api_client, base_url):
        p1 = f"+9199{random.randint(10000000, 99999999)}"
        p2 = f"+9199{random.randint(10000000, 99999999)}"
        for _ in range(3):
            r = api_client.post(f"{base_url}/api/auth/send-otp",
                                json={"phone": p1})
            assert r.status_code == 200
        # p2 should still be fresh
        r = api_client.post(f"{base_url}/api/auth/send-otp",
                            json={"phone": p2})
        assert r.status_code == 200, r.text


# ============ 3. Wallet atomic + pricing math ============
class TestWalletAtomicPricing:
    def test_sharma_daily_burn_1065(self, api_client, base_url, sharma_auth):
        r = api_client.get(f"{base_url}/api/wallet/me",
                           headers=sharma_auth["headers"])
        assert r.status_code == 200, r.text
        w = r.json()
        # B couple 340 + L couple with_rice 385 + D couple 340 = 1065
        assert w["daily_burn"] == 1065, w["daily_burn"]
        assert w["default_size"] == "couple"
        assert w["default_lunch_variant"] == "with_rice"

    def test_admin_credit_is_atomic_and_returns_new_balance(
        self, api_client, base_url, admin_auth, sharma_auth
    ):
        uid = sharma_auth["user"]["id"]
        r0 = api_client.get(f"{base_url}/api/wallet/me",
                            headers=sharma_auth["headers"])
        bal0 = float(r0.json()["balance"])
        r = api_client.post(
            f"{base_url}/api/admin/wallet/{uid}/credit",
            json={"amount": 100, "reason": "TEST atomic"},
            headers=admin_auth["headers"],
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert "balance" in body and "txn" in body
        assert round(body["balance"] - bal0, 2) == 100.0
        # verify via /wallet/me
        r2 = api_client.get(f"{base_url}/api/wallet/me",
                            headers=sharma_auth["headers"])
        bal1 = float(r2.json()["balance"])
        assert round(bal1 - bal0, 2) == 100.0


# ============ 4. Onboarding no auto-credit + topup_request_id ============
class TestOnboardingPendingTopup:
    def test_initial_topup_creates_pending_request(self, api_client, base_url):
        phone = f"+9199{int(time.time()) % 10}{random.randint(10000000, 99999999)}"
        api_client.post(f"{base_url}/api/auth/send-otp", json={"phone": phone})
        otp = api_client.post(f"{base_url}/api/auth/send-otp",
                              json={"phone": phone}).json()["dev_otp"]
        tok = api_client.post(
            f"{base_url}/api/auth/verify-otp",
            json={"phone": phone, "code": otp}).json()["token"]
        hdrs = _headers(tok)

        body = api_client.post(
            f"{base_url}/api/onboarding/complete",
            json={
                "name": "TEST Iter10",
                "address": "TestVille",
                "pincode": "600020",
                "notes": "",
                "meals": ["breakfast", "lunch", "dinner"],
                "default_size": "couple",
                "default_lunch_variant": "with_rice",
                "initial_topup": 6000,
            },
            headers=hdrs,
        ).json()
        assert body["user"]["onboarded"] is True
        assert body.get("topup_request_id"), body

        # Wallet balance stays 0
        w = api_client.get(f"{base_url}/api/wallet/me", headers=hdrs).json()
        assert w["balance"] == 0.0, w["balance"]

        # Pending message exists in support thread with correct meta
        thread = api_client.get(f"{base_url}/api/support/me",
                                headers=hdrs).json()
        msgs = api_client.get(
            f"{base_url}/api/support/threads/{thread['id']}/messages",
            headers=hdrs).json()
        pending = [m for m in msgs
                   if (m.get("meta") or {}).get("type") == "topup_request"
                   and (m.get("meta") or {}).get("status") == "pending"]
        assert len(pending) == 1
        meta = pending[0]["meta"]
        assert meta["amount"] == 6000.0
        assert meta.get("source") == "onboarding"

    def test_subscription_end_date_is_10_years_out(self, api_client, base_url):
        phone = f"+9199{int(time.time()) % 10}{random.randint(10000000, 99999999)}"
        api_client.post(f"{base_url}/api/auth/send-otp", json={"phone": phone})
        otp = api_client.post(f"{base_url}/api/auth/send-otp",
                              json={"phone": phone}).json()["dev_otp"]
        tok = api_client.post(
            f"{base_url}/api/auth/verify-otp",
            json={"phone": phone, "code": otp}).json()["token"]
        body = api_client.post(
            f"{base_url}/api/onboarding/complete",
            json={
                "name": "TEST 10yr",
                "address": "TestVille",
                "pincode": "600020", "notes": "",
                "meals": ["lunch"], "default_size": "single",
                "default_lunch_variant": "with_rice",
                "initial_topup": 0,
            },
            headers=_headers(tok),
        ).json()
        start = body["subscription"]["start_date"]
        end = body["subscription"]["end_date"]
        assert int(end[:4]) - int(start[:4]) >= 9, f"{start} -> {end}"


# ============ 5. Approve / Reject endpoints ============
class TestTopupApproveReject:
    def _new_pending_request(self, api_client, base_url, amount):
        phone = f"+9199{int(time.time()) % 10}{random.randint(10000000, 99999999)}"
        api_client.post(f"{base_url}/api/auth/send-otp", json={"phone": phone})
        otp = api_client.post(f"{base_url}/api/auth/send-otp",
                              json={"phone": phone}).json()["dev_otp"]
        tok = api_client.post(
            f"{base_url}/api/auth/verify-otp",
            json={"phone": phone, "code": otp}).json()["token"]
        hdrs = _headers(tok)
        body = api_client.post(
            f"{base_url}/api/onboarding/complete",
            json={
                "name": "TEST Approver",
                "address": "TV", "pincode": "600020", "notes": "",
                "meals": ["lunch"], "default_size": "single",
                "default_lunch_variant": "with_rice",
                "initial_topup": amount,
            },
            headers=hdrs,
        ).json()
        return body["topup_request_id"], hdrs

    def test_approve_credits_wallet_and_posts_confirmation(
        self, api_client, base_url, admin_auth
    ):
        msg_id, hdrs = self._new_pending_request(api_client, base_url, 4500)
        r = api_client.post(
            f"{base_url}/api/support/messages/{msg_id}/topup-approve",
            headers=admin_auth["headers"])
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["status"] == "approved"
        assert body["balance"] == 4500.0

        # Wallet now 4500
        w = api_client.get(f"{base_url}/api/wallet/me", headers=hdrs).json()
        assert w["balance"] == 4500.0

        # Follow-up confirmation message in thread
        thread = api_client.get(f"{base_url}/api/support/me",
                                headers=hdrs).json()
        msgs = api_client.get(
            f"{base_url}/api/support/threads/{thread['id']}/messages",
            headers=hdrs).json()
        confirms = [m for m in msgs
                    if (m.get("meta") or {}).get("type") == "topup_action"]
        assert any(m["meta"]["status"] == "approved" for m in confirms)

    def test_double_approve_returns_400(self, api_client, base_url, admin_auth):
        msg_id, _ = self._new_pending_request(api_client, base_url, 3000)
        r1 = api_client.post(
            f"{base_url}/api/support/messages/{msg_id}/topup-approve",
            headers=admin_auth["headers"])
        assert r1.status_code == 200
        r2 = api_client.post(
            f"{base_url}/api/support/messages/{msg_id}/topup-approve",
            headers=admin_auth["headers"])
        assert r2.status_code == 400, r2.text

    def test_reject_does_not_credit(self, api_client, base_url, admin_auth):
        msg_id, hdrs = self._new_pending_request(api_client, base_url, 3000)
        r = api_client.post(
            f"{base_url}/api/support/messages/{msg_id}/topup-reject",
            headers=admin_auth["headers"])
        assert r.status_code == 200
        assert r.json()["status"] == "rejected"
        w = api_client.get(f"{base_url}/api/wallet/me", headers=hdrs).json()
        assert w["balance"] == 0.0

    def test_customer_cannot_approve(
        self, api_client, base_url, sharma_auth
    ):
        msg_id, _ = self._new_pending_request(api_client, base_url, 3000)
        r = api_client.post(
            f"{base_url}/api/support/messages/{msg_id}/topup-approve",
            headers=sharma_auth["headers"])
        assert r.status_code == 403, r.text


# ============ 6. _suggest_topups threshold-aware ============
class TestSuggestTopups:
    def test_suggested_topups_for_default_threshold(
        self, api_client, base_url, sharma_auth
    ):
        r = api_client.get(f"{base_url}/api/wallet/me",
                           headers=sharma_auth["headers"])
        body = r.json()
        # default threshold is 500 → [3000, 6000, 10000]
        if body.get("threshold") == 500.0:
            assert body.get("suggested_topups") == [3000, 6000, 10000], \
                body.get("suggested_topups")
        else:
            # at minimum the API returns three integer tiers
            assert len(body.get("suggested_topups", [])) == 3


# ============ 7. CORS prod default ============
class TestCorsConfig:
    def test_cors_default_in_prod_is_maavadu(self):
        """Verify db.py logic — re-import with DEV_MODE=0 and no override.
        Cannot mutate the running process module easily; use isolated import."""
        # Use a sub-process-style approach via importlib reload after env mut.
        old_dev = os.environ.get("DEV_MODE")
        old_cors = os.environ.get("CORS_ALLOWED_ORIGINS")
        try:
            os.environ["DEV_MODE"] = "0"
            os.environ.pop("CORS_ALLOWED_ORIGINS", None)
            import sys
            sys.path.insert(0, "/app/backend")
            import db as dbmod
            importlib.reload(dbmod)
            assert dbmod.CORS_ALLOWED_ORIGINS == ["https://maavadu.in"], \
                dbmod.CORS_ALLOWED_ORIGINS
        finally:
            if old_dev is None:
                os.environ.pop("DEV_MODE", None)
            else:
                os.environ["DEV_MODE"] = old_dev
            if old_cors is not None:
                os.environ["CORS_ALLOWED_ORIGINS"] = old_cors
            # Restore module state
            import sys
            import db as dbmod
            importlib.reload(dbmod)

    def test_cors_default_in_dev_is_star(self):
        old_dev = os.environ.get("DEV_MODE")
        old_cors = os.environ.get("CORS_ALLOWED_ORIGINS")
        try:
            os.environ["DEV_MODE"] = "1"
            os.environ.pop("CORS_ALLOWED_ORIGINS", None)
            import sys
            sys.path.insert(0, "/app/backend")
            import db as dbmod
            importlib.reload(dbmod)
            assert dbmod.CORS_ALLOWED_ORIGINS == ["*"], \
                dbmod.CORS_ALLOWED_ORIGINS
        finally:
            if old_dev is None:
                os.environ.pop("DEV_MODE", None)
            else:
                os.environ["DEV_MODE"] = old_dev
            if old_cors is not None:
                os.environ["CORS_ALLOWED_ORIGINS"] = old_cors
            import sys
            import db as dbmod
            importlib.reload(dbmod)


# ============ 8. Regression: critical existing endpoints ============
class TestRegression:
    def test_pricing_returns_new_shape(self, api_client, base_url, sharma_auth):
        r = api_client.get(f"{base_url}/api/wallet/pricing",
                           headers=sharma_auth["headers"])
        assert r.status_code == 200
        p = r.json()
        for k in ("breakfast", "lunch_with_rice",
                  "lunch_without_rice", "dinner"):
            assert k in p

    def test_admin_stats_includes_wallet_low(
        self, api_client, base_url, admin_auth
    ):
        r = api_client.get(f"{base_url}/api/admin/stats",
                           headers=admin_auth["headers"])
        assert r.status_code == 200
        assert "wallet_low" in r.json()

    def test_support_roster_for_agent(self, api_client, base_url, admin_auth):
        r = api_client.get(f"{base_url}/api/support/customers",
                           headers=admin_auth["headers"])
        assert r.status_code == 200
        assert isinstance(r.json(), list)
