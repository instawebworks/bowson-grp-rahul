# Bowson GRP — Full Manual Test Guide

*Written 14 July 2026 · covers every feature in the delivered system*

This guide walks the whole application end-to-end in dependency order — each phase
sets up the data the next phase needs. Follow it top to bottom and you will have
exercised every feature once. Budget **2–3 hours** for the complete pass.

**How to use it:** work through the numbered steps. Every step has an
**Expect:** line — if what you see differs, record the step number, what you
expected, what actually happened, and a screenshot (see "Reporting a problem"
at the end).

---

## Before you start

1. **Start the app** (if not already running):
   ```
   pnpm dev
   ```
   - Web app: http://localhost:5173
   - API health check: http://localhost:4000/health → should show `"db":"ok"`
2. **Credentials**
   - Manager: tap **🔐 Manager Login**, PIN **1234** (unless already changed)
   - Operatives: tap their name, PIN **1234** unless the manager has set one
3. ⚠ **The app uses the real shared database.** Prefix everything you create with
   **`TEST-`** so it can be found and deleted afterwards.
4. Use **Chrome or Edge**, with a second browser window available for the
   multi-user checks.

---

## Phase 0 — Sign-in & access control (~10 min)

### 0.1 Manager login
1. Open http://localhost:5173 (sign out first if a session is active).
   **Expect:** the sign-in screen — operative name cards with initials, a
   "Tap to sign in" hint, and a **🔐 Manager Login** button below.
2. Tap **Manager Login**, type a wrong PIN (e.g. 9999), press **→**.
   **Expect:** the dots shake and "Incorrect PIN — try again" appears. Nothing logs in.
