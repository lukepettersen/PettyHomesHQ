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
- **Staying signed in** *(2026-10-14)*: the sign-in page has **"Keep me signed in on this
  device"** (unticked by default). Ticked: that browser stays signed in up to 400 days (the
  browser limit). Unticked: signed out 12 hours after signing in. Removing or disabling a
  user in Admin still locks them out immediately on every device.
- Secrets (Google client, Twilio, storage, Anthropic, database) live only in Railway environment
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
- **Search on phones** *(owner request 2026-10-19)*: a magnifier in the top bar opens a full-width
  search bar (recent contacts first, results as you type).
- **Recent contacts** *(owner request 2026-10-15)*: clicking the empty search box lists the
  last 5 contacts opened on this device (from search or their page).
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
  - Task details: changes wait for Save changes / Cancel; Cancel always closes the task (throwing away unsaved changes); switching away or × asks to save first.
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

- **Home-screen app** *(2026-10-14)*: "Add to Home Screen" gives the white house mark on moss,
  the name "HQ", and opens full screen (web app manifest + Apple touch icon). The icon opens the page you were on
  when you added it, e.g. Tasks (owner request 2026-10-26).

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
  - *(2026-10-14)* More specific filters: Stage / Type / Source / Assigned to (incl. Nobody)
    "is any of / is none of" (several at once); Tags "has any of / has all of / has none
    of"; **Last call, Last text, Last email** and Last contact (any) more/less than N days
    or never; Added to HQ; Birthday / Homeiversary in the next N days; Has an email / phone.
  - **Columns** *(2026-10-14)*: each smart list (and All people) picks and orders its columns
    from Stage, Type, Company, Phone, Email, Last contact/call/text/email, Follow up, Tags,
    Source, Assigned to, Address, Mailing name, Next birthday, Homeiversary, Added. Click a
    column header to sort. Drag a header's right edge to resize it (double-click resets); widths are
    remembered per list in that browser.
  - Change filters, then Save changes / Save as new list / Reset.
  - *(2026-10-14)* Lists show **100 people per page** (Previous / Next); sorting is by column
    header over the whole list; "Select all N" selects everyone matching. Opening a contact
    from a list keeps its place: **← Back** returns to that list, page and sort, and
    **‹ Prev / Next ›** (with "12 of 6,904") steps through the people in it — still from
    the same spot if the person just dropped out of the list (e.g. texted, so no longer due).
  - Lists and collections: create, rename, duplicate, delete, **drag to reorder or move
    between collections**, plus a ⋯ menu (rename, ↑ ↓, Move to…, Duplicate, Delete).
  - Default collections seeded once: Clear Daily, Sphere, Leads, Mailing Lists, Partners.
- Table: name, stage, last contact, follow-up, deal, tags, source; sort by name / stage /
  last contact; search box.
- Bulk actions on selected rows: Add tag, Change stage, Set follow-up, Assign, Export,
  Delete, **Email** *(owner request 2026-10-20)*.
