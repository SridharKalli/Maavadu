# Home Tiffin Service — PRD (Chennai, wallet edition)

## Vision
Mobile-first companion for a home-cooked tiffin business in Chennai with a
BigBasket-Daily-style **wallet model** instead of fixed-tenure subscriptions.
Customers pre-fund a wallet, each delivery debits the wallet at the configured
per-meal price, low-balance triggers a top-up nudge in-app and a chat handoff
to the agent.

## Roles
- **Customer** — Today · Menu · Support · Profile (+ Wallet screen pushed from
  the home banner)
- **Admin** — Home · Orders · Wallets · Menu · Pincodes
- **Delivery** — Route (Deliveries / Pickups tabs) · Profile
- **Agent** — Threads · Profile (can also credit wallets)

## Wallet model
- Each user has `wallet_balance` and `wallet_threshold` (default ₹500).
- Pricing per portion is admin-configurable (Pricing collection). Defaults:
  breakfast ₹60, lunch ₹120, dinner ₹120. Couple = 2 portions, Family = 3
  portions.
- `mark_delivered` is idempotent and auto-debits the wallet based on what was
  actually delivered (only enabled meals × qty × portion price). The reason
  string captures the breakdown.
- Customer can request a top-up of ₹1500 / ₹2000 / ₹3000 / ₹5000 — a chat
  message is created in their support thread for the agent to confirm
  payment offline.
- Admin / agent credits the wallet via `POST /api/admin/wallet/{user_id}/credit`.

## Order flow (unchanged, but value flows via wallet)
- Each day's order is generated from the customer's subscription meals.
- Customer modifies tomorrow's order per meal via a 4-way segmented control:
  Skip / Single ×1 / Couple ×2 / Family ×3. Quantity 0..3 enforced at API.
- Modifications locked at 8 PM IST the previous day.
- Hotbox left at delivery; pickup queue surfaces unreturned boxes.

## Data (MongoDB collections)
`users` · `weekly_menu` · `pincodes` · `subscriptions` · `orders` · `otps` ·
`support_threads` · `support_messages` · **`pricing`** · **`wallet_txns`**.
Every doc uses a UUID `id`; `_id` excluded from API responses.

## Tech
- Backend: Python + FastAPI + Motor + MongoDB, JWT (HS256), IST timezone,
  seed on startup.
- Frontend: Expo SDK 54, expo-router, expo-audio, expo-file-system,
  expo-image, react-native-safe-area-context, Feather icons. iOS / Android /
  Web from one codebase.
