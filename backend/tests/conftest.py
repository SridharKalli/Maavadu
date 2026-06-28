import os
import pytest
import requests

BASE_URL = (
    os.environ.get("EXPO_PUBLIC_BACKEND_URL")
    or os.environ.get("EXPO_BACKEND_URL")
    or "https://fresh-feast-app-1.preview.emergentagent.com"
).rstrip("/")


@pytest.fixture(scope="session")
def base_url():
    return BASE_URL


@pytest.fixture(scope="session")
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _login(api_client, base_url, phone):
    r = api_client.post(f"{base_url}/api/auth/send-otp", json={"phone": phone})
    assert r.status_code == 200, r.text
    otp = r.json()["dev_otp"]
    r = api_client.post(f"{base_url}/api/auth/verify-otp", json={"phone": phone, "code": otp})
    assert r.status_code == 200, r.text
    data = r.json()
    return data["token"], data["user"]


@pytest.fixture(scope="session")
def admin_auth(api_client, base_url):
    token, user = _login(api_client, base_url, "+919000000001")
    return {"token": token, "user": user, "headers": {"Authorization": f"Bearer {token}"}}


@pytest.fixture(scope="session")
def delivery_auth(api_client, base_url):
    token, user = _login(api_client, base_url, "+919000000002")
    return {"token": token, "user": user, "headers": {"Authorization": f"Bearer {token}"}}


@pytest.fixture(scope="session")
def sharma_auth(api_client, base_url):
    token, user = _login(api_client, base_url, "+919999911111")
    return {"token": token, "user": user, "headers": {"Authorization": f"Bearer {token}"}}


@pytest.fixture(scope="session")
def iyer_auth(api_client, base_url):
    token, user = _login(api_client, base_url, "+919999922222")
    return {"token": token, "user": user, "headers": {"Authorization": f"Bearer {token}"}}