- **Mass email (Email):** up to 1,000 people at a time. Pick a template or write it (merge fields fill in
  for each person), preview as the first person gets it, then **Send to N** (two-step). Each person gets
  their own email from the connected Gmail (never CC/BCC), a few at a time with a progress bar and Stop;
  it goes on their timeline. Skipped: no email address, or tagged Email Unsubscribed, Unsubscribed or
  Bounced. Every email ends with the business mailing address (asked once, remembered) and an
  **Unsubscribe** link: a public page with an Unsubscribe button (so link scanners can't trigger it) that
  tags them **Email Unsubscribed** (texting isn't affected) and notes it on their timeline.
- **Attachments** *(owner request 2026-10-21)*: **📎 Attach file** on mass emails and the timeline Email
  tab (PDFs, Word/Excel, images; up to 5 files, 20 MB total). Files upload once to the private file
  storage and go with each email; the timeline notes the file names. Needs File storage connected.
- **Open tracking (mass emails only)** *(owner decision 2026-10-21)*: each mass email carries a tiny image;
  the first load marks it **Opened** (shown under that email on the contact's timeline, else "Not opened
  yet"). **People → Mass emails** lists each send with "N of M opened" and who. One-to-one emails are never
  tracked. "Opened" means probably read (iPhones can load it on their own; blocked images never count).
- **Add person:** first/last, phone, email, optional second person, stage, source (picking the
  Industry Partners stage also asks Type and Company, §6.4). Calls are
  booked afterwards from the contact page (Appointments → + Book), owner decision 2026-10-14.

### 6.3 Contact page (3 columns)
- **Back link** returns to where you came from (People, Tasks, Messages or Pipeline) and that
  tab stays highlighted.
- **Left:** contact info card, Details (stage, follow-up, assigned, source, mailing name),
  Tags, Important Dates. Each card has Edit → Save/Cancel. The contact info card also has **Copy**
  *(owner request 2026-10-22)*: copies the name, phones and emails (with their labels), one per line, to
  paste into a text or email. "Delete person" at the bottom
  (Admin only, two-step).
- **Middle:** a tab per active client file (Buyer / Listing) plus **Timeline**.
  - **Timeline:** composer with Note, Send text, Log text, Log call (with outcome).
    Filters: All, Notes, Texts, Calls, **Tasks**, Emails, Deal activity. Newest first.
    Checking off a task for the person adds a "Task done" line (unchecking removes it).
  - **Edit / Delete** *(owner request 2026-10-23)* under notes, logged calls and logged texts: Edit changes the
    words (and a call's outcome) in place with Save / Cancel; Delete takes two clicks and hides the entry (kept
    as deleted). Only the person who wrote it, or someone allowed to delete records, sees these. Texts and emails
    HQ sent or received, answered or missed calls and task lines can't be changed.
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
    Built: private bucket (off until the storage variables are set), up to 100 MB per file *(raised 2026-10-19)*,
    program files refused, drag-and-drop onto the card; downloads go through HQ with links
    that expire in 5 minutes; deleted files go to Trash and are removed from storage after 30
    days.

### 6.4 Industry partners *(built 2026-10-14)*

- Realtors, lenders, title and other partners are regular contacts with a **Type** (Realtor,
  Lender, Title, Inspector, Transaction coordinator, Attorney, Other partner) and a
  **Company**, set on the Details card. People → Partners has **Realtors**, **Lenders** and
  **Title** lists (smart list filter "Type is …").
- Purchase agreement people sections (Buyer's lender, Buyer's/Seller's title, Seller's/Buyer's
  agent, Seller's TC) have **"Choose a … from your contacts"**: search-as-you-type over
  partners of that type, most-used first; picking one fills name, company, email and phone
  and links the contact. Someone typed in by hand can be ticked **Save as contact** (stage
  Industry Partners, type from the section; an existing contact with that email is linked
  instead).
- A partner's contact page shows **Deals**: every contract they were picked for (client,
  address, role, state).
- Partners are **never** invited to contract calendar events (only the team and the client).

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
- **On the deal** *(owner request 2026-10-19)*: a **Send email** button opens the email composer
  (templates, merge fields, Gmail) right on the deal; open Email/Text checklist steps have **Draft
  email / Draft text** to send that step's template. Checklist sections show **newest first**.
- **Deal notes** *(owner request 2026-10-15)*: each buyer/seller deal has a free-text notes box
  at the top of the deal ("+ Add deal notes"; click to edit; Save / Cancel), showing when and by
  whom it was last changed. Kept at every status and on closed deals. The first line shows on
  the Pipeline card (full text on hover). The activity log records that notes changed, not the text.
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

### 7.5 Submit offer (Relay built in) *(owner decision 2026-10-19)*
- The Relay app's offer flow now lives in HQ. **Submit offer** is on every contact (Pipeline card)
  and on each buyer deal.
- Laid out like Relay *(owner request 2026-10-19)*: full screen on a phone; client card; the
  required terms as small tiles in three columns, each with a check circle that fills when the term
  is heard; optional clauses as checkboxes; one big round mic (**Tap to record** / **Listening… tap
  to stop**). Tapping to stop organizes right away; **Type instead** switches to a text box.
- Talk (browser speech-to-text; never auto-restarts, like Relay) or type the terms; **Organize**
  sends them to Claude with Relay's own instructions (same fields: property, price, earnest money,
  closing, inspection, seller-paid costs, financing, down payment, buyer broker comp, appliances;
  optional escalation, material defect, appraisal guarantee, expiration, written statement, sale
  contingency, FHA/VA terms, notes). Keep talking to fill gaps ("Still needed: …"); **Review**
  shows the note in Relay's "RELAY: OFFER INSTRUCTIONS" format; **Submit offer**.
- Submitting: saves the offer on the buyer deal (starts a buyer deal at Submitting offers if there
  is none; asks which one if there are several), puts the note on the timeline @mentioning the rest
  of the team (bell), moves an earlier-status deal to **Submitting offers**, and starts every task
  template set to **"When an offer is submitted (every offer)"** (each offer gets its own tasks;
  the loan type feeds the FHA/VA condition). The FUB "Offer" tag isn't used.
- **Telling the team** *(owner request 2026-10-19)*: whoever was @mentioned gets a bell notification
  that **pops up with a chime** over any HQ page (Open contact / Dismiss; once per device; stays in
  the bell until read) and an **email with the offer note** from the connected Gmail (skipped if
  Gmail isn't connected; a failed email never undoes the offer).
- The buyer deal lists **Offers submitted** (view the note). **+ Add purchase agreement** starts
  filled in from the latest offer (address, price, earnest money, seller contributions, close date,
  financing, material defect, written statement).
- Needs ANTHROPIC_API_KEY (same as Ask Claude).

## 8. Task templates and automations

- A **template** = phases of steps. Each step: name, timing (days before/on/after an anchor
  date), assignee, type (Task, Call, Text, Email), linked text/email template, condition,
  and optional "moves deal to {status}".
- **Anchor dates:** Start date, Phone call, Consult (the booked buyer/seller consultation, else
  the file's consult date), Final Acceptance, Inspection, Written Statement, HOA Rescission,
  Closing. Steps can also be due **5, 10, 15, 30 or 60 minutes before or after** the phone call
  or consult; they move with it. Steps timed from a date that isn't set yet **wait for it**; when
  the date is set or changes, the step's due date updates.
- **Conditions:** Always, HOA property, Built before 1978, New construction, Written statement included *(owner request 2026-10-20; not marked N/A on the contract)*, YES / NO material defect clause *(the contract's "Material defect clause?" answer; blank counts as no)*, FHA/VA loan,
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
- **Change stage** step *(owner request 2026-10-21)*: sets the contact's stage (e.g. Past Client) when the template runs, like Add/remove tags (no task; noted on their timeline).
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
- **Assignment alerts** *(owner request 2026-10-23)*: when someone adds a task for a teammate (quick add with
  @name, the Create task pop-up, or adding while viewing their tasks) or changes a task's assignee to a teammate,
  that person gets a bell notification and, when Gmail is connected, an email to their pettyhomes.com address
  ("New task from Luke: …", with the contact, due date and a link to the task). Tasks you give yourself and steps
  created by task templates don't send alerts.
- **Order stays put** *(owner 2026-10-23)*: tasks sort by due date, priority and time, then title and contact, so
  same-day tasks keep their places when the board refreshes after a check-off (a repeating task's next copy shows
  right next to the one just checked).
- **Today** view: a board of columns side by side for Clients, Due for a touch, Important
  dates, Recurring, Misc, plus any user lists set to show on Today. Overdue items marked in
  red. Opening a task slides details over the board; clicking anywhere outside it closes it, like the × (unsaved edits keep it open with a reminder; owner request 2026-10-21). On a laptop or bigger every Today column (up to 6) fits on one row with compact cards (title, contact, due date, initials) *(owner request 2026-10-21)*.
- **Upcoming** *(owner request 2026-10-20)*: under Today in the sidebar; every task due after
  today from every list, grouped by day (Tomorrow, then each date). Follows the Everyone / Me /
  teammate filter.
- Quick add while the filter shows a teammate makes the task **theirs** (shown as "For Alyssa"
  before you add; an @name in the text still wins). Everyone or Me → the person typing.
- **Due for a touch is the owner's list** *(owner request 2026-10-21)*: it shows for Everyone or the owner, never in a teammate's view (Alyssa's Today has no touch column).
- **Lists (sidebar):** Today, Upcoming, then built-in lists and user lists in one order.
- A contact opened from Tasks shows **‹ Prev · 3 of 12 in Today · Next ›** to step through the people
  in the list you came from, in the order shown *(owner request 2026-10-20)*.
  - Built-in: **Clients** (grouped by client, click name to open), **Due for a touch**
    (people past their follow-up frequency **since their last text**; texts are the touch, owner decision 2026-10-14 — calls and emails don't restart it; the card shows "Last text …"; **Log text** records a text on their timeline and restarts the clock, as do logging a text on the timeline, checking off a text task (incl. "Text Happy Birthday"; it's logged on the timeline as a text, not "Task done"), the bulk action **Mark texted**, and the last text date pulled from Follow Up Boss; **Spread out** *(owner request 2026-10-15)*: "Show 5 a day" gives everyone due right now a day to appear — the first 5 today, the next 5 the next weekday, and so on — without faking texts, so timelines and "Last text" stay true; anyone not texted stays on the list; **Undo spread out (N waiting)** puts everyone back right away; **weekdays only** *(owner request 2026-10-24)*: the list shows Monday to Friday and is empty on Saturday and Sunday; spreading skips weekends (started on a weekend, the first batch is Monday), and clicking Spread out again re-spreads everyone due, including people already waiting), **Important dates**, **Recurring**,
    **Misc** (any task with no client).
  - User lists: create, rename, delete (tasks are kept).
  - **Edit columns / Edit:** reorder every list, untick "On Today" to hide one from Today,
    rename/add/delete user lists. Save / Cancel.
- Tasks sort themselves: linked to a client → Clients; repeating → Recurring; birthday or
  homeiversary → Important dates; `#list` → that list; anything else → Misc.
- **Quick add** with natural language: "call lender re Ortiz Fri 9am", "rent check every
  month", `#list`, `@alyssa`, today/tomorrow/weekday/next week.
- Contact names on task rows and Due for a touch highlight on hover and open the contact (owner request 2026-10-15); clicking elsewhere on a task opens its details.
- Assignee filter: Everyone / Me / each team member; the choice is remembered on each device (owner request 2026-10-15).
- Task details: title, due date (steps timed from a date like "Closing + 1 day" can be given their own date; then they stay put instead of moving with that date; owner request 2026-10-21), time (12-hour, 15-minute steps; the Create task pop-up has the same picker), repeat (daily, weekly, every other week, monthly, yearly; quick add understands "every other week" and "biweekly"),
  list, assignee, linked person, checklist source and timing, notes (behind "+ Add notes"
  until used), delete. Save changes / Cancel. No priority or subtasks (owner decision
  2026-10-14; subtasks already on a task still show so nothing is lost).
- Deleting a task (two-step) moves it to Trash; an Admin can restore it within 30 days.
  Checking off a repeating task creates the next one; checked-off tasks stay visible (struck
  through) until you switch lists, so a mis-click can be undone.
- **Important dates tasks** come from each person's birthdays and homeiversary and the rules
  in Admin → Date reminders, titled with capitals: birthdays add whose it is ("Text Happy
  Birthday · Lena"), homeiversaries are just the action ("Send Homeiversary Card")
  (default: text happy birthday/homeiversary on the day to
  everyone; send card 7 days before to Past Clients). Shown up to 60 days ahead. A homeiversary set from a closing first comes up a year later (no card for the closing itself; owner report 2026-10-20). They also show on
  the contact's Tasks card, where checking one off works the same (owner report 2026-10-17). On the contact's Tasks card, checked-off tasks drop to the bottom (crossed out, so a mis-click can be undone) until the page reloads (owner request 2026-10-21).
- **Task alarms:** a task with a set time rings for the person it's assigned to when it comes
  due: a pop-up over every page (Done · Snooze 5 min · Open contact · Dismiss), a chime that
  repeats every 2 seconds, a flashing tab title, and a desktop notification once they click
  "Turn on". A task that came due in the last 3 hours (computer asleep) still rings. HQ must
  be open in a browser tab, and the browser only plays sound after one click on the page.
  Moving the task to a new time rings again.
- **Ask Claude** *(owner request 2026-10-14)*: a mic button in the top bar on every page. Say
  (or type) what to add — "remind me to call the Ortizes Tuesday at 2", "note on Sam: they
  want a bigger yard, @Alyssa send them listings", "log a call with Pat, left a voicemail".
  Claude looks up the contacts by name and proposes tasks (title, contact, assignee, day,
  time) and notes / logged calls / logged texts (with @mentions, which notify the teammate).
  **Nothing saves until you review the cards** (edit, untick, Start over) and click Save;
  saving uses the normal Add task / Add note rules (permissions, activity log, bell). On a
  contact's page, "them" means that contact. If a name matches several people, Claude asks
  instead of guessing. Talking uses the browser's speech-to-text (Chrome, Edge, Safari);
  elsewhere type, or use the phone keyboard's mic. Off until `ANTHROPIC_API_KEY` is set in
  Railway (Admin → Integrations); what's said and the matching contact names go to
  Anthropic's API to be read (not used for training) and aren't logged in HQ.

## 10. Appointments

- Contact page **+** menu: **Book phone call, Book Buyer Consult, Book Seller
  Consult, Book showing, Other appointment**.
- Title fills in as **"Last Name - Appointment"**, or "Last/Last" for a couple with
  different last names (e.g. "Ortiz/Brooks - Phone Call"). Editable; Other requires a name.
- Times are picked in 15-minute steps (also the PA inspection appointment, which starts
  at 12:00pm). Appointments can be edited; moving a booked call moves its steps.
- Fields: date, start, end (call 30 min, others 60), location (phone number for calls,
  property address for showings), invitees (client + team, tick to include). Each email on the contact is
  its own choice (e.g. Megan and Jaylen), all ticked to start; untick anyone who shouldn't get the invite
  *(owner request 2026-10-24)*.
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
  events that invite **only the team and the client** (never lenders, title, the other agent
  or other partners; owner decision 2026-10-14); they update when dates change and are
  removed when the contract closes or falls through. If Google is unreachable, HQ still saves.
  Until connected, appointments are stored in HQ only.
- *Later:* booking a call for someone who already has one upcoming becomes **Reschedule
  call** *(decided, §17)*.

## 11. Messages (texting) — built, off until Twilio is connected

- **Send text → + Add:** send the same text to another contact or a typed number too; each gets their own
  text (US business texting can't do group texts), and replies come back separately *(owner request
  2026-10-20)*.
- Two-way SMS from **each team member's own business number** *(owner decision 2026-10-20: Luke and
  Alyssa each have a number)*, plus missed calls. No email here (email stays in Gmail).
- **Messages page:** conversations on your number (switch to a teammate's to read theirs; you can only
  send from your own); **+ New message** (find a contact, pick their number) and **All / Unread** tabs
  *(owner request 2026-10-20)*; unread counts on the Messages tab; bubbles show Sending / Sent / Delivered / Not
  delivered with the reason; refreshes every 15 seconds. **Send text** on a contact's timeline and in
  **Draft text** on checklist steps (template, "/name" in the message; the task is checked off).
- Incoming texts and missed calls **pop up with a chime** for the number's owner (Open conversation).
- **Calls** to a number ring that person's cell if one is set in Admin → Integrations (Luke), showing the
  caller's number (if the carrier refuses that, it rings again showing the business number); otherwise
  the caller hears "Sorry we missed your call, please text this number" (Alyssa). Unanswered calls are
  logged as missed calls in Messages and on the contact's timeline.
- **Answered calls** *(owner request 2026-10-22)* go on the contact's timeline: "Answered: Called Luke's business
  number (952-243-7646) · 4 min", and count as contact. Calls from a number not on a contact are kept and land on
  the timeline when the number is linked or added from Messages.
- **Call recording** *(owner request 2026-10-22)*: on by default, with an Admin → Integrations → Texting switch.
  Callers first hear "This call may be recorded." (MN needs only one side's consent; the notice covers callers
  from all-party states). Recording starts when the call is answered (missed calls aren't recorded); a **▶ player**
  under the call on the timeline plays it for signed-in users only (HQ passes the audio through from Twilio, never
  a public link). Recordings are stored in Twilio (about $0.0025 a minute; first 10,000 stored minutes free);
  delete them in Twilio → Monitor → Call recordings if ever needed.
- HQ only texts phones saved on the contact, or back to someone who texted that number. Texts sent and
  received go on the contact's timeline ("Sent:" / "Received:") and count as their touch.
- Threads sorted like iMessage; unknown numbers can be added as a new person or linked to an
  existing one; delete thread (two-step); call back; make task / follow-up task.
- Texts appear on the contact's timeline.
- **Off by default.** Until Twilio keys are present in Railway, Messages shows "Texting not
  connected" with setup steps, and "Send text" on contacts is hidden; "Log text" still
  works.
- **Turning it on:** owner creates a Twilio account, buys a number per person, completes carrier
  business-texting registration (A2P 10DLC), adds TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in Railway,
  then picks each person's number (and enters a cell to forward calls to) in Admin → Integrations. The
  number is a **drop-down of the numbers in the Twilio account** *(owner request 2026-10-22)*; one already
  used by a teammate is greyed out with their name. If Twilio can't be reached it's a typed box. Saving points
  the number at HQ in Twilio. Steps in docs/ops.md.
- **Group texts** *(owner request 2026-10-22; FUB had them)*: Admin → Integrations → Texting switch ("Group
  texts", off until turned on). A group text that includes a team number reaches HQ as a plain text listing the
  group's other people (Twilio's OtherRecipients); with the switch on HQ keeps it as **one thread** marked GROUP
  (the same people = the same thread), each message labelled with who sent it. **Send to group** replies to
  everyone from that person's number through a Twilio Conversation made for the group on the first reply (Twilio
  allows 10 people, us included). **+ New message** → two or more contacts' numbers → **Send to N people** starts
  one. On a contact, **Send text** starts with the contact's other numbers and the owner's cell already added (each
  removable) and sends one group text. Group messages go on the timeline of every contact in the group, once per
  contact even when a couple's two numbers are both in it. A text Twilio delivers twice (plainly, SM… or MM… for picture/group texts, and through the group's
  Conversation, IM…, even at the same moment) is saved and alerted once; doubles saved before 2026-10-24 were
  removed once. People who replied STOP block sending to
  their group; the daily limit counts group texts. Turning the switch off closes HQ's Conversations; earlier split
  threads stay as they were. Deleting a group thread in Messages also ends its Conversation. Twilio's Conversations
  fee: first 200 people a month free, then about $0.05 per person a month.
  Admin → Integrations warns under a number when Twilio says it can't receive MMS, and (switch on) lists **Recent
  incoming texts and calls (troubleshooting)**: time, plain or Conversation, last 4 digits of the numbers, field
  names, never message text; calls show whether HQ rang the cell and how that went (answered, no answer, failed + error code).
- **Photos** *(owner request 2026-10-23)*: photos texted to a business number (one-to-one or group) show in
  Messages (HQ passes them through from Twilio to signed-in users only; a photo with no words says "📷 Photo" in
  lists, alerts and timelines). **📷** on the text boxes (Send text, Messages, Send to group) attaches up to 5
  JPG/PNG/GIF photos; they upload to the file storage and go as picture texts (MMS). In a group text each extra
  photo is its own message. Needs File storage connected.
- **Text commands** *(owner request 2026-10-24)*: a text from a team member's own cell (the "calls ring" cell in
  Admin → Integrations) to their own HQ number that starts with **task** adds a task with the same wording as the
  Tasks box quick add ("task call lender re Ortiz Fri 9am", tomorrow, next week, every month, #list, @alyssa), and
  HQ texts back what it added ("Added "call lender" to Clients, due Fri Oct 30."). **help** texts back the list.
  Commands don't alert or go on a timeline; other texts (and "task" texts from anyone else) are normal texts.
- **Reactions** *(owner request 2026-10-22)*: an iPhone tapback sent to a business number arrives as a text like
  Loved “See you tomorrow!”; HQ shows it as a small icon (❤️ 👍 👎 😂 ‼️ ❓, or the emoji in "Reacted 🎉 to …") on
  the message it quotes in that thread, with no new bubble or alert ("Removed a heart from …" takes it off). If the
  quoted message isn't found it shows as a normal text. Business numbers can't send tapbacks; a 😊 button on the
  text boxes adds common emoji to a reply instead.
- **Admin → Integrations → Texting** on/off switch to pause sending anytime.
- Safety when on: honor STOP/opt-out automatically (a STOP reply tags them **Text Unsubscribed**; START or
  YES removes it); never text people tagged Text Unsubscribed. **Email Unsubscribed** only stops emails *(owner
  2026-10-24: two clearly named tags; Follow Up Boss's "Unsubscribed" merged into Email Unsubscribed, and smart
  lists using the old names were updated)*; quiet hours 8am–8pm Central apply to
  **automatic** texts only — texts you type send right away *(owner decision 2026-10-20)*; daily limit of
  **200 texts per number** (Admin → Integrations). Webhooks from Twilio are checked with Twilio's signature.
- Texts from Luke's personal phone can't be read by HQ; use "Log text".

## 12. Google Workspace

- **Sign-in** (Phase 1): Google, pettyhomes.com only.
- **Calendar** (Phase 3): appointments and contract deadlines create events with invites.
- **Calendar invites** *(owner request 2026-10-19)*: Admin → Calendar invites lists each contract
  date that goes on Google Calendar: **on/off**, **title** with fields ({last_name},
  {first_name}, {client_name}, {address}, {street}; example shown), **which date** (any Date or
  Date-and-time question on the purchase agreement forms, so adding a question like "Sewer
  scope" makes it available), **time** (all day, the time entered on the form, or a set time in
  15-minute steps, 1 hour long), **deals** (buyer, seller or both) and **invite** (team and/or
  client; partners never). The starting four match what HQ did before (Inspection at the
  appointment time, Inspection Deadline at 11:59pm, Written Statement Deadline, Close Date HOLD)
  and keep the events already made. Contact Appointments cards follow the same settings. New and
  changed contracts use the settings right away; **Refresh calendar invites** updates the rest.
- **Sending email** *(built 2026-10-16)*: one Google connection (Admin → Integrations) covers
  Calendar and Gmail send. Timeline has an **Email** tab (To: the person's addresses as
  checkboxes, optional template with merge fields, Subject, Message, **Send email** with a
  two-step confirm). Task **Draft email** has **Send email** too, which also checks off the
  task. Mail goes from the connected account, lands in its Sent folder and shows on the
  timeline (filter: Emails). **+ Add** puts another contact's email or a typed address on it too *(owner
  request 2026-10-20)*; other contacts it went to get it on their timeline as well.
- **Images in emails** *(owner request 2026-10-22; FUB had them)*: **Image** on the formatting bar (templates,
  timeline Email, mass email, Draft email) uploads a PNG/JPG/GIF/WebP (up to 5 MB) to the file storage and adds
  it to the message, e.g. a branded banner at the top of a market update. Emails show it full width (up to 600px);
  the plain-text copy leaves it out. Recipients load it from HQ's public /api/img address (long random names; only
  email images, never client files). The mass email preview shows the images. Needs File storage connected.
- **Finding templates** *(owner request 2026-10-15)*: the Template box is searchable (type
  any words of the name or folder; arrows + Enter). In the message, type **/** and a template
  name to drop it in where you're typing (fills the subject too if it's empty). **Clear**
  (two-step) wipes the subject, message and template to start over. Same in Draft email/text.
- **Couple names**: "Sam & Lena Ortiz", "Caitlin and Luke Pettersen" and "Ann + Bo Lee" are all
  read as two people for merge fields ("Caitlin & Luke"), greetings and appointment names.
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

- **Address lookup** *(owner request 2026-10-21)*: address boxes (contact Address, purchase agreement
  and buyer/listing Property address) suggest full US addresses as you type (Google Places; Twin Cities
  first); picking one fills street, city, state and ZIP. You can still type anything. Off until
  GOOGLE_MAPS_API_KEY is set (Admin → Integrations), then they're plain text boxes.

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
- **Task templates have folders** to organize the list *(owner request)*; same side panel as Text & email
  templates below (folders on top, searchable list, drag to move).
- **Text & email templates** *(owner request 2026-10-15)*: folders listed at the top of the side
  panel (click one to open just its templates, click again or Show all to go back); below, a
  searchable list of all templates (searches names and folders). The Folder box suggests
  existing folders; + New template starts in the open folder.
  **Drag a template onto a folder** (or "No folder") to move it; **+ New folder** adds an empty
  folder to drag into.
- **Connections:** Tools menu; Integrations (Google Workspace, Texting/Twilio, Follow Up
  Boss, File storage, Ask Claude, later website lead form).
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

- **Built 2026-10-14: Admin → Import from Follow Up Boss** pulls everyone straight from the FUB
  API (key `FUB_API_KEY` in Railway; read only), then: **Match** (every FUB stage, tag, source,
  agent and custom field with counts; each mapped or skipped; custom fields Mailing Name,
  Homeiversary, Referred By and Birthday 1–7 picked from the FUB fields), **Preview** (totals
  and sample people exactly as saved, incl. address and birthdays), **Import** (in groups with
  a progress bar; anyone already in HQ by FUB id, email or phone is left alone) and **Undo
  import** (removes the people that run added). Addresses come from the FUB address.
- **Relationships** *(2026-10-14)*: FUB relationships are pulled too. Each relationship type
  is matched to "Join their contact" (default for spouse/partner/husband/wife/co-buyer…:
  name becomes "Sam & Lena Ortiz" or "Sam Ortiz & Lena Brooks", the partner's phone and email
  are added and labeled with each person's first name), "Add to Kids" (default for child,
  son, daughter…: first names go on the contact's **Kids** line, e.g. "Mia, Leo") or "Leave
  out" (parents, others). **Add spouses/partners and kids** updates people imported before
  this (names only where not changed in HQ; kids only where the Kids line is empty).
- **Phone format** *(owner, 2026-10-14)*: every 10-digit number is saved and shown as
  952-250-4114 (existing numbers were reformatted; digits for matching are unchanged).
- With a spouse/partner joined: **Birthday 2** is named for the partner, and the **second phone
  and second email** on the FUB record are labeled with the partner's name (the button also
  fixes contacts joined before this rule; when the dates don't line up, a single unnamed
  birthday on a joined contact is taken as the partner's).
- **Last contact** *(2026-10-14)*: FUB's last activity date becomes the person's last contact,
  so the follow-up clock starts from their real history. **Update imported contacts** (after
  Load again) brings these in for people already imported, along with partners, kids and
  partner birthdays. People texted from a personal phone that FUB never saw: select them on
  People and use the bulk action **Mark contacted** (a date, default today).
- **Templates** *(built 2026-10-14)*: step 5 on the import page previews and copies every FUB
  email and text template (name, subject, wording; email HTML kept as bold/links/lists;
  folder from the name prefix BPC/BUC/SPC/SUC/Leads; FUB merge fields like
  %contact_first_name% → {first_name}; FUB's BUY/SELL custom fields (address, purchase price,
  final acceptance, inspection, written statement, HOA rescission, close date, seller
  contributions, commission, BAC) → the purchase agreement's merge fields, filled from the
  buyer- or seller-side contract; %contact_rels_first_name% → {partner_first_name} (with
  %contact_first_name% then → {primary_first_name}); contact email/phone/street/city, sender
  first name and mailing name have HQ fields too; website-lead fields like %inquiry_address%
  have no HQ match and are listed so they can be edited). Names
  already in HQ are skipped; **Remove copied templates** undoes it.
- **History** *(built 2026-10-14)*: step 6 copies each imported contact's FUB **notes, calls and
  texts** (not the realtor database) onto their timeline with the original dates and author;
  last text / last contact update. Runs in small groups with a progress bar; running it again
  adds only what's new; **Remove copied history** undoes it. Email history comes from Gmail.
- Contacts have a **Kids** line on the Details card (editable; also a People column). Kids
  are not separate contacts.
- *(Original plan)* Contacts via FUB CSV export (no API needed): names, phones, emails, address, stage,
  source, tags, birthdays (Birthday 1–7 → Important Dates), homeiversary, mailing name,
  referred by.
- Map FUB "N Day Sphere" stages to follow-up frequency; Past Client tag/stage → Past Client.
- Active deals entered fresh as files/PAs (BUY/SELL custom fields → PA form).
- Notes, email and text history need the FUB API: owner stores the key in Railway (never in
  chat); import is a one-time script, run on a copy first.
- Templates (95 email, 59 text) imported from FUB folders BPC/BUC/SPC/SUC/Leads; one-off and
  dated ones archived.
- Dry run → owner review → real import. Nothing in FUB is changed.
- **Matching decisions (owner, 2026-10-14):** FUB stage Lead → HQ stage Lead. Anyone with the
  FUB tag **Past Client** → HQ stage **Past Client**, keeping the follow-up frequency from
  their old "N Day Sphere" stage (e.g. 90 Day Sphere + Past Client tag → Past Client, every
  90 days). Other "N Day Sphere" people → Sphere with that follow-up. The import screen lists
  every FUB stage/tag/source/agent with counts so each can be matched or skipped, shows a
  preview, and has **Undo import**. FUB stage **Industry Partners** (8,090) and **Realtor** →
  HQ stage Industry Partners with Type **Realtor**, unless their source (or a tag) says
  otherwise: lender/mortgage → Lender, title → Title, inspector → Inspector, attorney →
  Attorney (the matching screen shows each such source/tag so it can be set). FUB stage
  **Petty Homes Admin** → skipped.

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
