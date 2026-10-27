# CLAUDE.md — PettyHomes HQ

Private CRM + transaction-coordination app for Petty Homes. **Read `SPEC.md` first**; it is
the source of truth for behavior. The approved screens are in `mockups/` (open
`mockups/index.html`). Background research: `docs/`.

## Status

SPEC.md approved 2026-10-13. Build in the phases in SPEC.md §16, one pull request at a time.
Current phase: **1**. Done: Phase 0; piece 1 (People list, Add person, contact page cards + timeline, Admin users/roles, stages/sources/follow-up, tags); piece 2 (smart list editing, bulk actions, search, Trash, CSV export); piece 3 (Tasks page, quick add, contact Tasks card, Create task pop-up); piece 4 (@mentions + bell, Date reminders, Tools menu, custom fields, phone layout). Phase 1 is complete. Phase 2 in progress: 2.1 done (client files, statuses, Pipeline board, Admin → Client statuses); 2.2 done (purchase agreements, Admin forms editor, key dates, Under Contract, Mark closed / Fell through); 2.3 done (task templates, automations, Admin → Task templates, Admin → Integrations); 2.4 in progress: appointments done, Buyer & listing forms editable (Admin); Google Calendar done; message templates + drafts done; Files card done; task alarms done; Ask Claude done; next worker (pg-boss). Texting (Messages) built 2026-10-20 (one Twilio number per person; waiting on A2P campaign approval).

## Working with the owner

- The owner (Luke) is not a developer. Explain choices in plain language, recommend one
  option, and keep summaries short.
- Don't add features beyond SPEC.md without asking. If something is unclear, add it to
  SPEC.md §18 Open questions and ask.
- When behavior changes, update SPEC.md in the same pull request.
- Never ask the owner to paste API keys, tokens or passwords into chat. They go in Railway
  environment variables; tell the owner exactly where to add them.
- Branch per change; open a PR only when asked; Railway preview link for the owner to test.

## Stack

- Next.js 16 (App Router) + TypeScript (strict) + Tailwind 4. Auth.js (next-auth v4).
- PostgreSQL on Railway via Prisma 7 (pg driver adapter, config in `prisma.config.ts`). Migrations are versioned and **non-destructive**
  (add columns/tables; backfill; never drop data without an explicit owner-approved plan).
- Auth.js with Google; only `@pettyhomes.com` emails may sign in (check `hd` claim and the
  email domain server-side).
