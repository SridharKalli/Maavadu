#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

user_problem_statement: |
  Home-cooked tiffin service MVP for Chennai. Wallet-driven (BB-Daily style) prepaid
  model. 3 roles (customer/admin/delivery/agent). Specific pricing grid (Breakfast,
  Lunch with/without rice, Dinner across Single/Couple/Family-4 members).
  Onboarding refactored to wallet top-up flow. Admin polish: sign-out + low-balance
  stats. Predictive low-balance nudge auto-posts in support thread when <3 days runway.

backend:
  - task: "Pricing grid + wallet daily_burn math (Single/Couple/Family-4, lunch with/without rice)"
    implemented: true
    working: "NA"
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Updated Pricing model with breakfast (230/340/460), lunch_with_rice (268/385/530), lunch_without_rice (240/340/460), dinner (230/340/460). _debit_for_order computes via meal × size × variant. /wallet/me returns daily_burn + days_left."

  - task: "Onboarding wallet refactor — drop plan_type, accept default_size + initial_topup"
    implemented: true
    working: "NA"
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "OnboardReq no longer has plan_type/default_quantity. Subscription is rolling (end=+365d). Optional initial_topup credits wallet via _record_wallet_txn."

  - task: "Admin stats — add wallet_low (customers below threshold)"
    implemented: true
    working: "NA"
    file: "backend/server.py"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "GET /api/admin/stats now returns wallet_low via Mongo aggregation comparing wallet_balance < wallet_threshold."

  - task: "Predictive low-balance nudge in support thread"
    implemented: true
    working: "NA"
    file: "backend/server.py"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "After every wallet debit, if days_left < 3, an agent-role system message is posted into the customer's support thread (de-duped per UTC day via [Auto · YYYY-MM-DD] prefix)."

frontend:
  - task: "Customer Home — pricing-aware segmented control + lunch variant toggle"
    implemented: true
    working: "NA"
    file: "frontend/app/(customer)/home.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Fixed undefined SIZE_OPTIONS/mealToSize references (renamed to SEG_OPTIONS/mealCurrentSeg). Tomorrow card now shows With rice/No rice chips and Skip/Single/Couple/Family segmented with ₹ price below each label. Verified visually: ₹230/₹340/₹460 for breakfast couple-active."

  - task: "Wallet pricing grid + top-up chips"
    implemented: true
    working: "NA"
    file: "frontend/app/(customer)/wallet.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Verified visually: pricing table renders 4 rows (Breakfast, Lunch with rice, Lunch no rice, Dinner) × 3 size columns. Footer reads Single=1 · Couple=2 · Family=4 members."

  - task: "Onboarding rewritten — preferences + wallet top-up step (3000/6000/10000/custom)"
    implemented: true
    working: "NA"
    file: "frontend/app/onboarding.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Removed Day/Week/Month plan picker. New flow: menu → name → pincode → address → preferences (meals + Single/Couple/Family + Lunch with/without rice + live daily estimate) → topup (3000/6000/10000/custom with day-coverage hint, skip allowed) → done."

  - task: "Admin Dashboard — sign-out button + Low Balance / Pincode stats"
    implemented: true
    working: "NA"
    file: "frontend/app/(admin)/dashboard.tsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Added top-right log-out icon (with confirm Alert) + 6-card stat grid (Families, Active Subs, Today's Orders, Delivered, Low Balance, Pincodes). Customer list now shows wallet balance pill (red when below threshold)."

metadata:
  created_by: "main_agent"
  version: "3.0"
  test_sequence: 3
  run_ui: false

