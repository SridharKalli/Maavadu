import { storage } from "@/src/utils/storage";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;

export type Role = "customer" | "admin" | "delivery";

export interface User {
  id: string;
  phone: string;
  name: string;
  role: Role;
  address: string;
  notes: string;
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
  updateMe: (patch: { name?: string; address?: string; notes?: string }) =>
    api<User>("/auth/me", { method: "PATCH", body: JSON.stringify(patch) }),
};

// ---- Menu ---------------------------------------------------------------
export interface MealItem { name: string; description: string }
export interface WeeklyMenu {
  id: string; day_of_week: number; is_holiday: boolean;
  breakfast: MealItem | null; lunch: MealItem | null; dinner: MealItem | null;
}
export const menuApi = {
  week: () => api<WeeklyMenu[]>("/menu/week"),
  update: (day: number, patch: Partial<WeeklyMenu>) =>
    api<WeeklyMenu>(`/menu/${day}`, { method: "PUT", body: JSON.stringify(patch) }),
};

// ---- Orders -------------------------------------------------------------
export interface OrderMeal { enabled: boolean; quantity: number; item_name: string }
export interface DailyOrder {
  id: string; user_id: string; date: string;
  breakfast: OrderMeal; lunch: OrderMeal; dinner: OrderMeal;
  delivery_user_id: string | null; delivered: boolean; hotbox_collected: boolean;
  cutoff_passed?: boolean;
  customer_name?: string; customer_address?: string; customer_phone?: string;
  customer_notes?: string; total_quantity?: number;
}
export const ordersApi = {
  upcoming: () => api<DailyOrder[]>("/orders/upcoming"),
  today: () => api<DailyOrder | null>("/orders/today"),
  modify: (id: string, meal: "breakfast"|"lunch"|"dinner",
           patch: { enabled?: boolean; quantity?: number }) =>
    api<DailyOrder>(`/orders/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ meal, ...patch }),
    }),
};

// ---- Admin --------------------------------------------------------------
export const adminApi = {
  users: () => api<User[]>("/admin/users"),
  stats: () => api<{
    total_customers: number; active_subscriptions: number;
    today_orders: number; delivered_today: number;
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