- Worker service (from Phase 2): pg-boss for queued and scheduled jobs (date-based task due dates,
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
- Texting safety: honor STOP (the "Text Unsubscribed" tag blocks texts; "Email Unsubscribed" is email-only, owner 2026-10-24), quiet hours 8am–8pm Central, daily cap.
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
- Times always show on a 12-hour clock in Central time ("8:00pm"), never 24-hour. Time pickers use 15-minute steps.
- Explicit Save/Cancel for edits (SPEC.md §5 save rule); two-step confirm on deletes.
- Accessible: real buttons/labels, keyboard reachable, visible focus.
- Keep components small; server logic in `src/server/*`, UI in `src/app` and
  `src/components`.

## Commands

- `npm install` (runs `prisma generate`), `npm run dev`
- `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`
- `npm run db:migrate` (new migration), `npm run db:seed` (idempotent roles + team)
- Production start: `prisma migrate deploy && prisma db seed && next start`
- Release gate: `npm audit --omit=dev --audit-level=high`

## Code map

- `src/server/auth.ts` — Auth.js options, `requireUser()`, `requirePermission()`
- `src/server/access.ts` — who may sign in (unit tested)
- `src/server/permissions.ts` — permission keys and default roles
- `src/server/db.ts` — Prisma client (pg adapter); generated client in `src/generated/` (gitignored)
- `src/proxy.ts` — redirects signed-out users to /login
- `src/lib/tasks.ts` — task rules: lists, quick-add parser, repeats, Important dates (unit tested)
- `src/server/tasks.ts` — loads the Tasks board and a person's tasks; actions in `src/app/(app)/tasks/actions.ts`
- `prisma/schema.prisma`, `prisma/migrations/`, `prisma/seed.ts`, `prisma.config.ts`
- `src/server/safe.ts` — `guarded(permission, fn)` wraps every server action (session, permission, friendly errors)
- `src/server/activity.ts` — activity log writer; `src/server/people.ts` — People queries
- `src/lib/normalize.ts`, `src/lib/filters.ts` — pure helpers (phones, names, dates in Central time, smart list filters), unit tested
- `src/app/(app)/` — signed-in pages: `people/` (list, `[id]` contact page, `actions.ts`), `admin/` (users, lists, tags, `actions.ts`)
- Local testing: mint a session cookie with `next-auth/jwt` `encode()` using `NEXTAUTH_SECRET` (no Google needed)
- `src/lib/mentions.ts`, `src/server/notifications.ts`, `src/components/Bell.tsx` — @mentions and the bell
- `src/components/AlarmCenter.tsx` + `src/app/api/alarms/route.ts` — task alarms (pop-up and chime when a timed task comes due)
- `src/lib/files.ts` (questions per status, commission stripping via `toFileView`, tested), `src/server/files.ts`, actions in `src/app/(app)/pipeline/actions.ts`
- `src/lib/pa.ts` (PA forms, Show only if, cleaning, key dates, UC column, `toPaView` commission stripping, Client name questions, one-time Notes upgrade run from `prisma/seed.ts`; tested), `src/server/pa.ts`, `src/app/(app)/pipeline/paActions.ts`
- `src/lib/templates.ts` (steps, anchors, conditions, expand; tested), `src/server/automation.ts` (runTrigger, applyTemplate, redateContract, moveFile), `prisma/starterTemplates.ts`
- Admin pages check their own permission with `adminGate()` in `src/app/(app)/admin/gate.tsx`
- `src/lib/appointments.ts` (names, contract dates; tested), `src/server/appointments.ts`, `src/app/(app)/people/apptActions.ts`
- Contract calendar invites: `src/lib/contractInvites.ts` (rules, titles, defaults; tested), `src/server/contractInvites.ts` (rules in AppSetting, PA date options), Admin → Calendar invites in `src/app/(app)/admin/calendar/`
- `src/lib/calendar.ts` (Google events; tested), `src/server/google.ts` (connect, encrypted token via `src/server/crypto.ts`, `syncAppointment`, `syncContract`), `src/app/api/google/*`
- Sending email: `src/lib/email.ts` (MIME; tested), `sendGmail` in `src/server/google.ts`, `src/app/(app)/people/emailActions.ts`, Timeline Email tab `people/[id]/EmailComposer.tsx`; merge values per person in `src/server/merge.ts` (`mergeFor`)
- `src/lib/merge.ts` (merge fields; tested), Admin → Text & email templates in `src/app/(app)/admin/messages/`, Draft email/text in `src/app/(app)/tasks/DraftModal.tsx` + `draftActions.ts`
- Files card: `src/lib/documents.ts` (tested), `src/server/storage.ts` (S3 client, signed downloads), `src/app/api/documents/*`, Trash purge removes stored objects (`src/server/trash.ts`)
- Industry partners: `src/lib/partners.ts` (types, section → type, fill/save; tested), `src/server/partners.ts` (`savePaPartners`), `/api/partners`, `pipeline/PartnerPicker.tsx`, `people/[id]/PartnerDeals.tsx`
- FUB import: `src/lib/fubImport.ts` (summary, default matching from owner decisions, apply; tested), `src/server/fub.ts` (API, cached copy in AppSetting), Admin → Import from Follow Up Boss in `src/app/(app)/admin/import/`; templates + notes/calls/texts: `src/lib/fubHistory.ts` (tested), `admin/import/historyActions.ts`, `HistoryTemplates.tsx`
- Ask Claude: `src/lib/assistant.ts` (proposal checks; tested), `src/server/assistant.ts` (Claude call with find_people / propose_task / propose_note tools; proposes only), `src/app/(app)/assistant/actions.ts`, `src/components/AskClaude.tsx` (mic, review cards, Save via createTask / addTimelineEntry)
- Submit offer (Relay port): `src/lib/offer.ts` (offer fields, note format, PA prefill; tested), `src/server/offer.ts` + `src/server/offerPrompt.ts` (Relay's Claude prompt), `src/app/(app)/pipeline/offerActions.ts`, `people/[id]/OfferModal.tsx`, `src/components/useSpeech.ts`
- Texting: `src/lib/texting.ts` (numbers, STOP words, TwiML, errors, day start; tested), `src/lib/twilioSig.ts` (webhook signature), `src/server/twilio.ts` (REST: send, connect number; tested), `src/server/texting.ts` (incoming, missed calls, `sendTextAs`, threads), `src/app/api/twilio/*` (sms, status, voice, voice/done, recording; outside sign-in, signature-checked), group texts via Twilio Conversations: `src/lib/groupText.ts` (tested), `src/server/groupText.ts`, `/api/twilio/conversation`, `TextThread`; photos in texts: `src/lib/textMedia.ts` (tested), `src/components/TextPhotos.tsx`, `/api/texts/[id]/photo/[n]`; reactions: `src/lib/reactions.ts` (tested); text commands ("task …" / "contact …" from your cell to your HQ number): `src/lib/textCommands.ts` (tested), `src/server/textCommands.ts`, quick add core in `src/server/quickAdd.ts`; calling in the browser (Twilio Voice SDK): `src/components/CallCenter.tsx` (`CallLink`), `/api/voice/token` + `src/server/voice.ts` (auto API key + TwiML App), `src/lib/voiceToken.ts` (tested), `/api/twilio/outbound` (+ `/done`, `/api/twilio/whisper`); answered calls + recordings in `PhoneCall` (played via `/api/calls/[id]/audio` after a sign-in check), `src/app/(app)/messages/` (page, MessagesApp, actions), `src/components/TextComposer.tsx`, Admin → Integrations `TextLines.tsx`
- Mass email: `src/lib/bulkEmail.ts` (recipients, unsubscribe token, footer; tested), `src/app/(app)/people/bulkEmailActions.ts` + `BulkEmail.tsx` (bulk bar → Email), public `src/app/unsubscribe/` + `src/app/api/unsubscribe/`; attachments: `src/server/attachments.ts`, `/api/email-attachments`, `src/components/AttachFiles.tsx` (MIME in `buildMimeRaw`, Gmail upload send); open tracking (mass only): `EmailTrack`, public `src/app/api/e/[id]` image, `people/emails` page; extra recipients on email/text: `src/components/AddRecipient.tsx`
- Email images: `src/lib/emailImages.ts` (tested), Image button in `src/components/FormatBar.tsx`, upload `/api/email-images`, public `src/app/api/img/[name]` (only `email-images/` names); `![alt](https://…)` rendered by `toHtml` in `src/lib/email.ts`
- Address lookup: `src/server/places.ts` (Google Places API (New), key server-side), `/api/address` + `/api/address/details`, `src/components/AddressInput.tsx` (contact Address, PA and file `address` fields)
- `src/lib/customFields.ts` — custom field types and value cleaning
- Owner setup and ops runbook: `docs/ops.md`

## Mockups

- `mockups/*.html` are standalone page mockups; `mockups/build.py index.html` combines them
  into one clickable file. They hold fake in-memory data only and are reference, not
  production code.
