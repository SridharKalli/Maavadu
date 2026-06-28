# Home Tiffin Service — PRD

## Vision
A mobile-first companion for a home-cooked tiffin business (~200 families). Replace
phone-based daily-modification calls with an app that respects an 8 PM cutoff, helps
the kitchen plan, and gives the delivery partner a clean route + hotbox-return loop.

## Roles & Tabs
- **Customer** (Today · Menu · Profile): see today's meals, modify tomorrow's order
  (members per meal, max 3) before 8 PM cutoff, browse weekly menu, edit
  address/notes.
- **Admin** (Dashboard · Orders · Menu · Profile): KPIs, today's kitchen count,
  per-family orders, edit weekly menu.
- **Delivery** (Route · Profile): two-tab route view — *Deliveries* (today) and
  *Pickups* (yesterday's hotboxes still pending collection), tap-to-call, mark
  delivered, mark hotbox collected.

## Business rules (encoded in backend)
- Sunday = holiday (no menu, no orders generated).
- Weekly set menu Monday–Saturday for breakfast/lunch/dinner.
- Customer can edit a day's order until **8 PM IST the previous day**.
- Order quantity = members served per meal, capped 0..3 (1/2/3 SKUs).
- Hotbox is left at customer place on delivery and must be picked up before the
  next drop. The `/delivery/pickups` endpoint surfaces every delivered order whose
  hotbox is not yet back.

## Auth
Phone + OTP. Dev mode returns OTP in `send-otp` response (no SMS provider yet).
Seed users:
- Admin: +919000000001
- Delivery: +919000000002
- Customers: +919999911111, +919999922222, +919999933333

## Tech
- Backend: FastAPI + Motor + Mongo, JWT (HS256), seed on startup, IST timezone.
- Frontend: Expo SDK 54, expo-router, expo-image, react-native-safe-area-context,
  Feather icons. Works on iOS, Android, and web — no platform-specific gating.

## Status
- Phone OTP login, role-based routing, all customer / admin / delivery screens
  implemented with seed data.
- Deliveries + pickups split tabs on delivery route.
- Quantity capped 0–3 (members).
