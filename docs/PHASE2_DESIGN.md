# Phase 2 — Stage Merge · Labour Split · Theming Multipliers

Design for the client's snag-list points 7–9 (11 Aug), which interlock and ship
as one package on the `new-scope` branch. Reference data: the client's
`Order Book Schedule GRP MASTER V9.7.xlsx` (sheets: Mould Times, THEME
WORKINGS, Capacity by Skill, Mould Pressure, Remaining Labour).

> **Client sign-off needed** on the items marked ⚠ before cutover. Everything
> else is derivable from their snag list + spreadsheet.

---

## 1 · What the client asked for

7. **One column for Gel Coat + Laminating** — the same laminators do both,
   physically one continuous job at the mould. They also dislike the cure
   prompt on the board.
8. **Hours split into Laminating and Finishing** on the product catalogue —
   "Laminating covers stages 4 & 5 and finishing covers stages 6, 7, 8 and 9.
   If we input hours at this stage on the product catalogue then we can
   compare that with the capacity and remove the stage completion weightings."
9. **Mould complexity multipliers** by finish type, applied at point of order
   to the hours on the ticket (THEME WORKINGS sheet: PLAIN / THEMED /
   PLAIN WITH LEDS / THEMED WITH LEDS / ASSEMBLY ONLY).

Why one package: 7's merged stage IS 8's "Laminating" boundary; 8 removes the
stage weightings that make 7 delicate; 9's multipliers act on the hour buckets
8 introduces.

## 2 · New stage list (point 7)

Old: 1 Spec · 2 Materials · 3 Queue-Awaiting Mould · 4 Gel Coat ·
5 Laminating · 6 Trim & Finish · 7 Assembly · 8 QC Check · 9 Packing ·
10 Ready to Despatch · Despatched

New: **1 Spec · 2 Materials · 3 Queue-Awaiting Mould · 4 Gel Coat & Laminate ·
5 Trim & Finish · 6 Assembly · 7 QC Check · 8 Packing · 9 Ready to Despatch ·
Despatched**

- Full renumber (no "4 then 6" gap): status strings are the keys everywhere,
  so this is a one-off data rewrite at cutover (tickets, status history,
  settings) plus the shared constants. Cleaner than living with a hole.
- **Cure timers**: removed from the T-Card cards (the nag the laminators
  dislike). The cure clock keeps running silently for the **Mould Board**,
  where it genuinely matters ("when can this mould be re-loaded"). ⚠ confirm.
- Skills: "Gel Coat" + "Laminating" operative skills merge to one
  "Gel Coat & Laminate" skill (= the Laminator process in their roster).

## 3 · Labour model (point 8)

**Buckets** (per their spreadsheet):
- **Laminating** = everything at the mould: prep, gel coat, laminate, demould
  → consumed in stage 4 (new numbering).
- **Finishing** = trim & sand, repair, test assembly, flow coat, polish,
  edging, pack → consumed in stages 5–8.

**Data (additive columns — safe against the shared DB):**
- `catalogue_parts.lamHrs`, `catalogue_parts.finHrs` (nullable numeric).
  Existing `hrs` stays = total (back-compat; new code treats
  `lamHrs + finHrs` as the source when present).
- `tickets.lamHrs`, `tickets.finHrs` — snapshot at ticket creation
  (after multipliers).
- COMP tickets: `assemblyHrs` is Finishing-bucket labour.

**Catalogue CSV** gains `part_lam_hrs`, `part_fin_hrs` columns (existing
`part_hrs` still accepted = total → backfilled as ⚠ below).

**Remaining labour** (replaces stage-completion weightings): binary per
bucket, like their "Remaining Labour" sheet —
- Laminating hours outstanding until the ticket leaves stage 4.
- Finishing hours outstanding until the ticket reaches Ready to Despatch.

**Capacity**: operatives with the Gel Coat & Laminate skill form the
Laminating pool; everyone else with production skills the Finishing pool
(their roster: each person is process 1 or 2). The Schedule planner shows two
load-vs-capacity bars per week — Laminating and Finishing — instead of the
single weighted number. `STAGE_HRS_REMAINING` / `stageWeights` settings and
the Operatives & Settings weighting editor are retired at cutover.

**Backfill** ⚠: existing single `hrs` values are totals (their Mould Times
"Active hrs"). We cannot derive the split automatically, so at migration:
`lamHrs = hrs, finHrs = 0`, flagged in the UI as "split not set". The client
re-imports the catalogue with the new columns (their Mould Times sheet has
every number: Lamination mins vs Trim/Assembly/Finishing/Packing mins).

## 4 · Theming multipliers (point 9)

New table `finish_types`: `id, name, lamMult, finMult, sort`. Seeded from
THEME WORKINGS, collapsed to the two buckets ⚠ (their sheet is per-sub-step;
these defaults need the client's confirmation — editable in Settings):

| Name | lamMult | finMult |
|---|---|---|
| PLAIN | 1.0 | 1.0 |
| THEMED | 2.5 | 1.2 |
| PLAIN WITH LEDS | 1.5 | 1.1 |
| THEMED WITH LEDS | 3.0 | 1.4 |
| ASSEMBLY ONLY | 0 | 1.0 |

- **Order entry**: finish-type picker per slide (order wizard step + CSV
  `finish_type` column; default PLAIN). Stored as `tickets.finishTypeId`.
- **Applied once at ticket creation**: ticket `lamHrs = part.lamHrs × lamMult`,
  `finHrs = part.finHrs × finMult`; `hrs` = the sum (so every existing view
  keeps working). Changing a finish type later re-derives via the edit flow.
- Settings page gets a small Finish Types editor (name + two multipliers).

## 5 · Build order & DB safety

The shared database serves the deployed `main` app (client testers) AND this
branch. Rules:

1. **Additive now** (`migrate-phase2.ts`): new columns + `finish_types` table.
   Old code ignores them — zero impact on main.
2. **All branch code up to the stage merge** runs against old stage names.
3. **Cutover script** (`migrate-phase2-cutover.ts`, run ONLY at merge/deploy):
   rewrites ticket + history stage values (4→"Gel Coat & Laminate",
   5..10 renumbered), merges operative skills, deletes weighting settings,
   reloads PostgREST. Run at a quiet moment; old code and new data must not
   coexist.
4. Stage-merge code is tested locally before cutover using throwaway test
   orders (deleted after), or a disposable local DB via docker-compose if
   deeper soak-testing is needed.

Sequence: 8's data model + catalogue/CSV/forms → 9's finish types + order
entry → schedule/capacity rework (retire weightings) → 7's stage list +
board/mould changes → cutover script → merge + deploy + run cutover.

## 6 · Open questions for the client ⚠

1. Confirm the collapsed two-bucket multiplier values (table above).
2. Confirm cure timers moving to the Mould Board only.
3. Confirm the finishing pool = "everyone who isn't a laminator" (or an
   explicit Finishing skill).
4. Re-import the catalogue with split hours after cutover (we'll prep the
   template from their Mould Times sheet).
