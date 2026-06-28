"""Backend tests for Home Tiffin Service API."""
import requests
from datetime import datetime, timedelta, timezone

IST = timezone(timedelta(hours=5, minutes=30))


# ---------------- Health ----------------
def test_health(base_url, api_client):
    r = api_client.get(f"{base_url}/api/")
    assert r.status_code == 200
    body = r.json()
    assert body.get("status") == "ok"


# ---------------- Auth ----------------
def test_send_otp_admin(base_url, api_client):
    r = api_client.post(f"{base_url}/api/auth/send-otp", json={"phone": "+919000000001"})
    assert r.status_code == 200
    data = r.json()
    assert data["sent"] is True
    assert "dev_otp" in data and len(data["dev_otp"]) == 6


def test_send_otp_delivery(base_url, api_client):
    r = api_client.post(f"{base_url}/api/auth/send-otp", json={"phone": "+919000000002"})
    assert r.status_code == 200
    assert "dev_otp" in r.json()


def test_send_otp_customer(base_url, api_client):
    r = api_client.post(f"{base_url}/api/auth/send-otp", json={"phone": "+919999911111"})
    assert r.status_code == 200
    assert "dev_otp" in r.json()


def test_verify_otp_returns_correct_role(base_url, api_client):
    r = api_client.post(f"{base_url}/api/auth/send-otp", json={"phone": "+919000000001"})
    otp = r.json()["dev_otp"]
    r = api_client.post(f"{base_url}/api/auth/verify-otp",
                        json={"phone": "+919000000001", "code": otp})
    assert r.status_code == 200
    body = r.json()
    assert "token" in body and "user" in body
    assert body["user"]["role"] == "admin"


def test_verify_wrong_otp(base_url, api_client):
    api_client.post(f"{base_url}/api/auth/send-otp", json={"phone": "+919999933333"})
    r = api_client.post(f"{base_url}/api/auth/verify-otp",
                        json={"phone": "+919999933333", "code": "000000"})
    assert r.status_code == 400
    assert "Invalid OTP" in r.text


def test_me_with_token(base_url, api_client, sharma_auth):
    r = api_client.get(f"{base_url}/api/auth/me", headers=sharma_auth["headers"])
    assert r.status_code == 200
    assert r.json()["phone"] == "+919999911111"


def test_me_no_token(base_url, api_client):
    r = requests.get(f"{base_url}/api/auth/me")
    assert r.status_code == 401


# ---------------- Menu ----------------
def test_menu_week(base_url, api_client, sharma_auth):
    r = api_client.get(f"{base_url}/api/menu/week", headers=sharma_auth["headers"])
    assert r.status_code == 200
    items = r.json()
    assert len(items) == 7
    days = sorted(i["day_of_week"] for i in items)
    assert days == [0, 1, 2, 3, 4, 5, 6]
    day0 = next(i for i in items if i["day_of_week"] == 0)
    assert day0["is_holiday"] is True


def test_menu_update_admin(base_url, api_client, admin_auth):
    # Try updating Monday's breakfast
    new_item = {"name": "Test Poha", "description": "TEST update"}
    r = api_client.put(f"{base_url}/api/menu/1",
                       json={"breakfast": new_item},
                       headers=admin_auth["headers"])
    assert r.status_code == 200
    body = r.json()
    assert body["breakfast"]["name"] == "Test Poha"
    # restore
    api_client.put(f"{base_url}/api/menu/1",
                   json={"breakfast": {"name": "Poha",
                                       "description": "Flattened rice with peanuts & curry leaves"}},
                   headers=admin_auth["headers"])


def test_menu_update_non_admin_forbidden(base_url, api_client, sharma_auth):
    r = api_client.put(f"{base_url}/api/menu/1",
                       json={"breakfast": {"name": "Hack", "description": ""}},
                       headers=sharma_auth["headers"])
    assert r.status_code == 403


# ---------------- Orders (customer) ----------------
def test_upcoming_orders(base_url, api_client, sharma_auth):
    r = api_client.get(f"{base_url}/api/orders/upcoming", headers=sharma_auth["headers"])
    assert r.status_code == 200
    orders = r.json()
    assert isinstance(orders, list)
    for o in orders:
        assert "cutoff_passed" in o
        assert "date" in o


def _find_editable_order(orders):
    """Find an order whose cutoff has not yet passed (tomorrow or later)."""
    for o in orders:
        if not o["cutoff_passed"]:
            return o
    return None


def test_modify_order_quantity(base_url, api_client, sharma_auth):
    r = api_client.get(f"{base_url}/api/orders/upcoming", headers=sharma_auth["headers"])
    orders = r.json()
    target = _find_editable_order(orders)
    if not target:
        import pytest
        pytest.skip("No editable order (all cutoffs passed)")
    original = target["lunch"]["quantity"]
    r = api_client.patch(f"{base_url}/api/orders/{target['id']}",
                        json={"meal": "lunch", "quantity": 2},
                        headers=sharma_auth["headers"])
    assert r.status_code == 200, r.text
    assert r.json()["lunch"]["quantity"] == 2
    # restore
    api_client.patch(f"{base_url}/api/orders/{target['id']}",
                    json={"meal": "lunch", "quantity": original},
                    headers=sharma_auth["headers"])


