"""Pydantic schemas and shared type aliases for the Tiffin API."""

import uuid
from datetime import datetime, timezone
from typing import List, Optional, Literal

from pydantic import BaseModel, Field

Role = Literal["customer", "admin", "delivery", "agent"]
MealKey = Literal["breakfast", "lunch", "dinner"]
PlanType = Literal["day", "week", "month"]
SizeKey = Literal["single", "couple", "family"]
LunchVariant = Literal["with_rice", "without_rice"]

SIZE_TO_QTY = {"single": 1, "couple": 2, "family": 4}


class User(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    phone: str
    name: str = ""
    role: Role = "customer"
    address: str = ""
    pincode: str = ""
    notes: str = ""
    onboarded: bool = False
    wallet_balance: float = 0.0
    wallet_threshold: float = 500.0
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class WalletTxn(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    type: Literal["credit", "debit"] = "credit"
    amount: float
    balance_after: float
    reason: str = ""
    ref_order_id: Optional[str] = None
    by_user_id: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class Pricing(BaseModel):
    breakfast: dict = Field(default_factory=lambda:
        {"single": 230.0, "couple": 340.0, "family": 460.0})
    lunch_without_rice: dict = Field(default_factory=lambda:
        {"single": 240.0, "couple": 340.0, "family": 460.0})
    lunch_with_rice: dict = Field(default_factory=lambda:
        {"single": 268.0, "couple": 385.0, "family": 530.0})
    dinner: dict = Field(default_factory=lambda:
        {"single": 230.0, "couple": 340.0, "family": 460.0})


class Pincode(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    code: str
    area: str = ""
    active: bool = True


class MealItem(BaseModel):
    name: str
    description: str = ""


class WeeklyMenu(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    day_of_week: int
    is_holiday: bool = False
    breakfast: Optional[MealItem] = None
    lunch: Optional[MealItem] = None
    dinner: Optional[MealItem] = None


class Subscription(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    plan_type: PlanType
    meals: List[MealKey] = ["breakfast", "lunch", "dinner"]
    default_size: SizeKey = "single"
    default_lunch_variant: LunchVariant = "with_rice"
    default_quantity: int = 1
    start_date: str
    end_date: str
    active: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class OrderMeal(BaseModel):
    enabled: bool = True
    quantity: int = 1
    size: SizeKey = "single"
    item_name: str = ""
    lunch_variant: Optional[LunchVariant] = None


class DailyOrder(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    date: str
    breakfast: OrderMeal = Field(default_factory=lambda: OrderMeal(enabled=False, quantity=0))
    lunch: OrderMeal = Field(default_factory=lambda: OrderMeal(enabled=False, quantity=0))
    dinner: OrderMeal = Field(default_factory=lambda: OrderMeal(enabled=False, quantity=0))
    delivery_user_id: Optional[str] = None
    delivered: bool = False
    hotbox_collected: bool = False
    delivered_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class SupportThread(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    customer_id: str
    last_message_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    last_message_preview: str = ""
    unread_for_customer: int = 0
    unread_for_agent: int = 0
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class SupportMessage(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    thread_id: str
    sender_id: str
    sender_role: Role
    kind: Literal["text", "voice"] = "text"
    text: str = ""
    voice_b64: str = ""
    voice_duration_ms: int = 0
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# ---- Request payloads ----------------------------------------------------
class SendOtpReq(BaseModel):
    phone: str


class VerifyOtpReq(BaseModel):
    phone: str
    code: str


class UpdateProfileReq(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    notes: Optional[str] = None
    pincode: Optional[str] = None


class OnboardReq(BaseModel):
    name: str
    address: str
    pincode: str
    notes: str = ""
    meals: List[MealKey]
    default_size: SizeKey = "single"
    default_lunch_variant: LunchVariant = "with_rice"
    initial_topup: float = 0.0


class UpdateOrderMealReq(BaseModel):
    meal: MealKey
    enabled: Optional[bool] = None
    size: Optional[SizeKey] = None
    lunch_variant: Optional[LunchVariant] = None


class UpdateSubscriptionReq(BaseModel):
    """Profile-level default preferences. Updating these reshapes any
    upcoming orders that are still before their 8 PM cutoff."""
    meals: Optional[List[MealKey]] = None
    default_size: Optional[SizeKey] = None
    default_lunch_variant: Optional[LunchVariant] = None


class AdminCreateUserReq(BaseModel):
    phone: str
    name: str
    role: Role = "customer"
    address: str = ""
    pincode: str = ""
    notes: str = ""


class UpdateMenuReq(BaseModel):
    is_holiday: Optional[bool] = None
    breakfast: Optional[MealItem] = None
    lunch: Optional[MealItem] = None
    dinner: Optional[MealItem] = None


class CreatePincodeReq(BaseModel):
    code: str
    area: str = ""


class BulkPincodeReq(BaseModel):
    text: str


class SendMessageReq(BaseModel):
    kind: Literal["text", "voice"] = "text"
    text: str = ""
    voice_b64: str = ""
    voice_duration_ms: int = 0


class CreditWalletReq(BaseModel):
    amount: float
    reason: str = "Top-up"


class TopupRequestReq(BaseModel):
    amount: float


class PriceRow(BaseModel):
    single: float
    couple: float
    family: float


class UpdatePricingReq(BaseModel):
    breakfast: Optional[PriceRow] = None
    lunch_with_rice: Optional[PriceRow] = None
    lunch_without_rice: Optional[PriceRow] = None
    dinner: Optional[PriceRow] = None
