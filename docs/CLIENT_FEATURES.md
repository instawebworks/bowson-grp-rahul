# Bowson GRP — Production System · Feature Summary

*Prepared 13 July 2026*

A complete, modern web application that manages the entire Bowson GRP workflow: taking
customer orders, planning and manufacturing every slide and part on the shop floor, and
despatching finished work with professional paperwork — all in real time, for the whole
team at once.

**At a glance:** 14 connected modules · a 10-stage production workflow with built-in
quality gates · print-ready Delivery Notes & Invoices · a dedicated operative app ·
live multi-user updates.

---

## Dashboard & early warnings
- **Six live metrics** — active orders, orders awaiting release, slides and parts in production, moulds in use, and total man-hours remaining.
- **"Cannot Produce" alerts** — flags tickets blocked by a mould under maintenance, and tickets with no mould assigned, before they hold up production.
- **Overdue orders table** — every late order with days-over, one click from its detail; the main menu shows a red overdue counter at all times.
- **Capacity outlook** — 8-week booked-vs-available hours, current lead time for new slides, and per-skill staffing for this week and next.

## Orders & customers
- **Two-step order wizard** — order details, then products added straight from the catalogue with live search, colour/RAL choice, per-slide reference photos, and a suggested delivery date based on real factory capacity.
- **Controlled release to production** — new orders wait in Pending until a manager releases them; ticket numbers are issued only at that moment.
- **Powerful order list** — search, per-column filters, overdue flags, progress, deadline countdowns, values, CSV export.
- **Customer records** — full contact details with a click-through list of each customer's orders.
- **Order detail page** — every ticket with its stage, the packing checklist, colour theme image, value, progress, activity history, and bulk actions.

## Production workflow with built-in quality gates
Every slide, assembly and part is a ticket moving through ten stages — Spec Required to
Ready to Despatch. The system enforces the quality rules automatically:
- **QC reference gate** — nothing enters Packing without a QC reference.
- **Packing checklist gate** — entering Packing prompts a hardware checklist (bolt packs, slide feet, flange supports…) saved on the order.
- **Assembly family rule** — an assembly cannot be despatched until every part is ready; manager PIN required to override.
- **Confirmation when skipping ahead** — leaving Spec/Materials asks for confirmation that spec was reviewed and materials are available.
- **Bulk operations** — advance many tickets at once, move a whole stage, or assign an operative to a selection.
- **Full audit trail** — every stage change, override and release logged with who-what-when.

## The T-Card board — digital, but familiar
- **Drag-and-drop cards** between stage columns; all quality gates still apply.
- **Cards tell the whole story** — ticket number, product, colour spec, photo, deadline with OVERDUE flag, progress bar, assignees, and a prominent M2 RESIN warning. Each order gets its own card colour.
- **By Stage or By Operative** — flip the board to see each person's workload grouped by stage, with live clocked-on time.
- **One-click time tracking** — operatives clock on/off from the card; right-click menu manages assignments and timers.
- **Gel-coat & laminating cure timers** — with per-product defaults, live countdowns, and ready / more-time / touch-up decisions.
- **Locked screen mode** for workshop displays; unlocking needs the manager PIN.

## Despatch, delivery notes & invoices
- **Ready-to-Despatch view** — tick the items going out; the family rule is checked before anything leaves.
- **Partial despatch handling** — flagged clearly, marked PARTIAL DESPATCH on paperwork, invoice held until the order completes.
- **Printable Delivery Note** — branded, itemised with quantities and QC references, customer signature block.
- **Printable Invoice** — itemised with unit/net prices, subtotals, total and payment terms; printing it marks the order Completed. Reprints any time.

## Production planner & capacity
- **16-week planner grid** — every operative's hours day-by-day; click any day to record holiday, absence or overtime for that week only.
- **Booked vs. available per week** with over-booking warnings; the current week counts only the days remaining.
- **Suggested schedules** — the system walks forward through free capacity and proposes a start week and realistic deadline.
- **Hours export** — any date range of operative hours to a spreadsheet.

