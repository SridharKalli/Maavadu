# Home Tiffin Service — PRD (Chennai)

## Vision
Mobile-first companion for a home-cooked tiffin business in Chennai. Replaces
phone-based ordering with phone+OTP onboarding, pincode-gated self-signup,
flexible per-meal subscriptions, an 8 PM cutoff for next-day modification, a
delivery loop that handles both drops and hotbox pickups, and an in-app
support chat (text + voice) wired to a dedicated agent role.

## Roles
- **Customer** — Today · Menu · Support (chat + voice) · Profile
- **Admin** — Dashboard · Orders · Menu · Pincodes · Profile
- **Delivery** — Route (Deliveries / Pickups tabs) · Profile
- **Agent** — Threads (inbox + chat panel) · Profile

## Onboarding (new customer)
Phone OTP → browse this week's menu → enter family name → enter 6-digit
pincode (checked against admin's serviceable list) → address + delivery notes
→ pick meal combo (any subset of B/L/D) + members (1/2/3) + plan
(Day/Week/Month) → confirmation. Orders for the next 7 days are auto-generated
only for the subscribed meals.

## Business rules
- Sunday = holiday (no menu, no orders).
- Customer can edit a day's order until **8 PM IST the previous day**.
- Quantity = members served per meal, 0..3.
- Meal modifications validated against subscription — only subscribed meals
  can be modified.
- Pincode must be present and active in `pincodes` collection to onboard /
  serve a customer.
- Hotbox left on delivery must be picked up before next drop. The
  `/delivery/pickups` endpoint surfaces every delivered order whose hotbox is
  not yet back.

## Support chat
Per-customer thread auto-created on first open. Messages are either text or
voice notes (m4a, base64 data URI, capped ~8 MB). Customer ↔ agent. Unread
counters tracked separately per side. Polled every 4 s when chat panel open,
10 s on the agent thread list.

## Data (MongoDB collections)
`users` · `weekly_menu` · `pincodes` · `subscriptions` · `orders` · `otps` ·
`support_threads` · `support_messages`. Every document uses a UUID `id` we
control; `_id` is excluded from API responses.

## Auth
Phone + OTP. Dev mode returns OTP in `send-otp` response (no SMS provider
yet). Seed users in `/app/memory/test_credentials.md`.

## Tech
- Backend: FastAPI + Motor + MongoDB, JWT (HS256), IST timezone, seed on
  startup. Python.
- Frontend: Expo SDK 54, expo-router, expo-audio (recording), expo-file-system
  (base64), expo-image, react-native-safe-area-context, Feather icons. Works
  on iOS, Android & Web.
