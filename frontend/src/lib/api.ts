import { storage } from "@/src/utils/storage";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;

export type Role = "customer" | "admin" | "delivery" | "agent";
export type MealKey = "breakfast" | "lunch" | "dinner";
export type PlanType = "day" | "week" | "month";

export interface User {
  id: string;
  phone: string;
  name: string;
  role: Role;
  address: string;
  pincode: string;
  notes: string;
  onboarded: boolean;
  wallet_balance?: number;
  wallet_threshold?: number;
}

let _token: string | null = null;

export async function loadToken(): Promise<string | null> {
  if (_token) return _token;
  const t = await storage.secureGet("tiffin_token", "");
  _token = t ? String(t) : null;
  return _token;
}

export async function setToken(token: string | null) {
  _token = token;
  if (token) await storage.secureSet("tiffin_token", token);
  else await storage.secureRemove("tiffin_token");
}

export async function api<T = any>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = await loadToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}/api${path}`, { ...init, headers });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const msg = body?.detail || body?.message || `HTTP ${res.status}`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return body as T;
}

// ---- Auth ---------------------------------------------------------------
export const auth = {
  sendOtp: (phone: string) =>
    api<{ sent: boolean; dev_otp?: string }>("/auth/send-otp", {
      method: "POST", body: JSON.stringify({ phone }),
    }),
  verifyOtp: (phone: string, code: string) =>
    api<{ token: string; user: User }>("/auth/verify-otp", {
      method: "POST", body: JSON.stringify({ phone, code }),
    }),
  me: () => api<User>("/auth/me"),
  updateMe: (patch: Partial<Pick<User, "name" | "address" | "notes" | "pincode">>) =>
    api<User>("/auth/me", { method: "PATCH", body: JSON.stringify(patch) }),
};

// ---- Onboarding ---------------------------------------------------------
export const onboarding = {
  checkPincode: (code: string) =>
    api<{ serviceable: boolean; pincode: Pincode | null }>(
      `/onboarding/check-pincode/${code}`),
  complete: (payload: {
    name: string; address: string; pincode: string; notes?: string;
    meals: MealKey[]; default_size: SizeKey;
    default_lunch_variant: LunchVariant; initial_topup?: number;
  }) => api<{ user: User; subscription: any }>("/onboarding/complete",
    { method: "POST", body: JSON.stringify(payload) }),
};

// ---- Pincodes -----------------------------------------------------------
export interface Pincode { id: string; code: string; area: string; active: boolean }
export const pincodesApi = {
  list: () => api<Pincode[]>("/pincodes"),
  adminList: () => api<Pincode[]>("/admin/pincodes"),
  create: (code: string, area: string) =>
    api<Pincode>("/admin/pincodes", { method: "POST",
      body: JSON.stringify({ code, area }) }),
  bulk: (text: string) =>
    api<{ added: number; updated: number }>("/admin/pincodes/bulk",
      { method: "POST", body: JSON.stringify({ text }) }),
  remove: (code: string) =>
    api<{ deactivated: string }>(`/admin/pincodes/${code}`, { method: "DELETE" }),
};

// ---- Menu ---------------------------------------------------------------
export interface MealItem { name: string; description: string }
export interface WeeklyMenu {
  id: string; day_of_week: number; is_holiday: boolean;
  breakfast: MealItem | null; lunch: MealItem | null; dinner: MealItem | null;
}
export const menuApi = {
  week: () => api<WeeklyMenu[]>("/menu/week"),
  weekPublic: () => api<WeeklyMenu[]>("/menu/public"),
  update: (day: number, patch: Partial<WeeklyMenu>) =>
    api<WeeklyMenu>(`/menu/${day}`, { method: "PUT", body: JSON.stringify(patch) }),
};

// ---- Orders -------------------------------------------------------------
export type SizeKey = "single" | "couple" | "family";
export type LunchVariant = "with_rice" | "without_rice";
export interface SizePrices { single: number; couple: number; family: number }
export interface PricingGrid {
  breakfast: SizePrices;
  lunch_with_rice: SizePrices;
  lunch_without_rice: SizePrices;
  dinner: SizePrices;
}
export interface OrderMeal {
  enabled: boolean; quantity: number; size: SizeKey;
  item_name: string; lunch_variant: LunchVariant | null;
}
export interface DailyOrder {
  id: string; user_id: string; date: string;
  breakfast: OrderMeal; lunch: OrderMeal; dinner: OrderMeal;
  delivery_user_id: string | null; delivered: boolean; hotbox_collected: boolean;
  cutoff_passed?: boolean;
  customer_name?: string; customer_address?: string; customer_phone?: string;
  customer_notes?: string; customer_pincode?: string; total_quantity?: number;
}
export const ordersApi = {
  upcoming: () => api<DailyOrder[]>("/orders/upcoming"),
  modify: (id: string, meal: MealKey,
           patch: { enabled?: boolean; size?: SizeKey; lunch_variant?: LunchVariant }) =>
    api<DailyOrder>(`/orders/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ meal, ...patch }),
    }),
};