3. Type **1234** and press **→** (the physical keyboard also works: digits + Enter).
   **Expect:** the full management app opens on the Dashboard. Top-right shows
   a **[→ Log out** button. There is **no** sign-out link at the bottom of the sidebar.
4. Click **[→ Log out**.
   **Expect:** back to the sign-in screen.

### 0.2 Operative login & PIN management
5. Log in as Manager → **Operatives & Settings** → click an operative (e.g. Mark
   Staniland) → set **Login PIN** to `2468` → Save changes.
6. Log out → tap that operative's name card → enter the old `1234`.
   **Expect:** rejected.
7. Enter `2468`.
   **Expect:** the **dark Shop Floor view** opens — "BOWSON GRP · SHOP FLOOR",
   the operative's name, tabs **MY TICKETS / AVAILABLE / BOARD**, and an icon
   sign-out button top-right. No sidebar, no manager pages.
8. Try to reach a manager page directly: type `http://localhost:5173/orders`
   in the address bar.
   **Expect:** you stay in the Shop Floor view — operatives cannot open manager pages.
9. Sign out, log back in as Manager, and reset that operative's PIN (clear the
   field or set back to `1234`).

### 0.3 Manager PIN change
10. **Operatives & Settings** → Manager PIN panel → enter current `1234`, new
    PIN twice → **Change PIN**. **Expect:** "✓ Manager PIN updated".
11. Log out → Manager Login with the **old** PIN. **Expect:** rejected.
12. Log in with the **new** PIN, then change it **back to 1234** so the rest of
    this guide's PIN prompts work as written.

---

## Phase 1 — Reference data (~25 min)

### 1.1 Customers
1. **Customers** → the search box filters the cards live.
2. Add `TEST-Customer` (name, contact, phone, region) → **Expect:** new card in
   the grid showing the region and "0 orders".
3. Click the card → edit a field → save → **Expect:** card updates.

### 1.2 Operatives & settings
4. **Operatives & Settings** → **+ Add operative** → `TEST-Op`, default 7.5 h/day.
5. Open `TEST-Op` → set the weekly pattern (Mon–Fri 7.5, weekend 0), tick the
   skills **Gel Coat** and **Laminating**, set an hourly rate → save.
   **Expect:** the card shows "37.5h standard week", the two skill chips, and
   the Mon–Sun day strip along the bottom.
6. **Stage Completion Weightings**: change one value (e.g. Laminating → 60) →
   **Save weightings** → **Expect:** "✓ Saved". Then **Reset to defaults**.
7. Click **Remove operative** on `TEST-Op`… but **Cancel** in the styled
   confirmation dialog (keep the operative — the Shop Floor phase uses it).
   **Expect:** a styled dialog (never a plain browser popup).

### 1.3 Moulds
8. **Moulds** → **+ New Mould** → `TEST-M1`, capacity **1**, Active.
9. Add `TEST-M2`, capacity **2**, Active.
10. **Register** tab → **Expect:** both listed; the **Status** badge shows live
    occupancy (**Free**, green) and **In use** shows `0/1` and `0/2`.
11. **⭳ Export CSV** → **Expect:** a moulds.csv downloads.

### 1.4 Product Catalogue
12. **Product Catalogue** → **+ New template** →
    - Tick **Single piece slide**, code `TEST-100`, name `TEST Single Slide`,
      SKU `TST-100`, price 500, labour hours 6, gel cure 30 → **Save to catalogue**.
    **Expect:** listed as **Single Slide · 1 piece · 6h**.
13. **+ New template** again (leave Single piece unticked) →
    - Code `TEST-200`, name `TEST Assembly`, price 2000, assembly hours 4
    - **+ Add part** three times: parts A/B/C, each with a detail, 3 h, and a
      default mould (give part A `TEST-M1`, part B `TEST-M2`, leave C without)
    - Keep the default hardware list (Bolt Pack ×1, Slide Feet ×4, Flange
      Supports ×0) — **the ×0 row must not block saving**
    - Upload any image as the **specification document** → **Save to catalogue**.
    **Expect:** listed as **Assembly · 3 parts**, hours = parts + assembly (13h),
    and a 📄 icon in the Spec column.
14. Click the 📄 icon → **Expect:** the spec opens in a black-&-white print view.
15. **⚙ Generate SKUs** (toolbar) → **Expect:** a preview listing SKUs only for
    templates *without* one. Cancel (or save — either is fine).
16. **⭳ Export CSV** → downloads. (The **⭱ Import CSV** wizard is tested with
    orders in Phase 2.7 — same pattern: template → upload → review → confirm.)
17. Open `TEST Single Slide` → **Delete** → **Expect:** styled red confirmation
    naming the product; **Cancel** it (it's used in the next phase).

---

## Phase 2 — Orders (~30 min)

### 2.1 Create an order (2-step wizard)
1. **+ Order** (top bar) → try **Create** with an empty despatch method.
   **Expect:** validation message; nothing is created.
2. Fill in: order number `TEST-9001`, customer `TEST-Customer` (also try the
   **+ New customer** popup once — then pick the existing one), customer ref
   `TEST Site`, despatch method, resin **M2**, upload a colour theme image → Create.
3. **Step 2:** search the catalogue box for `TEST` →
   - Add **TEST Assembly** ×1 with a colour (e.g. `Green RAL 6018`)
   - Add **TEST Single Slide** ×2 with a colour and a per-slide image
   **Expect:** each added line appears; the value updates; a **suggested
   production week and deadline** panel appears → click **✓ Accept suggestion**
   → **Done**.
4. **Expect:** order `TEST-9001` exists with status **Pending**; the assembly
   became a **COMP with 3 PART children**, the single slides are **MADE** tickets.

### 2.2 Orders list
5. **All Orders** → find `TEST-9001`: **Expect:** value = sum of items, progress
   0%, deadline countdown badge, Items column showing COMP/PART/MADE counts.
6. Type in the **per-column filter boxes** under the headers (order #, customer)
   → **Expect:** the list narrows; **✕ Clear** restores it.
7. **⭱ Export CSV** → downloads the current list.

### 2.3 Pending release (ticket numbers)
8. Open `TEST-9001` → **Expect:** every ticket's **TN column shows "—"** (no
   numbers while Pending).
9. **All Tickets** → **Expect:** an amber banner "⏳ N Pending Order(s) — ticket
   numbers not yet issued" listing `TEST-9001` → click **Review & Advance →**
   → release the order in the modal (two-step confirm).
   **Expect:** order becomes **In Progress**; back on the order detail every
   ticket now has a **sequential ticket number**; the audit log records
   "Released — N ticket numbers issued".

### 2.4 Order detail actions
10. **Edit order** → change the notes → save → **Expect:** persisted.
11. Click the **✎** on a ticket row → change detail/hours/price →
    **Expect:** row updates; order value recalculates.
12. **+ Add ticket** → add one more MADE ticket manually.
    **Expect:** it gets a ticket number immediately (order is no longer Pending).
13. Tick 2 tickets with the row checkboxes → bulk bar appears → **Advance one
    stage** → **Expect:** both move to "2. Materials Required", progress updates.
14. **Delete order** → **Expect:** manager PIN prompt first, then a styled
    red summary of what will be deleted → **Cancel** (keep the order!).

### 2.5 Order status logic
15. On **All Orders**, the status of an In Progress order is a dropdown — but
    order status also derives automatically; you'll see it flip to
    **Ready to Despatch** / **Despatched** automatically in Phase 5.

### 2.6 Duplicate order numbers
16. **+ Order** with number `TEST-9001` → **Expect:** rejected with "already
    exists". Cancel.

### 2.7 Bulk order import (CSV wizard)
17. **⭱ Import CSV** (top bar) → **Download template** → open it: two example
    orders. **Upload** it unchanged → step through **Review Orders / Review
    Colours / Review Tickets / Confirm** → **Import now**.
    **Expect:** "Imported 2 order(s)…" — and if any order fails, a **"Why these
    orders failed"** list with the order number and the reason (never a bare
    count).
18. Delete the two imported orders (Order detail → Delete order → PIN → confirm)
    → re-run the same import file → **Expect:** it imports again — deleted
    order numbers are reusable. Delete them again to clean up.

---

## Phase 3 — Production workflow & quality gates (~30 min)

Work on `TEST-9001` from the order detail page.

### 3.1 Stages & progress
1. Move a PART to "2. Materials Required" via its status dropdown.
   **Expect:** progress % changes automatically; an audit entry appears
   (from → to); the change also shows in **All Tickets**.
2. Try a stage far ahead (e.g. straight to "7. Assembly") from Spec/Materials.
   **Expect:** a confirmation asks you to confirm spec/materials are done first
   (styled dialog). Cancel it.

### 3.2 Mould flow
3. Set PART A to "3. Queue - Awaiting Mould" → in its **Mould/Cure** cell pick
   `TEST-M1`. **Expect:** the ticket **auto-advances to "4. Gel Coat"**; audit
   note "Auto-advanced — mould was free".
4. Set PART B to Queue and assign `TEST-M2` → same auto-advance.
5. **Moulds → Mould Board:** **Expect:** `TEST-M1` shows **Full 1/1** with the
   ticket under "In mould"; `TEST-M2` shows **Partial 1/2**.
6. **Register** tab → **Expect:** the same live statuses (Full / Partial).
7. Edit `TEST-M2` → status **Maintenance** → save. **Expect:**
   - Mould board groups it under **⚠ Maintenance**
   - It disappears from the mould dropdowns on the order page and ticket popup
     (a mould already assigned to a ticket stays visible, labelled
     "(in maintenance)")
   - **Dashboard** shows the red **"⚠ Cannot Produce — Mould in Maintenance"**
     panel if any queued ticket is assigned to it
8. Set `TEST-M2` back to **Active**.

### 3.3 Cure timers
9. PART A is in Gel Coat → in Mould/Cure pick a cure preset (30 min).
   **Expect:** an amber countdown chip appears and ticks (also on the T-Card
   board card).
10. Click the chip → **Expect:** confirm dialog → confirming **advances the
    ticket to the next stage** and the audit shows "Cure confirmed".

### 3.4 Assembly roll-up (COMP/PART)
11. Move **all three PARTs** of TEST Assembly through to **"8. QC Check"**.
    **Expect:** while parts are behind, the COMP row reads **"Awaiting Parts
    (x/3)"**; the moment the third part reaches QC, the COMP flips to
    **"7. Assembly"** by itself. COMP progress = average of its parts.
12. Try to advance a PART **past QC Check** → **Expect:** blocked — parts stop
    at QC; only the assembly carries on.

### 3.5 QC reference & packing checklist
13. Advance a MADE ticket to "8. QC Check", then to **"9. Packing"**.
    **Expect (two gates in order):**
    - a **QC Reference** prompt if the ticket has none — enter e.g. `QC-TEST-1`
    - then the **📦 Packing Checklist** — the hardware list from the TEST
      Assembly template (Bolt Pack ×1, Slide Feet ×4, Flange Supports ×0) with
      tick boxes, editable quantities and notes → **Confirm & Advance**.
14. Reopen the order → **Expect:** the saved checklist state is shown on the
    order detail page.

### 3.6 Family despatch gate
15. Move the COMP (assembly) to "10. Ready to Despatch" but leave at least one
    PART behind, then try to set the COMP's status to **Despatched**.
    **Expect:** blocked with a styled "family not ready" dialog listing exactly
    which members aren't at Ready — with a **Manager Override** path that asks
    for the PIN. Cancel; bring the whole family to **10. Ready to Despatch**
    properly (each PART, then the COMP). Also bring both MADE tickets to Ready
    (repeating the QC/packing gates).

---

## Phase 4 — T-Card Board (~20 min)

1. **T-Card Board** → **Expect:** dark full-screen board, 10 stage columns,
   your TEST tickets as cards **colour-coded by order** (all TEST-9001 cards
   share a palette), M2 warning visible, cure countdowns ticking.
2. **Drag** a card one column forward → **Expect:** it moves; if the target is
   Gel Coat/Laminating a **cure-time prompt** appears (presets + custom + the
   product's default); Esc/console shows no errors. Drag it back — gates that
   apply on the way forward (QC ref → Packing etc.) fire on drag too.
3. **By Operative** view → drag a card into an operative's column →
   **Expect:** the card gains their initials; the column groups by stage.
4. Press **▶** on a card (ops view) → **Expect:** a live HH:MM:SS timer and a
   **● LIVE** total in the column footer. Stop it.
5. **Right-click** a card → **Expect:** a context menu — assign/unassign
   operatives (checkboxes), start/stop their timers, **Stop all**.
6. **Bulk Assign** → select several cards (teal ring) →
   - in **stage view**: pick a target stage → confirm → all move
   - in **ops view**: pick an operative → confirm → all assigned
7. Click a card → detail popup → **📐 View Spec / Parts** → **Expect:** the
   spec document (or parts list) opens.
8. Toggle **scroll lock** off → **Expect:** manager PIN prompt.
9. **Esc** closes the board back to the Dashboard.

---

## Phase 5 — Despatch, delivery note & invoice (~20 min)

All TEST-9001 tickets should now be at **10. Ready to Despatch** (Phase 3.6).

1. **Ready to Despatch** page → **Expect:** TEST-9001's tickets listed with
   checkboxes, grouped with their order.
2. Tick **only one** MADE ticket → **Despatch selected** →
   **Expect:** a **Partial Despatch warning** naming the order ("1 of N items")
   → confirm → a **printable Delivery Note opens in a new tab, stamped
   PARTIAL DESPATCH**. (Allow pop-ups for localhost if blocked.)
3. Back on Ready: tick **everything remaining** for TEST-9001 → **Despatch
   selected** → **Expect:** no partial warning; delivery note opens; the order's
   status becomes **Despatched** automatically.
4. Try the **family gate from here** (optional re-check): with a fresh order you
   can verify despatching a COMP without its parts is blocked + PIN override works.
5. **Despatched** page → find TEST-9001 → **Expect:** three actions —
   - **📄 Delivery Note** → reprints the note
   - **🖨 Print Invoice** → opens a printable invoice **and flips the order to
     Completed**
   - after completing: **Copy Invoice** replaces it for reprints
6. **Return to production:** on **All Tickets** tick "Show despatched", find a
   TEST despatched ticket → **⚠ Override** → **Expect:** manager PIN → a styled
   confirm → the ticket returns to **8. QC Check** and the order reopens as
   In Progress. (Send it back through to Despatched afterwards, or leave —
   it's TEST data.)

---

## Phase 6 — Shop Floor (operative experience) (~20 min)

Keep some TEST work live first: put one TEST ticket in **4. Gel Coat** or
**5. Laminating** (a stage matching `TEST-Op`'s skills) as Manager, then log out.

1. Log in as **`TEST-Op`** (PIN 1234).
   **Expect:** the dark Shop Floor. **MY TICKETS** shows the empty state
   ("Join a ticket from the Available tab…").
2. **AVAILABLE** tab → **Expect:** a note "Your allocated stages: Gel Coat,
   Laminating" and only tickets at those stages, grouped by stage, with badge
   counts on the tab.
3. Tap **Join →** on a ticket → **Expect:** flash "✓ Joined … — timer running",
   auto-switch to MY TICKETS: the card has a green border, a **live ticking
   elapsed timer**, Pause / ✓ Stage Done / 📐 Details buttons.
4. Open a second browser as **Manager** → T-Card Board (ops view) →
   **Expect:** the same timer running against `TEST-Op` (within ~20 s).
5. Tap the card (Details) → **Expect:** the ticket popup with spec, stage,
   operatives and time.
6. Tap **Pause** → **Expect:** timer stops, card leaves MY TICKETS (back in
   Available). Re-join.
7. Tap **✓ Stage Done** → **Expect:** a confirm naming the from→to stages →
   the ticket advances and the timer stops. **Completed Today** section shows
   it with the minutes logged.
8. If a cure is running on one of their tickets, **Expect:** a Curing card with
   the countdown; when it expires — "✓ CURE COMPLETE — INSPECT" with
   **Ready — Advance**.
9. **BOARD** tab → **Expect:** read-only stage groups; tickets being worked
   show name chips (their own highlighted green). Tapping opens details.
10. Join a ticket again so a timer is running → press the **sign-out icon** →
    **Expect:** "End shift before signing out?" warning → **⏹ End shift & sign
    out** stops the timer and returns to the login screen.
    **Expect:** on the login grid, the operative card shows **● On shift**
    while their timer runs.

---

## Phase 7 — Planning: Schedule, Dashboard, Moulds planner (~20 min)

Back as **Manager**.

### 7.1 Schedule
1. **Schedule** → **Expect:** the planner grid — every operative × 16 weeks ×
   Mon–Fri, skills chips with an Edit button, week totals row (avail vs booked).
2. Click a day cell **in a future week** for `TEST-Op` → set **0** (holiday) →
   **Expect:** the cell shows "Off" highlighted amber **in that week only** —
   the same weekday in other weeks is unchanged; the week's capacity total drops.
3. Weekly Schedule cards below → **Expect:** TEST tickets appear in their
   accepted production week with utilisation bars.
4. **History** tab → **Expect:** metrics, per-week utilisation table, a date
   range selector and **hours export** to CSV (downloads a per-operative,
   per-day grid).

### 7.2 Dashboard
5. **Dashboard** → verify each block against reality:
   - 6 KPI cards (active orders, pending, slides/parts in production, moulds in
     use with %, man-hours remaining)
   - **⚠ Cannot Produce** panels appear only when true (test: put a queued
     TEST ticket on a Maintenance mould / leave one with no mould)
   - **Overdue Orders** table lists only orders past deadline (the sidebar
     "All Orders" item shows a red overdue count too)
   - Recent orders with progress bars; Hours Remaining by Stage
   - 8-week capacity summary + per-week cards (current week marked ★)
   - Stage Capacity (this week / next) reflecting `TEST-Op`'s skills
6. Click **Moulds in Use** card → **Expect:** jumps to the Moulds page.

### 7.3 Moulds planner tabs
7. **Schedule** tab → **Expect:** 3-week grid, mould rows, tickets in their
   weeks colour-coded by stage; ← Earlier / Later → moves the window.
8. **Tickets Without Mould** → assign a mould from the dropdown right there →
   **Expect:** the list shrinks (and the ticket auto-advances if it was queued).
9. **Unlinked Catalogue** → **Expect:** TEST Assembly's part C (no default
   mould) is listed → pick a mould in its dropdown → **Expect:** it disappears
   from the list (link is saved on the template).
10. **Register** → type in the filter box → **Expect:** rows filter by
    ref/name/notes.

---

## Phase 8 — Search & multi-user (~10 min)

1. Top-bar search: type a TEST ticket number → **Expect:** typeahead dropdown
   with matching orders/tickets → clicking jumps straight there.
2. Press **Enter** on a query → **Expect:** the full Search page (orders +
   tickets side by side), rows click through.
3. **Two managers at once:** open two browser windows as Manager → change a
   ticket status in one → **Expect:** the other updates within a few seconds
   without a manual refresh.
4. The **"✓ Saved HH:MM"** indicator in the top bar flashes teal after every
   successful change.

---

## Phase 9 — Cross-cutting checks (~10 min)

1. **No native browser popups anywhere** — every confirm/delete/release uses
   the styled dialog (⚠ icon, red button for destructive actions, Esc/outside
   click cancels, "Working…" while busy).
2. **Validation errors are specific** — e.g. try saving a catalogue item with a
   broken value; the message names the field, never just "Invalid request body".
3. **Audit trail** — the bottom of the TEST order's detail page lists every
   status change, release, override and cure confirmation from this session,
   newest first, with from→to values.
4. **CSV exports** each download and open in Excel: Orders, In Production,
   Moulds, Catalogue, Schedule hours.
5. **Manager PIN gates** (all should prompt): standalone **+ Ticket**, order
   delete, despatch family override, return-to-production, board scroll unlock.

---

## Clean-up after testing

As Manager:
1. Delete TEST orders (Order detail → Delete order → PIN → confirm) — this
   removes their tickets too.
2. Product Catalogue → delete `TEST-100` and `TEST-200`.
3. Moulds → Register → edit/delete `TEST-M1`, `TEST-M2`.
4. Operatives → remove `TEST-Op` (their recorded time is kept).
5. Customers → open `TEST-Customer` → delete.
6. Check the Dashboard afterwards — KPIs should return to the pre-test values.

---

## Known behaviours (not bugs)

- **Packing-checklist and QC-reference gates are screen-side** (as in the
  original tool): the board's *bulk* stage move and direct API calls skip them.
  The **family despatch gate is server-enforced** and cannot be skipped.
- Bulk moves report how many tickets moved; tickets skipped by a gate are
  silently left in place (matches the original).
- A **partially-despatched** order still offers Print Invoice on the
  Despatched page (same as the original tool) — the invoice is simply not
  generated automatically until the order fully ships.
- Deleting a single ticket asks for confirmation but not the manager PIN
  (only whole-order deletion is PIN-gated).
- Documents (delivery note / invoice) open in a new tab — allow pop-ups for
  the app's address the first time.
- Data refreshes on a ~5–20 s poll; two screens may briefly differ before
  converging.

## Reporting a problem

For each issue note:
1. **Phase & step number** (e.g. "3.5 step 13")
2. What you **expected** (quoted from the guide)
3. What **actually happened** + a screenshot
4. The order/ticket involved (e.g. `TEST-9001` #93012)

That's everything the developer (or I) need to reproduce and fix it quickly.