## Mould management
- **Mould board** grouped into In Use / Available / Maintenance, with one-click assign and unassign.
- **Automatic progression** — assigning a free mould moves the waiting ticket straight into Gel Coat.
- **Maintenance awareness** — shows exactly which tickets a broken mould is holding up; one-click "Mark as Active". Moulds under maintenance are hidden from every assignment list, so no new work can be booked onto them by mistake.
- **Live mould register** — every mould shows its real-time status (Free / Partial / Full / Maintenance) and how many slots are in use, alongside reference, capacity and notes.
- **3-week mould schedule** calendar; **catalogue linking** so future tickets know their mould automatically; **register with CSV import/export** and search.

## Product catalogue & SKUs
- **Product templates** — single-piece or multi-part, with per-part drawings, hours and default moulds, packing hardware, cure times, and an attached specification (viewable in print-friendly black & white).
- **Automatic SKU generator** — shop-floor SKUs built from the product's dimensions, singly or for the whole catalogue at once.
- **Guided catalogue import** — five steps: template, upload, define SKUs with live preview, review with errors/warnings, confirm. Existing products are updated, not duplicated.

## Import, export & search
- **Order import wizard** — whole order books from a spreadsheet, with catalogue matching, per-slide and per-part colour review, price checks and final confirmation.
- **CSV export everywhere** — orders, tickets, production lists, moulds, catalogue, hours.
- **Instant global search** — ticket number, order number or site name from the top bar.

## Sign-in built for a factory
- **Tap your name, enter your PIN** — the sign-in screen shows every operative as a card
  (with a live "● On shift" indicator), plus a Manager Login button. No usernames, no
  email addresses — a big-button PIN pad designed for a shared workshop screen or tablet.
- **Manager PIN** — the manager signs in with a single PIN (changeable at any time in
  Settings) and gets the full management application.
- **Manager-set operative PINs** — each operative has their own PIN, set by the manager
  in their profile. Signing out returns to the name screen so the next person can tap in.

## The operative app (shop floor)
When an operative signs in they get their own focused, dark-themed factory view — not the
management screens — with three tabs:
- **My Tickets** — the jobs they're clocked onto, each with a **live running timer**,
  Pause, and a one-tap **✓ Stage Done** that moves the job on and stops the clock. Cure
  countdowns appear here with a "Ready — Advance" prompt when the cure completes, and a
  **Completed Today** list totals the hours they've logged.
- **Available** — the queue of work at *their* allocated stages (from their skills
  profile). One tap on **Join** assigns them and starts their timer. Shows who else is
  already working on each job.
- **Board** — a live, read-only view of the whole production board, stage by stage,
  showing who's working on what right now.
- **⏹ End Shift** stops all their timers in one tap; signing out with timers still
  running asks first so no time is lost.

## Team, access & security
- **Roles enforced everywhere** — managers control orders, pricing and settings;
  operatives get exactly the shop-floor actions they need and nothing more (the server
  refuses manager actions from an operative sign-in, and PINs are never visible to them).
- **Manager PIN** for sensitive overrides (incomplete-assembly despatch,
  return-to-production, order deletion, unlocking the workshop screen) — changeable in Settings.
- **Operative profiles** — skills per stage, standard weekly hours, hourly rate,
  week-by-week availability, and their sign-in PIN.
- **Adjustable workflow weightings** driving all capacity maths.

## Built on a modern, dependable foundation
- **Works anywhere** — any modern browser on desktop, laptop or tablet; nothing to install.
- **One shared source of truth** — a secure cloud database; one person's changes appear on everyone's screen within moments.
- **Every action accountable** — a full activity log behind every order and ticket.
- **Room to grow** — industry-standard components, so reports, customer portals and integrations can be added without rebuilding.

> **Faithful upgrade:** every feature of the original Bowson tool was inventoried and
> carried over one-for-one, then verified end-to-end — while gaining what the old
> single-file tool could never offer: secure logins, multiple simultaneous users, a real
> database, and professional printed documents.
