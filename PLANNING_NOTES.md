# PettyHomes HQ — Planning Notes

Status: **planning only — no app code yet.** Next deliverables are clickable mockups,
then SPEC.md + CLAUDE.md, then approval, then build section by section.

## Goal

A private, owner-controlled CRM + transaction-coordination HQ for a Twin Cities real
estate agent (~50 closings/year) that replaces Follow Up Boss (FUB) and Google Tasks.
Tied to the pettyhomes.com Google Workspace (Gmail, Calendar).

## Decisions so far

### Stack & hosting
- Next.js (App Router, TypeScript), Tailwind, Supabase (Postgres, auth, storage), Vercel.
- Managed hosting (Vercel + Supabase **Pro** plan, not free tier). Data stays exportable
  plain Postgres; avoid Supabase-only features where practical so self-hosting stays possible.
- Desktop-first, usable in a phone browser.

### Users, auth, roles
- Google sign-in via Supabase. pettyhomes.com is Google Workspace and the owner is admin,
  so the Google OAuth app can be "Internal" (no Google verification needed).
- Users: owner + assistant now; must be able to add more users later.
- Configurable roles. Starting roles: **Admin**, **Assistant**.
- Assistant can do **everything except see commissions**. Enforce at the database level:
  financials in a separate table blocked by row-level security, not just hidden in the UI.

### People (contacts)
- Standard fields: name, phones, emails, address, tags, source, stage.
- Phones and emails in child tables (indexed) so future Gmail/website matching works.
- Keep as plain contact fields: Mailing Name, Referred By, Homeiversary
  (Homeiversary auto-fills from a closed deal's close date).
- Admin-defined custom fields (text, number, date, dropdown, checkbox) stored as a
  field-definitions table + JSONB column.
- `source_system` / `external_id` for de-duplicated FUB import.
- Keep current FUB stages, sources, and tags (owner says they're decent). Editable in Admin.
  Late stages (e.g. Under Contract, Closed) should auto-sync from deal status; early stages stay manual.

### Deals — replaces FUB's BUY/SELL custom fields
On a contact: **+ Add Buyer** or **+ Add Seller**. Buyers and sellers have different steps.

**Buyer side**
1. Buyer Representation (pre-deal): agreement signed date, expiration, BAC, status.
2. Purchase Agreement(s) under it.

**Seller side**
1. Listing Agreement (pre-deal): list date, expiration, list price, commission, BAC offered, status.
2. Purchase Agreement(s) under it.

**Purchase Agreement fields** (from the current FUB custom fields):
address, purchase price, earnest money, seller contributions, commission, BAC, and dates:
Final Acceptance, Inspection Deadline, Written Statement (lender deadline on the contract),
HOA Doc Rescission, Close Date.

- A fallen-through purchase agreement stays in history; add a new one under the same rep/listing.
- One person can have both a Listing and a Buyer Rep at once.
- Deals link to multiple people with roles (buyer, seller, co-buyer, lender, title, co-op agent).

### Transaction checklist engine (the big upgrade over FUB)
FUB auto-creates tasks on the day they're due and breaks when things happen out of order.
Instead, work like transaction-coordination software:
1. Full checklist created when a purchase agreement is added, grouped by phase
   (Under Contract → Inspection → Financing → HOA → Pre-Closing → Closing → Post-Close).
2. Due dates relative to contract dates ("2 days before Inspection Deadline"); auto-shift
   when dates change or amendments extend deadlines.
3. Order-independent: complete anything anytime; steps can be Done / N/A / Skipped.
4. Contract deadlines are milestones with status: Pending / Met / Waived / Extended.
   Waiving a milestone resolves its related tasks.
5. Conditional steps (HOA only if HOA; FHA/VA; well/septic).
6. Per-deal **Next Up** panel (overdue, this week, next milestone, health color) and an
   **All Transactions** board across every active deal.
7. Templates editable in Admin, separate for buyer and seller; default assignee per step.

### Tasks (replaces Google Tasks entirely)
- Title, due date, notes, assignee, done status, priority, recurrence.
- Linking to a person/deal is optional — general tasks must work.
- Views: Today, Overdue, Upcoming, My tasks.
- One-time import from Google Tasks.
- Tasks do **not** go to Google Calendar.

### Calendar
- Deal deadlines/milestones sync to Google Calendar, with optional per-event client invites.

### Timeline
- Every person and deal has an activity timeline (notes first).
- Single `activities` table: type (note, email, sms, call, stage_change, task_completed…),
  links to people/deals, `metadata` JSONB, `source` + `external_id` unique for dedupe —
  so Gmail/Twilio can be added later with no schema change.

### Templates & automations
- Eventually import FUB email + text templates and action plans.
- Automations run differently: templates attached to checklist steps as **one-click drafts**
  (review, then send). Opt-in auto-send per step can come later.

### Integrations roadmap
- FUB: full import (contacts, notes, tags, stages, templates). API route skipped for now —
  owner prefers browsing FUB in a local session to review the setup.
- Gmail sync (later phase).
- Website lead capture: WordPress form plugin → webhook into HQ (creates contact, tags source,
  creates follow-up task). Need to confirm which form plugin.
- Not wanted: SMS-first features, MLS data, document storage, AI features (only website leads).

## How the owner wants to review
1. Clickable mockups first (Artifacts), with comments and revisions.
2. During build: a Vercel preview link per finished section, with seed data.
3. Screenshots for quick checks.

## Next steps
1. **Local desktop session:** browse FUB read-only (owner logs in) and capture what to keep.
   Use the checklist below.
2. Build mockups: contact page with + Add Buyer/Seller, rep/listing → purchase agreement form,
   deal checklist + Next Up panel, All Transactions board, task list.
3. Write SPEC.md and CLAUDE.md from the approved mockups; propose schema + folder structure.
4. Wait for approval, then build: auth + People with seed data first.

## FUB browsing checklist (read-only — never change anything in FUB)
Record findings in `docs/fub-review.md`:
- Lead stages (names, order), sources, tags, custom fields
- Users and roles/permissions
- Pipelines/deal stages, if used
- Email templates and text templates (names, what each is for)
- Action plans/automations: triggers, steps, timing — and which ones misfire when deals go out of order
- Smart lists the owner relies on
- Screens/layouts the owner likes or dislikes (ask the owner as you go)