def test_modify_order_quantity_too_high(base_url, api_client, sharma_auth):
    r = api_client.get(f"{base_url}/api/orders/upcoming", headers=sharma_auth["headers"])
    target = _find_editable_order(r.json())
    if not target:
        import pytest
        pytest.skip("No editable order")
    r = api_client.patch(f"{base_url}/api/orders/{target['id']}",
                        json={"meal": "lunch", "quantity": 5},
                        headers=sharma_auth["headers"])
    assert r.status_code == 400
    assert "0..3" in r.text


def test_modify_order_quantity_zero_disabled(base_url, api_client, sharma_auth):
    r = api_client.get(f"{base_url}/api/orders/upcoming", headers=sharma_auth["headers"])
    target = _find_editable_order(r.json())
    if not target:
        import pytest
        pytest.skip("No editable order")
    r = api_client.patch(f"{base_url}/api/orders/{target['id']}",
                        json={"meal": "dinner", "quantity": 0, "enabled": False},
                        headers=sharma_auth["headers"])
    assert r.status_code == 200
    body = r.json()
    assert body["dinner"]["quantity"] == 0
    assert body["dinner"]["enabled"] is False
    # restore
    api_client.patch(f"{base_url}/api/orders/{target['id']}",
                    json={"meal": "dinner", "quantity": 1, "enabled": True},
                    headers=sharma_auth["headers"])


def test_modify_order_after_cutoff(base_url, api_client, sharma_auth):
    r = api_client.get(f"{base_url}/api/orders/upcoming", headers=sharma_auth["headers"])
    # find one whose cutoff has passed (today usually)
    target = next((o for o in r.json() if o["cutoff_passed"]), None)
    if not target:
        import pytest
        pytest.skip("No cutoff-passed order found")
    r = api_client.patch(f"{base_url}/api/orders/{target['id']}",
                        json={"meal": "lunch", "quantity": 2},
                        headers=sharma_auth["headers"])
    assert r.status_code == 400
    assert "cutoff" in r.text.lower()


# ---------------- Subscriptions ----------------
def test_my_subscription(base_url, api_client, sharma_auth):
    r = api_client.get(f"{base_url}/api/subscriptions/me", headers=sharma_auth["headers"])
    assert r.status_code == 200
    sub = r.json()
    assert sub is not None
    assert sub["active"] is True
    assert sub["user_id"] == sharma_auth["user"]["id"]


# ---------------- Admin ----------------
def test_admin_stats(base_url, api_client, admin_auth):
    r = api_client.get(f"{base_url}/api/admin/stats", headers=admin_auth["headers"])
    assert r.status_code == 200
    s = r.json()
    for k in ("total_customers", "active_subscriptions", "today_orders", "delivered_today"):
        assert k in s
    assert s["total_customers"] >= 3


def test_admin_stats_forbidden_for_customer(base_url, api_client, sharma_auth):
    r = api_client.get(f"{base_url}/api/admin/stats", headers=sharma_auth["headers"])
    assert r.status_code == 403


def test_admin_orders(base_url, api_client, admin_auth):
    r = api_client.get(f"{base_url}/api/admin/orders", headers=admin_auth["headers"])
    assert r.status_code == 200
    orders = r.json()
    assert isinstance(orders, list)
    if orders:
        o = orders[0]
        assert "customer_name" in o
        assert "customer_address" in o
        assert "customer_phone" in o


# ---------------- Delivery ----------------
def test_delivery_route(base_url, api_client, delivery_auth):
    r = api_client.get(f"{base_url}/api/delivery/route", headers=delivery_auth["headers"])
    assert r.status_code == 200
    items = r.json()
    assert isinstance(items, list)
    for o in items:
        assert o["total_quantity"] > 0
        assert "customer_name" in o


def test_delivery_route_forbidden_for_customer(base_url, api_client, sharma_auth):
    r = api_client.get(f"{base_url}/api/delivery/route", headers=sharma_auth["headers"])
    assert r.status_code == 403


def test_delivery_pickups_includes_seeded(base_url, api_client, delivery_auth):
    r = api_client.get(f"{base_url}/api/delivery/pickups", headers=delivery_auth["headers"])
    assert r.status_code == 200
    pickups = r.json()
    assert isinstance(pickups, list)
    # Seed creates a Sharma Family yesterday pickup
    names = [p["customer_name"] for p in pickups]
    assert any("Sharma" in n for n in names), f"Expected Sharma pickup, got {names}"


def test_mark_delivered_and_hotbox(base_url, api_client, delivery_auth):
    # find a pickup (seeded one)
    r = api_client.get(f"{base_url}/api/delivery/pickups", headers=delivery_auth["headers"])
    pickups = r.json()
    sharma = next((p for p in pickups if "Sharma" in p["customer_name"]), None)
    assert sharma is not None, "No Sharma pickup found"
    order_id = sharma["id"]

    # Mark delivered (already delivered, idempotent)
    r = api_client.post(f"{base_url}/api/delivery/orders/{order_id}/delivered",
                       headers=delivery_auth["headers"])
    assert r.status_code == 200
    body = r.json()
    assert body["delivered"] is True
    assert body.get("delivered_at") is not None

    # Mark hotbox collected
    r = api_client.post(f"{base_url}/api/delivery/orders/{order_id}/hotbox",
                       headers=delivery_auth["headers"])
    assert r.status_code == 200
    assert r.json()["hotbox_collected"] is True

    # Verify pickups list no longer includes it
    r = api_client.get(f"{base_url}/api/delivery/pickups", headers=delivery_auth["headers"])
    pickups = r.json()
    assert not any(p["id"] == order_id for p in pickups)
