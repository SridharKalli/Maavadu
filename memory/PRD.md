# Home Tiffin Service — PRD (Chennai, wallet edition)

## Vision
Mobile-first companion for a home-cooked tiffin business in Chennai with a
BigBasket-Daily-style **wallet model** instead of fixed-tenure subscriptions.
Customers pre-fund a wallet, each delivery debits the wallet at the configured
per-meal × size price, low-balance triggers a top-up nudge in-app **and an
automatic friendly message in the support thread** when the wallet covers
fewer than 3 days of meals.

## Roles
- **Customer** — Today · Menu · Support · Profile (+ Wallet screen pushed from
  the home banner)
- **Admin** — Home · Orders · Wallets · Menu · Pincodes (sign-out icon on Home)
- **Delivery** — Route (Deliveries / Pickups tabs) · Profile
- **Agent** — Threads · Profile (can also credit wallets)

## Wallet model
- Each user has `wallet_balance` and `wallet_threshold` (default ₹500).
- Pricing is admin-configurable and per (meal × size). Defaults:
  | Meal              | Single | Couple | Family (4 members) |
  |-------------------|-------:|-------:|-------------------:|
  | Breakfast         | 230    | 340    | 460                |
  | Lunch (with rice) | 268    | 385    | 530                |
  | Lunch (no rice)   | 240    | 340    | 460                |
  | Dinner            | 230    | 340    | 460                |
- `mark_delivered` is idempotent and auto-debits the wallet based on what was
  actually delivered (only enabled meals at their chosen size + lunch variant).
- Customer can request a top-up of ₹3000 / ₹6000 / ₹10000 (or custom) — a
  chat message is created in their support thread for the agent to confirm
  payment offline.
- Admin / agent credits the wallet via `POST /api/admin/wallet/{user_id}/credit`.
- **Predictive nudge:** when a debit pushes the wallet below 3 days of meals,
  the backend auto-posts a friendly agent message into the customer's support
  thread (de-duped per UTC day, prefix `[Auto · YYYY-MM-DD]`).

## Onboarding (wallet-native)
7 steps: **menu preview → name → pincode → address → preferences
(meals + Single/Couple/Family-4 + lunch with/without rice + live ₹/day
estimate) → wallet top-up (3000 / 6000 / 10000 / custom / skip) → done**.
No plan tenure picker — subscriptions are rolling, value gating is the wallet.

## Order flow
- Each day's order is generated from the customer's subscription meals.
- Customer modifies tomorrow's order per meal via a 4-way segmented control:
  Skip / Single / Couple / Family. Lunch has an extra With rice / No rice toggle.
- Modifications locked at 8 PM IST the previous day.
- Hotbox left at delivery; pickup queue surfaces unreturned boxes.

## Admin polish
- Sign-out icon on Admin dashboard (profile tab hidden from tab bar).
- Stats grid: Families · Active Subs · Today's Orders · Delivered · **Low
  Balance** · **Pincodes**.
- Customer list shows wallet balance pill (red when below threshold).

## Data (MongoDB collections)
`users` · `weekly_menu` · `pincodes` · `subscriptions` · `orders` · `otps` ·
`support_threads` · `support_messages` · `pricing` · `wallet_txns`.
Every doc uses a UUID `id`; `_id` excluded from API responses.

## Tech
- Backend: Python + FastAPI + Motor + MongoDB, JWT (HS256), IST timezone,
  seed on startup.
- Frontend: Expo SDK 54, expo-router, expo-audio, expo-file-system,
  expo-image, react-native-safe-area-context, Feather icons. iOS / Android /
  Web from one codebase.