export interface Subscription {
  id: string; plan_type: PlanType; meals: MealKey[];
  default_quantity: number; start_date: string; end_date: string; active: boolean;
}
export const subsApi = {
  me: () => api<Subscription | null>("/subscriptions/me"),
};

// ---- Admin --------------------------------------------------------------
export const adminApi = {
  users: () => api<User[]>("/admin/users"),
  stats: () => api<{
    total_customers: number; pending_onboarding: number;
    active_subscriptions: number; today_orders: number;
    delivered_today: number; pincodes: number; wallet_low: number;
  }>("/admin/stats"),
  orders: (date?: string) =>
    api<DailyOrder[]>(`/admin/orders${date ? `?date=${date}` : ""}`),
};

// ---- Delivery -----------------------------------------------------------
export const deliveryApi = {
  route: (date?: string) =>
    api<DailyOrder[]>(`/delivery/route${date ? `?date=${date}` : ""}`),
  pickups: () => api<DailyOrder[]>("/delivery/pickups"),
  markDelivered: (id: string) =>
    api<DailyOrder>(`/delivery/orders/${id}/delivered`, { method: "POST" }),
  markHotbox: (id: string) =>
    api<DailyOrder>(`/delivery/orders/${id}/hotbox`, { method: "POST" }),
};

// ---- Support ------------------------------------------------------------
export interface SupportThread {
  id: string; customer_id: string;
  last_message_at: string; last_message_preview: string;
  unread_for_customer: number; unread_for_agent: number;
  customer_name?: string; customer_phone?: string; customer_pincode?: string;
}
export interface SupportMessage {
  id: string; thread_id: string;
  sender_id: string; sender_role: Role;
  kind: "text" | "voice";
  text: string; voice_b64: string; voice_duration_ms: number;
  created_at: string;
}
export const supportApi = {
  myThread: () => api<SupportThread>("/support/me"),
  listThreads: () => api<SupportThread[]>("/support/threads"),
  messages: (threadId: string) =>
    api<SupportMessage[]>(`/support/threads/${threadId}/messages`),
  send: (threadId: string,
         payload: { kind: "text" | "voice"; text?: string;
                    voice_b64?: string; voice_duration_ms?: number }) =>
    api<SupportMessage>(`/support/threads/${threadId}/messages`,
      { method: "POST", body: JSON.stringify(payload) }),
  unread: () => api<{ unread: number }>("/support/unread"),
};

// ---- Wallet -------------------------------------------------------------
export interface WalletTxn {
  id: string; user_id: string; type: "credit" | "debit";
  amount: number; balance_after: number; reason: string;
  ref_order_id: string | null; by_user_id: string | null;
  created_at: string;
}
export interface WalletInfo {
  balance: number; threshold: number;
  pricing: PricingGrid;
  daily_burn: number; days_left: number; low: boolean;
  recent: WalletTxn[]; suggested_topups: number[];
  default_size: SizeKey; default_lunch_variant: LunchVariant;
  subscribed_meals: MealKey[];
}
export const walletApi = {
  me: () => api<WalletInfo>("/wallet/me"),
  pricing: () => api<PricingGrid>("/wallet/pricing"),
  requestTopup: (amount: number) =>
    api<{ sent: boolean; thread_id: string }>("/wallet/topup-request",
      { method: "POST", body: JSON.stringify({ amount }) }),
  adminCustomers: () => api<User[]>("/admin/wallet/customers"),
  adminCredit: (userId: string, amount: number, reason: string) =>
    api<{ balance: number; txn: WalletTxn }>(`/admin/wallet/${userId}/credit`,
      { method: "POST", body: JSON.stringify({ amount, reason }) }),
  adminTxns: (userId?: string) =>
    api<WalletTxn[]>(`/admin/wallet/transactions${userId ? `?user_id=${userId}` : ""}`),
};
