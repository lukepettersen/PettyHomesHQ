# PettyHomes HQ — Planning Notes

Status: **planning only — no app code yet.** Detail behind these decisions is in
`docs/fub-review.md`. Where the two differ, the latest owner decision is recorded here.

Next: clickable mockups (one at a time, owner feedback between) → SPEC.md + CLAUDE.md →
approval → build section by section with seed data.

## Goal

A private, owner-controlled CRM + transaction-coordination HQ for a Twin Cities agent
(~50 closings/year) that replaces Follow Up Boss (FUB), TickTick/Google Tasks, and the
Master File spreadsheet. Tied to the pettyhomes.com Google Workspace.

## Stack & hosting
- Next.js (App Router, TypeScript), Tailwind, Supabase (Postgres, auth, storage), Vercel.
- Managed hosting on paid plans. Plain Postgres, exportable; avoid Supabase-only features
  where practical.
- Desktop-first, usable in a phone browser.

## Users & roles
- Google sign-in; Workspace "Internal" OAuth app (owner is Workspace admin).
- Owner + assistant now; more users later. Configurable roles: Admin, Assistant.
- Assistant can do everything except see commissions — enforced in the database (RLS on a
  separate financials table), not just hidden in the UI.

## People
- Name, phones, emails (child tables, indexed), address, tags, source, stage.
- Kept from FUB: lead stages, sources, tags (editable in Admin).
- **Follow-up frequency** (7/30/60/90/180 days) is its own field, separate from stage, with a
  "due for a touch" list. Replaces the "N Day Sphere" stages.
- Household members table (names + birthdays) replaces Birthday 1–7.
- Mailing Name, Referred By, Homeiversary (auto-filled from a closed deal).
- Admin-defined custom fields (definitions table + JSONB).

## Deals — fewer stages + transaction checklist
On a contact: **+ Add Buyer** or **+ Add Seller**. Deal data is stored once (no BUY/SELL
contact fields, no Master File).

- **Buyer stages:** Lead → Consult → Rep Signed / Searching → Offer Out → Under Contract → Closed
- **Seller stages:** Lead → Consult → Listing Signed / Prep → Coming Soon → Active →
  Under Contract → Closed
- Steps between stages (BC sent, showings, withheld, media, coming-soon prep) are checklist
  steps. "Pending" = Inspection milestone Met/Waived, shown on the card, not a column.
- Completing a key step advances the stage automatically.
- Closed deals leave the board after ~30 days into a Closed list.
- Buyer rep / listing agreement (pre-deal) → purchase agreement(s). A failed PA stays in history.
- Purchase agreement: address, price, earnest money, seller contributions, commission, BAC
  (typed numbers), dates: Final Acceptance, Inspection, Written Statement (lender deadline),
  HOA Doc Rescission, Close.
- New construction is a deal flag that switches checklist steps, not a duplicate workflow.

## Transaction checklist engine
- Full checklist created up front, grouped by phase.
- Due dates relative to contract dates; auto-shift when dates change or are extended.
- Any order; steps can be Done / N/A / Skipped.
- Milestones: Pending / Met / Waived / Extended. Waiving resolves related steps.
- Conditional steps (HOA, new construction, pre-1978 lead paint, well/septic).
- Per-deal Next Up panel; All Transactions board.
- Email/text steps are one-click drafts from templates, with attachment slots.
- Calendar-invite, "move deal stage", and "re-date this task" steps are no longer needed.

## Tasks — TickTick-style, but simple
- Views: Today, Tomorrow, Next 7 Days, Overdue, Waiting on, Assigned to assistant.
- No folders. A short flat set of lists (e.g. Rentals, Podcast, Marketing, Admin, Personal).
- Deal checklist tasks appear in the same views.
- Natural-language quick add ("call lender re Murphy Fri 9am").
- Priority, tags, subtasks, recurrence (yearly mailers, weekly reports).
- Optional link to a person/deal; assignee; delegation status.
- Plain list by default; board/calendar optional. No habits or focus timer.
- Tasks do not go to Google Calendar.

## Messages (replaces FUB Inbox)
- Text messages + missed calls only. No email — email stays in Gmail.

## Calendar
- Deal milestones sync to Google Calendar, with optional client invites per event.

## Timeline
- One `activities` table (note, sms, call, email, stage_change, task_completed…) with
  `source` + `external_id` for dedupe, so integrations need no schema change.

## Integrations & data
- **No data import yet.** Build and review with seed data. FUB import (contacts, templates)
  later; the ~8,000-contact agent database decision is deferred to import time.
- Website lead capture from WordPress (form plugin TBD).
- Not wanted: MLS data, document storage, AI features.

## Review process
1. Clickable mockups as Artifacts (source in `mockups/`).
2. Vercel preview link per built section.
3. Screenshots for quick checks.
