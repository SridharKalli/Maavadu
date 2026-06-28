"""Tests for the admin pricing PUT endpoint + regression."""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL",
                          "https://fresh-feast-app-1.preview.emergentagent.com").rstrip("/")

ADMIN_PHONE = "+919000000001"

ORIGINAL = {
    "breakfast":          {"single": 230.0, "couple": 340.0, "family": 460.0},
    "lunch_with_rice":    {"single": 268.0, "couple": 385.0, "family": 530.0},
    "lunch_without_rice": {"single": 240.0, "couple": 340.0, "family": 460.0},
    "dinner":             {"single": 230.0, "couple": 340.0, "family": 460.0},
}


@pytest.fixture(scope="module")
def admin_token():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/send-otp", json={"phone": ADMIN_PHONE}, timeout=10)
    assert r.status_code == 200, r.text
    otp = r.json()["dev_otp"]
    r = s.post(f"{BASE_URL}/api/auth/verify-otp",
               json={"phone": ADMIN_PHONE, "code": otp}, timeout=10)
    assert r.status_code == 200, r.text
    tok = r.json()["token"]
    assert tok
    return tok


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}",
            "Content-Type": "application/json"}


def _get_pricing(headers):
    r = requests.get(f"{BASE_URL}/api/wallet/pricing", headers=headers, timeout=10)
    assert r.status_code == 200, r.text
    return r.json()


def test_pricing_initial_shape(admin_headers):
    p = _get_pricing(admin_headers)
    for m in ("breakfast", "lunch_with_rice", "lunch_without_rice", "dinner"):
        assert m in p
        for s in ("single", "couple", "family"):
            assert s in p[m]
            assert isinstance(p[m][s], (int, float))


def test_pricing_full_update(admin_headers):
    body = {
        "breakfast":          {"single": 230, "couple": 360, "family": 460},
        "lunch_with_rice":    {"single": 268, "couple": 385, "family": 540},
        "lunch_without_rice": {"single": 240, "couple": 340, "family": 460},
        "dinner":             {"single": 230, "couple": 340, "family": 460},
    }
    r = requests.put(f"{BASE_URL}/api/admin/wallet/pricing",
                     headers=admin_headers, json=body, timeout=10)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["breakfast"]["couple"] == 360.0
    assert data["lunch_with_rice"]["family"] == 540.0

    # GET verifies persistence
    p = _get_pricing(admin_headers)
    assert p["breakfast"]["couple"] == 360.0
    assert p["lunch_with_rice"]["family"] == 540.0


def test_pricing_partial_update_leaves_others(admin_headers):
    # set dinner family to 999 first
    requests.put(f"{BASE_URL}/api/admin/wallet/pricing", headers=admin_headers,
                 json={"dinner": {"single": 230, "couple": 340, "family": 999}},
                 timeout=10).raise_for_status()
    # now partial update only breakfast
    body = {"breakfast": {"single": 231, "couple": 361, "family": 461}}
    r = requests.put(f"{BASE_URL}/api/admin/wallet/pricing",
                     headers=admin_headers, json=body, timeout=10)
    assert r.status_code == 200, r.text
    p = _get_pricing(admin_headers)
    assert p["breakfast"]["single"] == 231.0
    assert p["breakfast"]["couple"] == 361.0
    # dinner.family must be unchanged from previous PUT
    assert p["dinner"]["family"] == 999.0


def test_pricing_negative_rejected(admin_headers):
    body = {"breakfast": {"single": -1, "couple": 340, "family": 460}}
    r = requests.put(f"{BASE_URL}/api/admin/wallet/pricing",
                     headers=admin_headers, json=body, timeout=10)
    assert r.status_code == 400, r.text


def test_pricing_requires_admin():
    # No token
    r = requests.put(f"{BASE_URL}/api/admin/wallet/pricing",
                     json={"breakfast": {"single": 230, "couple": 340, "family": 460}},
                     timeout=10)
    assert r.status_code in (401, 403)


def test_zz_restore_original(admin_headers):
    """Final test (zz prefix ensures last run): restore original demo pricing."""
    r = requests.put(f"{BASE_URL}/api/admin/wallet/pricing",
                     headers=admin_headers, json=ORIGINAL, timeout=10)
    assert r.status_code == 200, r.text
    p = _get_pricing(admin_headers)
    for m, row in ORIGINAL.items():
        for s, v in row.items():
            assert p[m][s] == v, f"{m}.{s} expected {v} got {p[m][s]}"
