# PettyHomes HQ — Spec

**Status:** approved by the owner 2026-10-13. Changes go through pull requests that update this file.
**Source of truth for behavior.** The clickable mockup (`mockups/index.html`, published at
https://claude.ai/artifact/Eo9TfrwXfjGPyfV1wTKq5J) shows the agreed screens; where the
mockup and this file differ, this file wins. Background: `docs/fub-review.md`,
`docs/checklist-research.md`. `PLANNING_NOTES.md` is superseded by this file.

---

## 1. Purpose

A private CRM and transaction-coordination app for Petty Homes (Luke Pettersen, Twin Cities,
~50 closings/year). It replaces Follow Up Boss (FUB), TickTick/Google Tasks and the Master
File spreadsheet, and ties into the pettyhomes.com Google Workspace.

Principles:
- **Enter things once.** Deal numbers live on the purchase agreement, not in three places.
- **Owner-configurable.** Stages, templates, forms, fields, tags, lists and menus are
  settings, not code.
- **Simple over clever.** Few stages; the step-by-step work lives in checklists.
- **Nothing is lost.** Soft delete, activity log, backups, export.
- **Private.** Only pettyhomes.com accounts get in; permissions enforced on the server.

## 2. Users and roles

- Users today: Luke Pettersen (owner, Admin) and Alyssa Chakiton (Assistant). More users can
  be invited from Admin.
- Roles are editable in Admin. Default permissions:

| Permission | Admin | Assistant |
|---|---|---|
| See commissions (amounts, %, BAC) | ✓ | ✓ (owner decision 2026-10-16) |
| Delete people and deals | ✓ | — |
| Manage users and roles | ✓ | — |
| Edit task templates | ✓ | ✓ |
| Edit text and email templates | ✓ | ✓ |
| Export data | ✓ | — |
| Send texts | ✓ | ✓ |

- Permissions are checked **on the server** for every read and write. A user without
  "See commissions" never receives commission values from the API, not just hidden in the UI.
- The owner account can't be removed or demoted.

## 3. Stack and hosting

- **Code:** GitHub, repo `lukepettersen/pettyhomeshq`.
- **App:** Next.js (App Router) + TypeScript + Tailwind, hosted on **Railway**.
- **Database:** PostgreSQL on Railway, accessed through Prisma with versioned migrations.
- **Sign-in:** Auth.js with Google, restricted to `@pettyhomes.com` (Workspace "Internal"
  OAuth app).
- **Background jobs:** a worker service on Railway (pg-boss queue + scheduled runs) for
  date-based tasks, reminders, notification emails and backups.
- **Files:** private S3-compatible bucket (Railway storage bucket if available, otherwise
  Cloudflare R2). Downloads use short-lived signed links.
- **Domain:** `hq.pettyhomes.com` (or similar), HTTPS.
- **Timezone:** America/Chicago. Contract deadlines are stored as dates (no time).
- **Environments:** production plus a Railway preview environment per pull request.

## 4. Security and privacy

- Google sign-in only, `@pettyhomes.com` only; no passwords stored. Owner and assistant turn
  on Google 2-step verification.
- Secrets (Google client, Twilio, storage, database) live only in Railway environment
  variables. Never in code, never in chat, never in the repo.
- Every write is checked against the user's role on the server.
- **Activity log:** who created, changed or deleted what, when (people, files, PAs, tasks,
  settings).
- **Trash:** deleting a person, file or contract moves it to Trash for 30 days, restorable by
  an Admin; then permanently removed.
- **Backups:** nightly database backup kept 30 days, plus a nightly export to the owner's
  Google Drive once Google is connected. Restore steps documented in `docs/ops.md`.
- **Export:** Admin can download all people, files and tasks as CSV anytime.
- Uploaded files are private; links expire.
- HQ doesn't store SSNs, bank account or wiring details.
- Google access asks for the smallest scopes needed (see §12).
- Dependencies kept current; `npm audit` clean on each release.

## 5. App layout (all pages)

- **Top bar:** logo + "Petty Homes HQ", then tabs in this order:
  **People · Tasks · Messages · Pipeline · Tools ▾ · Admin**, and a notification **bell** on
  the right.
- **Search from anywhere** in the top bar: matching people drop down as you type (name,
  phone or email); Enter opens the highlighted person; "See all results" opens People.
- **Tools ▾:** dropdown of external links the owner adds in Admin → Tools menu (name + link).
  Opens in a new tab. Empty state: "+ Add a tool". Links must be http:// or https://.
- **Bell:** @mentions for the signed-in user, unread count, "Mark all read"; clicking one
  opens that person.
- Side menus stay on screen as you scroll.
- **Save rule:** editing that changes settings or records uses explicit Save / Cancel:
  - Admin: an "unsaved changes · Discard / Save changes" bar.
  - Contact cards: Edit → Save / Cancel.
  - Task details: changes wait for Save changes / Cancel; switching away asks to save first.
  - Deal forms, stage editing, Tasks list arrangement: Save / Cancel.
- Two-step confirm ("Click again to delete") on every delete.
- Times always show on a 12-hour clock in Central time (e.g. 8:00pm), never 24-hour.
- Branding per Petty Homes Visual Guidelines: Clean Moss `#727755`, Misty Gray `#e2dbcf`,
  Mint Tulip `#aac1a1`, Burnt Charcoal `#383232`, Close to Coral `#cc7855`, Rabbit Gray
  `#bbbbb3`; Mukta Mahee font; P-house logo.
- Desktop first; works in a phone browser. A phone-friendly contact page and Today view are
  a Phase 1 item *(decided, §17)*.
  On a phone the contact page shows contact info, then Tasks, then Timeline, then the other
  cards; the Tasks sidebar becomes a row of chips and task details open full screen.

## 6. People

### 6.1 Person record
- Name (supports couples: "Sam & Lena Ortiz" / "Sam Ortiz & Lena Brooks"; both names
  searchable), mailing name.
- Phones and emails: any number, each with a label (Mobile, Work, or the person's first
  name for couples). Indexed for matching texts and emails.
- Address.
- **Stage** (lead stage): Sphere, Past Client, Lead, Industry Partners, Passive Marketing,
  Archive, Trash. Editable in Admin.
- **Follow-up frequency**: none / every 7, 30, 60, 90, 180 days. Editable list. Separate
  from stage.
- Source (editable list: Sphere, Sphere Referral, Website, Zillow Preferred, Open House, Sign
  Call), Referred by, Assigned to.
- Tags (add/remove; editable list in Admin).
- **Important Dates:** birthdays (any number; "Whose" + date picker) and homeiversary (date
  picker; set automatically when a buyer-side contract closes). Shown as "Sam's birthday ·
  Oct 20 · in 8 days".
- Custom fields (defined in Admin; types Text, Number, Date, Dropdown, Checkbox), shown in a
  "More details" card. Phase 1 covers people; deal fields come with Phase 2.
- Created date, last contact (computed from notes, calls, texts, emails).

### 6.2 People page
- Left: **All people**, then **collections** containing **smart lists** (saved filters).
  - Smart lists: filter builder with fields Stage, Tag, Source, Deal status, Follow-up,
    Last contact (more/less than N days), Due for a touch, Assigned to, **Has an upcoming
    task (yes/no)** *(new)*.
  - Change filters, then Save changes / Save as new list / Reset.
  - Lists and collections: create, rename, duplicate, delete, **drag to reorder or move
    between collections**, plus a ⋯ menu (rename, ↑ ↓, Move to…, Duplicate, Delete).
  - Default collections seeded once: Clear Daily, Sphere, Leads, Mailing Lists, Partners.
- Table: name, stage, last contact, follow-up, deal, tags, source; sort by name / stage /
  last contact; search box.
- Bulk actions on selected rows: Add tag, Change stage, Set follow-up, Assign, Export,
  Delete.
- **Add person:** first/last, phone, email, optional second person, stage, source. Calls are
  booked afterwards from the contact page (Appointments → + Book), owner decision 2026-10-14.

### 6.3 Contact page (3 columns)
- **Back link** returns to where you came from (People, Tasks, Messages or Pipeline) and that
  tab stays highlighted.
- **Left:** contact info card, Details (stage, follow-up, assigned, source, mailing name),
  Tags, Important Dates. Each card has Edit → Save/Cancel. "Delete person" at the bottom
  (Admin only, two-step).
- **Middle:** a tab per active client file (Buyer / Listing) plus **Timeline**.
  - **Timeline:** composer with Note, Send text, Log text, Log call (with outcome).
    Filters: All, Notes, Texts, Calls, **Tasks**, Emails, Deal activity. Newest first.
    Checking off a task for the person adds a "Task done" line (unchecking removes it).
  - **@mentions:** typing `@` in a note, logged call or logged text shows the team; picking
    one inserts "@Alyssa". On save, that person gets a bell notification and, when Gmail is
    connected, an email to their pettyhomes.com address. Mentions are highlighted in the
    timeline. Not available in "Send text" (client-facing).
- **Right:**
  - **Tasks:** everything open for this person, soonest first. Includes their own tasks and
    open checklist steps from their files ("· Buyer checklist"). Shows 6, then "Show all N".
    **+ Add task** opens the Create task pop-up: task name, type (Follow up, Call, Text,
    Email, Showing, Closing, Other), assigned to, date, time.
    Each task shows an icon for its type (email, text, call, showing, closing, task).
    Clicking a task opens its details in a pop-up on the contact page.
  - **Pipeline:** their buyer/listing files and contracts (click to open), with
    **+ Add buyer** and **+ Add seller**.
  - **Appointments:** upcoming list, then "Past appointments (N)" (§10).
  - **Files:** upload, download, delete (two-step). Shows file type, name and date.
    Built: private bucket (off until the storage variables are set), up to 25 MB per file,
    program files refused, drag-and-drop onto the card; downloads go through HQ with links
    that expire in 5 minutes; deleted files go to Trash and are removed from storage after 30
    days.

## 7. Pipeline

### 7.1 Client files
- A **buyer file** (buyer representation) or **listing file** belongs to a person. A person
  can have several over time.
- **Purchase agreements (PA)** sit under a file: buyer side under a buyer file, seller side
  under a listing. Earlier contracts (fell through / closed) stay listed under the file.
- Starting a file asks status-specific questions:
  - **Buyer:** areas, price range, lender; consult date (Consult
    scheduled); rep signed / expires / BAC (Rep signed onward); offer and response deadline
    (Submitting offers). "They already have an accepted offer" opens the PA next.
  - **Listing:** address, estimated value, timeframe, consult date (early statuses); then
    list price, listing signed/expires, commission, BAC offered, photos, active date, and
    property details.
- Status changes happen **only from the contact page** (status dropdown), or automatically
  when a checklist step marked "moves deal to" is completed.
- **Buyer and seller forms are editable** in Admin → Buyer and seller forms *(owner request,
  2026-10-15)*: sections and questions like the PA forms (type, hint, required, choices,
  Show only if), plus **Shown at** (every status or chosen statuses). The starting forms ask
  the questions listed above. Listing address can't be removed.
- Starting a buyer or listing tags the person **Buyer** or **Seller**.
- **BAC** is treated like commission: only users with "See commissions" see or edit it.

### 7.2 Statuses (editable)
- Buyer: Consult scheduled → Consult complete → Rep signed → Showing homes → Submitting
  offers.
- Seller (listing): Consult scheduled → Consult complete → Listing signed / Prep → Coming
  soon → Active.
- **Under Contract/Pending** columns (editable, each held until a contract date is met):
  **Inspection** (until Inspection deadline) → **Pending** (until Closing), then the
  automatic **Closed in {year}** column (owner's choice, 2026-10-14). A contract sits in the
  first column whose date is still open; with nothing open it sits in the last column.

### 7.3 Pipeline page (read-only board)
- Tabs: **Buyers · Sellers · Under Contract/Pending**, each with counts.
- Columns show count and dollar total; cards show client, address/price, next task and
  assignee initials, and a health dot (on track / something overdue / behind).
- Clients under contract appear only on Under Contract/Pending (both sides together), not on
  Buyers/Sellers.
- Under Contract/Pending ends with a **Closed in {current year}** column (newest first,
  resets each January). No closed list on the other tabs.
- Clicking a card opens the client.
- **Edit stages** on the board: rename, reorder (← →), add, delete; Under Contract columns
  also pick their "until" date. Save / Cancel. Renaming moves everyone in that stage and
  keeps attached templates; deleting is blocked while clients are in the stage.

### 7.4 Purchase agreement form
- **Step 1:** Who do you represent? Buyer / Seller (defaults from the file).
- **Step 2:** the first section on its own (The property).
- **Step 3:** everything else, with a preview of which checklist will start and how many
  tasks.
- Editing an existing PA shows all sections on one page.
- Forms are **fully editable in Admin → Purchase agreement forms** (separate Buyer side and
  Seller side): sections and questions can be added, renamed, reordered, removed; question
  type, hint text, required, dropdown options, and **"Show only if"** (question or whole
  section appears only after a certain Yes/No or dropdown answer).
- Questions marked **Used by automations** feed the Pipeline, calendar or templates; they
  can be edited or removed (dependent steps then wait). Address and price can't be removed.
- **Default buyer-side form:**
  - The property: Address*, Property type, Year built, HOA?, New construction?
  - The contract: Purchase price*, Earnest money, Seller contributions, Commission %, BAC ($)
  - **Buyer New Construction** (only if New construction = Yes): Builder, Builder rep,
    Builder rep email/phone, Lot/plan, Estimated completion, Buyer registered with builder?,
    Upgrades/notes
  - Key dates: Close date, Final Acceptance, Inspection deadline, Written Statement (or
    N/A), HOA doc rescission (only if HOA = Yes)
  - Notes: Inspection appointment (date + time), Referral fee, Earnest money to, Material
    defect clause?
  - Buyer's lender (name, email, company), Buyer's title (company, contact, email/phone),
    Seller's agent (name, email), Seller's TC (name, email/phone), Seller's title (company,
    contact)
- **Default seller-side form:** same property, dates and notes; contract adds Buyer's
  financing (Conventional/FHA/VA/Cash/Other); people sections are Buyer's agent, Buyer's
  lender, Buyer's title, Seller's title.
- Commission shows as "2.7% · $8,424" (anyone with "See commissions").
- On the PA box: key-date tiles (Not set / + Add date, Met, Waived, Extended), facts line,
  people line, checklist, actions **Edit · Fell through · Mark closed**.
  A key date that has passed counts as Met unless it was marked otherwise; moving a pending
  date (Extend, or editing the PA) marks it Extended and shows the original date.
- **Mark closed:** contract → Closed, file → Closed, person → Past Client; buyer side sets
  homeiversary to the close date; starts post-close template.
- **Fell through:** contract ends; file returns to its pre-contract status.

## 8. Task templates and automations

- A **template** = phases of steps. Each step: name, timing (days before/on/after an anchor
  date), assignee, type (Task, Call, Text, Email), linked text/email template, condition,
  and optional "moves deal to {status}".
- **Anchor dates:** Start date, Phone call, Consult (the booked buyer/seller consultation, else
  the file's consult date), Final Acceptance, Inspection, Written Statement, HOA Rescission,
  Closing. Steps can also be due **5, 10, 15, 30 or 60 minutes before or after** the phone call
  or consult; they move with it. Steps timed from a date that isn't set yet **wait for it**; when
  the date is set or changes, the step's due date updates.
- **Conditions:** Always, HOA property, Built before 1978, New construction, FHA/VA loan,
  Condo/townhome. *(Later: Lead source is…, for the Stacie Rihl referral step.)*
- **Triggers:** when a buyer/listing moves to a status; when a buyer-side or seller-side PA
  is added; when a contract closes (each side); **when a phone call is booked**; **when a
  Buyer consult is booked**, **a Seller consult**, or **either one**; or none.
- Templates are listed, created, edited and deleted in Admin → Task templates, with a steps
  editor.
- Seeded templates (from the FUB review, simplified): the five buyer status templates, five
  listing status templates, Buyer/Seller Under contract, Buyer/Seller Post-close, Phone call
  booked. New lead follow-up, Open house follow-up and Past client yearly check-in are kept
  without triggers (§17).
- Email/Text steps show **Draft email / Draft text**. In v1 this opens a pre-filled draft
  (merge fields from the person and contract) to review and send. Automatic sending is a
  later phase (§14).
  Built: the step picks its message template from a dropdown; Draft shows the filled-in
  message (template can be switched; empty merge fields are flagged) with **Copy** and **Open
  in email** (the person's email app). Gmail drafts replace Open in email once Gmail is
  connected.
  Merge fields (2026-10-16): client names, the team, and **every question on the purchase
  agreement and buyer/listing forms** (a new question becomes a merge field automatically),
  grouped in Admin → Text & email templates. Money, dates and times are written out
  ("$389,000", "Friday, November 20", "10:00am"). Commission, BAC and commission amount
  ({commission}, {bac}, {commission_amount}) fill in only for people with "See commissions".
- **Automatic tag changes on close** *(new)*: a step type "Add/remove tags" so closing adds
  Past Client, Email Newsletter, Mailers, Petty Homes Event List, Real Estate Health Check
  and removes Buyer / Seller / Under contract.
- **How it behaves (built 2026-10-14):**
  - A file gets each template once; moving back to a status doesn't add its steps again.
    Template edits apply to deals that reach that point afterwards; existing tasks stay.
  - Steps timed from a contract date can't be re-dated by hand; they move with the contract.
    Waiving a date closes its open steps. Fell through removes the contract's open steps;
    Mark closed checks them off and starts the post-close template as the person's tasks.
  - Steps from closed files or ended contracts no longer show as open tasks.
  - "When done: move deal to…" only moves a file that isn't under contract. Closing a
    contract is always done with Mark closed.
  - Duplicating a template makes a by-hand copy so two templates don't both start.
  - Templates can also be applied by hand from a contact's Tasks card (start date, optional
    file). Admin → Task templates is open to roles with "Edit task templates".
  - "When a phone call is booked" templates start once booking calls is built (§10).

## 9. Tasks

- **One task list everywhere:** tasks typed on the Tasks page, a person's own tasks and
  checklist steps from their files are the same records. Checking one off anywhere checks it
  off everywhere.
- **Today** view: a board of columns side by side for Clients, Due for a touch, Important
  dates, Recurring, Misc, plus any user lists set to show on Today. Overdue items marked in
  red. Opening a task slides details over the board.
- **Lists (sidebar):** Today, then built-in lists and user lists in one order.
  - Built-in: **Clients** (grouped by client, click name to open), **Due for a touch**
    (people past their follow-up frequency; Log touch), **Important dates**, **Recurring**,
    **Misc** (any task with no client).
  - User lists: create, rename, delete (tasks are kept).
  - **Edit columns / Edit:** reorder every list, untick "On Today" to hide one from Today,
    rename/add/delete user lists. Save / Cancel.
- Tasks sort themselves: linked to a client → Clients; repeating → Recurring; birthday or
  homeiversary → Important dates; `#list` → that list; anything else → Misc.
- **Quick add** with natural language: "call lender re Ortiz Fri 9am", "rent check every
  month", `#list`, `@alyssa`, today/tomorrow/weekday/next week.
- Assignee filter: Everyone / Me / each team member.
- Task details: title, due date (locked for steps timed from a contract date), time (12-hour, 15-minute steps; the Create task pop-up has the same picker), repeat,
  list, assignee, linked person, checklist source and timing, notes (behind "+ Add notes"
  until used), delete. Save changes / Cancel. No priority or subtasks (owner decision
  2026-10-14; subtasks already on a task still show so nothing is lost).
- Deleting a task (two-step) moves it to Trash; an Admin can restore it within 30 days.
  Checking off a repeating task creates the next one; checked-off tasks stay visible (struck
  through) until you switch lists, so a mis-click can be undone.
- **Important dates tasks** come from each person's birthdays and homeiversary and the rules
  in Admin → Date reminders (default: text happy birthday/homeiversary on the day to
  everyone; send card 7 days before to Past Clients). Shown up to 60 days ahead.
- **Task alarms:** a task with a set time rings for the person it's assigned to when it comes
  due: a pop-up over every page (Done · Snooze 5 min · Open contact · Dismiss), a chime that
  repeats every 2 seconds, a flashing tab title, and a desktop notification once they click
  "Turn on". A task that came due in the last 3 hours (computer asleep) still rings. HQ must
  be open in a browser tab, and the browser only plays sound after one click on the page.
  Moving the task to a new time rings again.

## 10. Appointments

- Contact page **+** menu: **Book phone call, Book Buyer Consult, Book Seller
  Consult, Book showing, Other appointment**.
- Title fills in as **"Last Name - Appointment"**, or "Last/Last" for a couple with
  different last names (e.g. "Ortiz/Brooks - Phone Call"). Editable; Other requires a name.
- Times are picked in 15-minute steps (also the PA inspection appointment, which starts
  at 12:00pm). Appointments can be edited; moving a booked call moves its steps.
- Fields: date, start, end (call 30 min, others 60), location (phone number for calls,
  property address for showings), invitees (client + team, tick to include).
- The contact page Appointments card lists upcoming appointments, then "Past appointments
  (N)"; contract dates show as "From contract". Delete is two-step.
- **Phone call** also starts every template triggered by "When a phone call is booked"
  (default: initial phone call scheduled email today; call reminder text and hold phone call
  on the call day; schedule consult the day after) and logs it on the timeline. Can also be
  booked from Add person.
- **Buyer/Seller Consult** for someone without that file offers "Also start a
  buyer/listing at Consult scheduled" and opens that form with the consult date filled in.
- **From the contract:** inspection appointment, inspection deadline (11:59pm), Written
  Statement deadline and "Close Date HOLD" appear automatically while a contract is active.
- **Google Calendar** *(built 2026-10-15, ahead of Phase 3 at the owner's request)*: an Admin
  connects once (Admin → Integrations → Connect Google Calendar; one connection for the team,
  on the connecting Admin's calendar). Booking, editing or deleting an appointment updates its
  event and emails the ticked invitees. While a contract is active, its inspection
  appointment, inspection and Written Statement deadlines and Close Date HOLD are calendar
  events that invite **everyone on the contract**: the team, the client's emails, and every
  email address in the contract's people sections; they update when dates change and are
  removed when the contract closes or falls through. If Google is unreachable, HQ still saves.
  Until connected, appointments are stored in HQ only.
- *Later:* booking a call for someone who already has one upcoming becomes **Reschedule
  call** *(decided, §17)*.

## 11. Messages (texting) — built, off until Twilio is connected

- Two-way SMS from a **business number**, plus missed calls. No email here (email stays in
  Gmail).
- Threads sorted like iMessage; unknown numbers can be added as a new person or linked to an
  existing one; delete thread (two-step); call back; make task / follow-up task.
- Texts appear on the contact's timeline.
- **Off by default.** Until Twilio keys are present in Railway, Messages shows "Texting not
  connected" with setup steps, and "Send text" on contacts is hidden; "Log text" still
  works.
- **Turning it on:** owner creates a Twilio account, buys a number, completes carrier
  business-texting registration (A2P 10DLC), then adds the Twilio keys in Railway settings.
  HQ detects them; no code change.
- **Admin → Integrations → Texting** on/off switch to pause sending anytime.
- Safety when on: honor STOP/opt-out automatically; never text people tagged Unsubscribed;
  quiet hours 8am–8pm Central (later sends wait for morning); daily send cap.
- Texts from Luke's personal phone can't be read by HQ; use "Log text".

## 12. Google Workspace

- **Sign-in** (Phase 1): Google, pettyhomes.com only.
- **Calendar** (Phase 3): appointments and contract deadlines create events with invites.
- **Sending email** *(built 2026-10-16)*: one Google connection (Admin → Integrations) covers
  Calendar and Gmail send. Timeline has an **Email** tab (To: the person's addresses as
  checkboxes, optional template with merge fields, Subject, Message, **Send email** with a
  two-step confirm). Task **Draft email** has **Send email** too, which also checks off the
  task. Mail goes from the connected account, lands in its Sent folder and shows on the
  timeline (filter: Emails). HQ only sends to addresses saved on that person.
- **Formatting** *(built 2026-10-16)*: email messages and email templates have a Bold / Link /
  • List bar (stored as **bold**, [words](https://…), "- " lines); web addresses become links.
  Emails go out as HTML with a plain-text copy. "Add my Gmail signature" (on by default)
  adds the connected account's Gmail signature.
- **Emails on timelines** *(built 2026-10-16)*: every few minutes while anyone has HQ open,
  emails in the connected Gmail to or from a person's saved addresses (last 30 days on the
  first run) go on their timeline as Email entries ("From …" / "To …" · subject, the new
  message without the quoted thread, "Show full email"), and count as last contact. Needs
  Gmail read access (Reconnect Google). Only the connected account's mailbox is read.
- **Gmail** (still to build):
  - @mention notification emails.
  - "Draft email" creates a Gmail draft with the template filled in and attachments from
    the person's Files.
- Smallest scopes needed: sign-in profile; Calendar events; Gmail read (metadata and
  messages for matching) and compose/send.
- Admin → Integrations shows Connected / Not connected with connect/disconnect.

## 13. Admin

Sections (left menu):
- **Team:** Users & roles (invite, edit name/email/role, remove — owner protected); roles
  (add, rename, remove when unused) and permissions grid.
- **Deals:** Client statuses (Buyer Pipeline, Seller Pipeline, Under Contract/Pending
  Pipeline — rename, add, remove, reorder, link templates); Purchase agreement forms; Task
  templates.
- **People:** Date reminders (type, task, days, before/on/after, assignee, kind, applies
  to); Custom fields; Tags (live counts; rename and delete update everyone); Stages,
  sources & follow-up.
- **Messaging:** Text templates; Email templates (subject, body, merge fields,
  attachments). *(Built 2026-10-15 as Admin → Text & email templates: name, folder, subject,
  body, merge-field buttons, preview with sample details; open to "Edit text and email
  templates". Attachments come with the Files card and Gmail drafts.)*
- **Task templates have folders** to organize the list *(owner request)*.
- **Connections:** Tools menu; Integrations (Google Workspace, Texting/Twilio, later
  website lead form).
- All Admin edits use the unsaved-changes Save / Discard bar.

## 14. Later phases (not in v1)

- **Automatic sending** of email/text steps with a per-step mode: Send automatically /
  Draft for review / Task only. Same safety rules as §11.
- **Drips:** Zillow Showcase (11 emails), Open House follow-ups (12), website welcome email.
- **Lead intake:** website sign-up form on WordPress posting to HQ; Zillow lead email
  capture.
- **AI assistant (optional):** read an uploaded PA PDF to fill the PA form; personalize
  drafts; suggest replies; summarize history. Drafts only, human approves.
- Weekly report emails to the owner; production report (closed volume and commission by
  year, Admin only) replacing the Master File; task reminders by email/push.
- Newsletter list sync to an email marketing service (e.g. Mailchimp).

## 15. Data import from FUB

- Contacts via FUB CSV export (no API needed): names, phones, emails, address, stage,
  source, tags, birthdays (Birthday 1–7 → Important Dates), homeiversary, mailing name,
  referred by.
- Map FUB "N Day Sphere" stages to follow-up frequency; Past Client tag/stage → Past Client.
- Active deals entered fresh as files/PAs (BUY/SELL custom fields → PA form).
- Notes, email and text history need the FUB API: owner stores the key in Railway (never in
  chat); import is a one-time script, run on a copy first.
- Templates (95 email, 59 text) imported from FUB folders BPC/BUC/SPC/SUC/Leads; one-off and
  dated ones archived.
- Dry run → owner review → real import. Nothing in FUB is changed.

## 16. Build phases

Each phase ships behind pull requests with a Railway preview; the owner approves before
merge. Each phase is usable on its own.

| Phase | Scope | Done when |
|---|---|---|
| 0 | Repo scaffold, Railway project (app + Postgres), Google sign-in, CI, backups, `docs/ops.md` | Owner and Alyssa can sign in; nobody else can |
| 1 | People, smart lists, contact page, notes and @mentions (bell), Tasks (all of §9 except checklist steps), Admin (users/roles, stages, sources, tags, custom fields, date reminders, tools), search, trash, activity log, export, phone layout | Daily CRM use alongside FUB |
| 2 | Worker service and file bucket, client files, statuses, PA forms + Admin editor, task templates and automations, Pipeline board + stage editing, appointments (HQ only), files, Important dates tasks, tag steps | Transactions run in HQ |
| 3 | Google Calendar and Gmail (timeline, drafts with attachments, mention emails), Drive backup export | Email and calendar connected |
| 4 | Messages + Twilio (built off; turned on when owner connects) | Texting live when ready |
| 5 | FUB import, cut-over checklist, FUB cancelled | Fully moved |

## 17. Decisions (owner approved 2026-10-13)

1. **FUB agent database (8,000 imported agents):** leave behind at import; can be imported
   later.
2. **Phone use:** contact page and Today get a phone-friendly layout in Phase 1.
3. **Reschedule call:** booking a call for someone with one upcoming becomes "Reschedule
   call" — moves the call, updates the invite, re-dates the open "Phone call booked" tasks.
4. **Templates with no trigger** (New lead follow-up, Open house follow-up, Past client
   yearly check-in): keep; deletable in Admin.
5. **Deleting a status with a template attached:** warn first, naming the template.
6. **Hold phone call** task shows the call time on the contact's Tasks card and Tasks page.
7. **Worker service and file bucket** move from Phase 1 to the start of Phase 2, when files
   and automations need them (owner approved 2026-10-13). Until then Trash is cleaned up on
   app start and when Trash is opened.

## 18. Open questions

None right now. New ones get added here.