test_plan:
  current_focus:
    - "Pricing grid + wallet daily_burn math (Single/Couple/Family-4, lunch with/without rice)"
    - "Onboarding wallet refactor — drop plan_type, accept default_size + initial_topup"
    - "Admin stats — add wallet_low (customers below threshold)"
    - "Predictive low-balance nudge in support thread"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
  - agent: "main"
    message: |
      Session 4 hotfix + feature batch.
      BUG FIX (admin logout): `Alert.alert` doesn't fire button callbacks on
      React Native Web — that's why the admin Sign Out icon did nothing.
      Replaced with a cross-platform `Modal`-based confirm dialog.
      TestIDs: `admin-signout` (opens modal) → `signout-confirm` (calls signOut)
      OR `signout-cancel` (closes modal). After confirm, the user MUST be
      bounced back to the /login screen (root layout watches auth.user).

      NEW FEATURE (admin pricing editor):
      • Backend: PUT /api/admin/wallet/pricing now accepts a per-meal × per-size
        grid (PriceRow schema) — previously only flat floats. Validates each
        cell is a non-negative number. Returns the merged grid.
      • Frontend: new route /(admin)/pricing — full 4×3 editable grid (rupee
        prefix per cell, Reset + Save). Reached from a "Edit pricing grid"
        shortcut card on the admin dashboard. TestIDs: `open-pricing-editor`,
        `price-{breakfast|lunch_with_rice|lunch_without_rice|dinner}-{single|couple|family}`,
        `pricing-save`, `pricing-reset`, `pricing-saved`, `pricing-error`.
      • api.ts: walletApi.updatePricing(grid) calls the new endpoint.

      Test priorities:
        1) Admin login → tap sign-out icon → confirm modal opens → tap
           `signout-confirm` → user is signed out and returns to /login.
        2) Cancel path: open modal → backdrop tap (`signout-backdrop`) or
           `signout-cancel` → modal closes, still logged in.
        3) Pricing editor: open from dashboard, change a couple of cells (e.g.
           Breakfast couple 340 → 360), save, reload — GET /api/wallet/pricing
           reflects the new value.
        4) Pricing validation: blank or negative cell → save shows error toast,
           backend returns 400.
        5) Regression: all 32 existing backend tests still pass.
      BACKEND:
      • New pricing grid (Pricing model + _debit_for_order + /wallet/me daily_burn) — verify
        couple Sharma (B+L+D with_rice) daily_burn=340+385+340=1065. (Visually confirmed.)
      • POST /api/onboarding/complete now expects {default_size, default_lunch_variant,
        initial_topup} — no plan_type / default_quantity. Use a fresh phone number,
        send-otp → verify-otp → complete with initial_topup>0 → /wallet/me should
        show that credit and a "Welcome top-up" txn.
      • GET /api/admin/stats now returns wallet_low (Khan family +919999933333 is seeded
        below threshold → expect wallet_low ≥ 1).
      • Auto-nudge: marking Khan's order delivered should debit wallet and (since
        balance ₹480, daily ~120 → days_left ≈ 4 not <3 actually). To trigger nudge,
        credit a low customer to e.g. ₹100, mark next day order delivered, then check
        their support thread — last message should start with "[Auto · YYYY-MM-DD]".

      FRONTEND (already visually sanity-checked in browser):
      • home.tsx pricing labels render and segmented works (couple/single/family).
      • wallet.tsx renders the 4-row × 3-col pricing table with Family=4 members footer.
      • Onboarding flow not yet end-to-end automated — would be good to dry-run a new
        phone through all 7 steps and confirm wallet shows the initial top-up.
      • Admin dashboard: sign-out icon visible top-right; 6 stat cards including
        Low Balance + Pincodes.

      Test priorities: Pricing math first, then onboarding API, then nudge.


# ---------------------------------------------------------------------------
# Iteration 11 (June 2026) — Pre-launch hardening
# ---------------------------------------------------------------------------

agent_communication:
  - agent: main
    message: |
      Applied the remaining 10 pre-launch code-review fixes. Please run the
      full pytest suite and verify the new behaviours below.

      BACKEND
      • E.164 phone validation on POST /api/auth/send-otp
          - {"phone":"invalid"} → 422 with E.164 error
          - {"phone":"+919000000001"} → 200 sent
      • Rate limit on /auth/send-otp: 3 requests per 60 seconds per phone.
          4th hit returns 429 "Too many OTP requests…". Configurable via
          OTP_RATE_MAX / OTP_RATE_WINDOW_SECONDS env vars.
      • Wallet ledger: record_wallet_txn now uses an atomic $inc + returnDocument,
          eliminating the read-then-write race. Existing tests for pricing
          math + delivery debits should still pass (balances should still
          land on the same totals).
      • Onboarding now sets subscription.end_date ~10 years out (rolling) and
          NO LONGER auto-credits initial_topup. Instead it inserts a pending
          support message with meta={"type":"topup_request","status":"pending",
          "amount":N,"source":"onboarding"} and returns topup_request_id.
          (See updated test_iteration3_wallet_pricing.py for both flows.)
      • New endpoints (admin/agent only):
          POST /api/support/messages/{message_id}/topup-approve
          POST /api/support/messages/{message_id}/topup-reject
          Approve runs an atomic credit and posts a confirmation message.
          Double-action returns 400.
      • /wallet/me suggested_topups now scales with the user's threshold
          (snapped to ₹500 increments). Default threshold 500 still yields
          [3000, 6000, 10000].
      • CORS_ALLOWED_ORIGINS defaults to https://maavadu.in in production
          (DEV_MODE=1 keeps "*" so the local Expo dev server still works).

      FRONTEND
      • /app/frontend/src/lib/ist.ts: new `istDateStr(offset)` helper.
          home.tsx now uses it for today/tomorrow lookups + hero date, so the
          UI stays on the IST calendar regardless of device timezone or
          UTC rollover late at night.
      • Upsell card price calculation simplified to a single "from ₹X" using
          Single + with_rice — removes the unreadable conditional chain that
          was tripping TS and could read off an unsubscribed meal row.
      • SupportMessage interface adds optional `meta`. ChatPanel renders
          inline Approve / Reject buttons for agents/admins on pending
          topup_request messages, a "Waiting for confirmation" pill for the
          customer, and a coloured Approved/Rejected badge once actioned.
      • supportApi.approveTopup / rejectTopup wired up.

      REGRESSIONS TO WATCH
      • If you re-run pytest within 60 seconds and any phone hits send-otp
          more than 3 times, you'll see 429s. Each fixture-scope phone in
          conftest only logs in once per session so this should not affect
          normal runs.

      PRIORITY ORDER
      1) New onboarding behaviour (no auto-credit + topup_request_id +
         10-year end_date).
      2) Topup-approve / -reject happy-path + double-action 400.
      3) Phone validation 422 + rate-limit 429.
      4) Regression: existing 32 tests for pricing math, delivery debits,
         admin stats, support roster.
      5) Frontend smoke: customer home loads, wallet balance & upsell card
         render, ChatPanel shows Approve/Reject when admin views a thread
         containing a pending topup_request.
