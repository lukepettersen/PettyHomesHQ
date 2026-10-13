# CLAUDE.md — PettyHomes HQ

Private CRM + transaction-coordination app for Petty Homes. **Read `SPEC.md` first**; it is
the source of truth for behavior. The approved screens are in `mockups/` (open
`mockups/index.html`). Background research: `docs/`.

## Status

Spec written, awaiting owner approval. **Do not write app code until the owner approves
SPEC.md.** Build in the phases in SPEC.md §16, one pull request at a time.

## Working with the owner

- The owner (Luke) is not a developer. Explain choices in plain language, recommend one
  option, and keep summaries short.
- Don't add features beyond SPEC.md without asking. If something is unclear, add it to
  SPEC.md §17 Open questions and ask.
- When behavior changes, update SPEC.md in the same pull request.
- Never ask the owner to paste API keys, tokens or passwords into chat. They go in Railway
  environment variables; tell the owner exactly where to add them.
- Branch per change; open a PR only when asked; Railway preview link for the owner to test.

## Stack

- Next.js (App Router) + TypeScript (strict) + Tailwind.
- PostgreSQL on Railway via Prisma. Migrations are versioned and **non-destructive**
  (add columns/tables; backfill; never drop data without an explicit owner-approved plan).
- Auth.js with Google; only `@pettyhomes.com` emails may sign in (check `hd` claim and the
  email domain server-side).
- Worker service: pg-boss for queued and scheduled jobs (date-based task due dates,
  reminders, notification emails, nightly backups).
- Files: private S3-compatible bucket; signed URLs that expire.
- Tests: Vitest (unit/integration), Playwright (key flows).
- Timezone `America/Chicago`. Contract deadlines are `date` columns, not timestamps.

## Security rules (non-negotiable)

- Secrets only in environment variables. Never commit `.env*` (except `.env.example` with
  blank values). Never log secrets or full message bodies with personal data.
- Every server action / route handler: require a session, load the user's role, check the
  permission. No client-side-only checks.
- **Commissions:** strip commission fields from every response for users without
  "See commissions". Cover with a test for each endpoint that returns contracts or files.
- Validate all input with zod on the server.
- Soft delete (`deletedAt`) for people, files, contracts, tasks; Trash restores within 30
  days; a scheduled job purges after 30 days.
- Write an activity-log row for every create/update/delete (who, what, before/after summary).
- Integrations are **off until configured**: if Twilio or Google env vars are missing, the
  feature shows "not connected" and never errors. Texting also has an Admin on/off switch.
- Texting safety: honor STOP, skip Unsubscribed, quiet hours 8am–8pm Central, daily cap.
- No SSNs, bank or wiring details stored anywhere.

## Data model notes

- `Person` with child tables `Phone`, `Email`, `ImportantDate`, `PersonTag`.
- `ClientFile` (kind: buyer | listing, status, info JSON) → `PurchaseAgreement` (side, form
  answers JSON validated against the form definition, key dates as typed columns:
  finalAcceptance, inspection, writtenStatement, hoaRescission, closing; per-date status:
  pending/met/waived/extended).
- Commission and BAC live in a separate table so they can be withheld by permission.
- `Task` is one table for everything (person tasks, checklist steps, Misc, list tasks):
  optional personId, fileId, templateStepId; due is either fixed or anchor + offset, so it
  re-dates when the anchor changes.
- Settings tables for statuses, Under Contract columns, PA form definitions, templates,
  date reminders, tags, stages, sources, follow-up options, tools links, task list order.

## Conventions

- Match the mockup's wording and layout; branding tokens in SPEC.md §5.
- Explicit Save/Cancel for edits (SPEC.md §5 save rule); two-step confirm on deletes.
- Accessible: real buttons/labels, keyboard reachable, visible focus.
- Keep components small; server logic in `src/server/*`, UI in `src/app` and
  `src/components`.

## Commands

Filled in at scaffold (Phase 0): install, dev, test, lint, typecheck, migrate, seed.

## Mockups

- `mockups/*.html` are standalone page mockups; `mockups/build.py index.html` combines them
  into one clickable file. They hold fake in-memory data only and are reference, not
  production code.
