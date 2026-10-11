# Follow Up Boss Review

Read-only review of the live FUB account (`lukepettersen2.followupboss.com`), done 2026-10-11.
Nothing in FUB was changed. Data was read from the app's own screens.

**Status:** inventory complete. Owner's likes/dislikes are being added in the
"Owner feedback" section as we go.

---

## TL;DR — what this means for HQ

1. **The deal pipelines are the real workflow.** Two pipelines (Buyers, 10 stages; Sellers,
   14 stages) drive 30+ of the 40 automations. The pre-contract stages (consult, rep
   sent/signed, showing, offers; withheld, media, coming soon) are a big part of it, not just
   Under Contract → Closed.
2. **Deal data is entered twice (sometimes three times).** FUB's deal card fields (price,
   commission, address, dates) are empty. The real numbers live in 22 `BUY …` / `SELL …`
   contact custom fields, *and* in the Master File Google Sheet. Several automation tasks
   exist only to keep these in sync ("Fill Out Custom Fields", "Adjust Closing Costs/Price on
   Master File", "Remove Purchase Custom Field Terms", "Add Deal to Master File"). HQ should
   store this once, on the purchase agreement.
3. **Many tasks are manual workarounds HQ can do automatically:**
   - ~12 "Calendar Invite – Last Name – …" tasks → deadlines sync to Google Calendar.
   - ~10 "Change/Move Deal Stage/Card to …" tasks → HQ advances stages from checklist progress.
   - ~8 tasks whose names say "MOVE TO DAY BEFORE ACTIVE / TWO DAYS BEFORE DUE DATE / DAY
     AFTER INSPECTION" → relative due dates that auto-shift (already in the plan).
   - Gmail folder/label tasks (create "B (Name)", rename to "A (Name)", move to "Closed").
4. **Email/Text tasks are really "send template X."** Almost every Email/Text task matches a
   template by name. Many are flagged `NEEDS ATTACHMENT`. One-click drafts with attachment
   slots (already in the plan) fit this exactly.
5. **Contact-level automations are simple and work well:** birthdays, homeiversaries, yearly
   mailers, website sign-up, Zillow Showcase drip. Easy to rebuild.
6. **No action plans are in use.** Everything runs on FUB's newer "Automations."

---

## Users and roles

| User | Email | FUB role | Notes |
|---|---|---|---|
| Luke Pettersen | luke@pettyhomes.com | Owner | |
| Alyssa Chakiton | assistant@pettyhomes.com | Admin | Assignee on most automation tasks |
| *(former)* Gavyn Schacher | — | — | No longer on the team; still appears as an automation editor, a tag, and "Buyers TC – GAVYN" in the Under Contract note template |

Connected MLS: none. Phone numbers have a FUB "Business Registration" warning for texting.

---

## Lead stages (in order, with people counts)

Realtor (12) · Industry Partners (8,090) · FSBO (0) · Passive Marketing (136) ·
Archive/No Direct Contact (36) · Petty Homes Admin (3) · 180 Day Sphere (36) ·
90 Day Sphere (151) · 60 Day Sphere (4) · 30 Day Sphere (7) · 7 Day Sphere (23) ·
Lead (62) · Closed (0) · Trash (36)

Observations:
- The "N Day Sphere" stages are really a **follow-up frequency**, not a pipeline stage.
- No "Under Contract" lead stage. Under contract is tracked by the deal stage plus an
  `Under contract` tag that automations add/remove. Closed deals move people to stage id 27
  (Closed automations) — verify which stage that is.
- Industry Partners (8,090) is almost entirely an imported agent database (tags `Import`
  8,020, `Realtors` 7,835, `Imported Stage: Trash` 7,605).

## Sources seen

Sphere, Sphere Referral, Website, AJ Gimme Lead, Stacie Rihl (referral partner),
Zillow Preferred. (Full list to confirm at import time.)

## Tags (34)

| Tag | People | Purpose (inferred) |
|---|---|---|
| Import | 8,020 | Bulk import marker |
| Realtors | 7,835 | Imported agent database |
| Imported Stage: Trash | 7,605 | Import artifact |
| Imported Stage: Industry Partners | 255 | Import artifact |
| Imported Stage: Real Estate Agent | 230 | Import artifact |
| Email Newsletter | 436 | Newsletter list |
| Petty Homes Event List | 284 | Event invites |
| Mailers | 260 | Mail list |
| Past Client | 218 | Added on close |
| Christmas Cards | 216 | Card list |
| Real Estate Health Check | 200 | Annual check-in |
| Timberwolves Tickets 2026-2027 NOT RESPONDED | 178 | Ticket outreach |
| 2026 RE Health Check Needed | 160 | |
| 2027 RE Health Check Needed | 11 | |
| Google Review Sent | 84 | |
| Buyer | 58 | |
| Bounced | 54 | Bad email |
| 6 Month Update | 39 | Added to new leads |
| Unsubscribed | 39 | |
| A / B / C / D Lead | 29 / 8 / 21 / 19 | Lead grade |
| Seller | 22 | |
| No Bday Needed | 14 | Suppresses birthday tasks |
| Parents/Teachers | 10 | |
| Under contract | 6 | Set/cleared by automations |
| Zillow Showcase | 6 | Drip trigger |
| Investor | 5 | |
| Showing Agent | 4 | |
| Registration | 3 | |
| Offer | 1 | **Used as a trigger** — adding it fires "BPC Submitting Offers" |
| new construction | 1 | **Used as a branch** — switches BUC automations to the new-construction version |
| Gavyn Schacher | 1 | Leftover |

## Custom fields (37)

**Deal data on the contact (22):**
- `BUY` × 11: Address, Purchase Price, Close Date, Earnest Money, Seller Contributions,
  Final Acceptance Date, Inspection Deadline, Written Statement, HOA Doc Rescission Period,
  Commission, BAC (6 people each)
- `SELL` × 11: same set (2–4 people)
- Most are **Text** type even for money (price, earnest money, commission) → no math or totals.

**Contact fields (15):**
- Mailing Name (269), Referred By (20), Homeiversary (191)
- Birthday 1–7 (193 / 132 / 4 / 2 / 1 / 1 / 0) — one per household member
- Yearly mailer date fields (1 person each): Send Spring Postcard, Send Fall Postcard,
  Create/Send Fall Trifold, Create/Send Spring Trifold, Send New Years Postcard — these appear
  to exist only to trigger yearly reminder tasks (see Automations).

**HQ implications:** BUY/SELL fields become purchase-agreement fields (proper number/date
types). Birthdays become a household-members child table. Yearly mailer fields become
recurring general tasks.

## Deal pipelines

**Buyers (pipeline 1):** Phone Call Scheduled → Consult Scheduled → Consult Complete →
BC Sent to Sign → BC Signed → Showing Homes → Submitting Offers → Under Contract → Pending → Closed

**Sellers (pipeline 2):** Phone Call Scheduled → Consult Scheduled → Consult Complete →
LC Sent to Sign → LC Signed → Withheld → Media Scheduled → Media Complete →
Coming Soon Prep → Coming Soon → Active → Under Contract → Pending → Closed

Snapshot today (Buyers): Consult Complete 4 · Showing Homes 4 · Submitting Offers 2 ·
Under Contract 1 · Pending 5 · Closed 30 ($6.9M shown, but only 1 deal has a price entered).

Board/card observations:
- Deal names are the clients' names; a convention switches names to ALL CAPS once the buyer
  rep is signed (there's an automation task for it).
- The Closed column keeps growing (30 deals) and dominates the board.
- Deal card has built-in fields (Price, Close Date, Earnest Money Due, Mutual Acceptance,
  Due Diligence, Final Walk Through, Possession, Commission, Splits, Property Address) —
  **all empty except Close Date** on the deal checked.

## Automations (40) — FUB "Automations v2"

Legend: `Task(type → assignee)`. Stage numbers resolved to names.

### Buyer pre-contract (BPC)
- **Phone Call Scheduled** → Email(Alyssa): BPC Initial Phone Call Scheduled *NEEDS ATTACHMENT*
- **Consult Scheduled** (buyer & seller) → Email: Agency Disclosure + More Info; Follow Up(agent):
  confirmation message *MOVE TO DAY OF MEETING*; Alyssa: calendar invite
- **Consult Complete** → Text: Intro + Homespotter App + Legal Name; Email: Consultation follow-up;
  Luke: Connect with lender?; Alyssa: confirm legal names, then move stage to BC Sent to Sign
- **BC Sent to Sign** → Email: Buyer Rep breakdown; send rep in Click Contracts (Luke reviews first);
  Text: docs sent to sign; create Gmail folder "B (name)" in both inboxes
- **BC Signed** → Email: rep copy to client; attach rep to FUB contact; rename deal to ALL CAPS;
  move stage to Showing Homes
- **Submitting Offers** (triggered by adding the `Offer` tag, 55 runs) → send offer in Click
  Contracts; Email: PA breakdown; Text: offer sent to sign; Email: lead-paint pamphlet if 1978 or
  older; remove `Offer` tag; note

### Buyer under contract (BUC)
- **Under Contract** (43 runs; skipped if `new construction`) — 26 steps: fill custom fields;
  PA accepted email; lender intro; schedule inspection (Luke); sewer scope email + invite;
  earnest money request + text; ~4 calendar-invite tasks; day-of-inspection text
  *move to new due date*; inspection review *move due date to day after inspection*; submit docs
  to gopre.co; under-contract note; add `Under contract` tag; add to Master File (Luke); rename
  Gmail labels B→A; listing agent intro & title request; remind lender written statement
  *move to two days before due date*; +12h social post caption + post; +36h HOA docs?, Skyslope
  summary, title intro
- **Under Contract – NEW CONSTRUCTION** variant (18 steps): comp disclosure + commission amendment,
  earnest money copy, etc.
- **Pending** (27 runs, **13 stopped**) → adjust price/costs in custom fields *and* Master File;
  inspection amendment to clients / lender + PRE; "we are pending" text; earnest money settled;
  +1d insurance referrals; +3d gift card (Luke)
- **Pending – NEW CONSTRUCTION** variant
- **Closing in 14 days** (date trigger on BUY Close Date; 21 runs, **14 stopped**) → repairs
  amendment?; order closing gift; +5d final walkthrough text, utilities email; +2d cash to close;
  +3d settlement statement to title
- **Inspection Deadline Reminder** (date trigger on a field named `customInspectionDeadline`,
  which isn't in the current field list — **verify; may be broken**)
- **Inspection Period Ends Today** (BUY Inspection Deadline) → note
- **Closed** (21 runs) → remove `Buyer`/`Under contract`; move lead stage to Closed-equivalent;
  add Past Client, Event List, Newsletter, Mailers, RE Health Check tags; add birthdays and
  homeiversary; clear custom fields; Gmail folder → Closed; forward docs to PRE; +12h post-closing
  email; +1d social, "how was the move" text; thank-you card; +5d Zillow review; +21d Google
  review; +7d mortgage setup text; +14d homesteading text

### Seller pre-contract (SPC)
- **Consult Complete** → Email(Luke): CMA + net sheet; Text: intro w/ assistant; confirm legal names
- **LC Sent to Sign** → breakdown email; send in Click Contracts; text; Gmail folder
- **LC Signed** → download contract; withhold listing; copy to client; attach to contact; turn in on
  PembertONE; set up comp search; move to Withheld
- **Withheld** → schedule photos (*hold task*); listing video?; drop off lockbox (Luke)
- **Media Scheduled** → text; calendar invite; receive photos *move to 1 day after photos*;
  TISH/POS if needed
- **Media Complete** → photos to clients (email + text); shared drive; upload to MLS; room
  dimensions; move to Coming Soon Prep
- **Coming Soon Prep** → coming-soon post + highlight cards notes; price?; photo order; disclosure
  + lead paint; HOA docs
- **Coming Soon** (19 steps) → listing to sellers; showing instructions; open houses; coming-soon
  email; Insta post; Zillow showcase email; flyers; sign install; showing text; highlight cards;
  just-listed postcard; ~5 tasks marked *MOVE TO DAY BEFORE ACTIVE*; move stage to Active
- **Active** → check hit counters (Luke); remove `Under contract`

### Seller under contract (SUC)
- **Under Contract** (19 runs, 20 steps) → mark contingency in MLS; fill custom fields; PA
  accepted email; submit docs on Pemberton One; 3 calendar invites; Master File; HOA docs?;
  earnest money text; Gmail labels; inspection invite *when scheduled*; day-of-inspection text
  *move to day of inspection*; social post; remind lender *move to two days before*; +1d
  Skyslope summary, title intro
- **Pending** (12 runs, 4 stopped) → mark pending in MLS; text; inspection amendment emails;
  adjust price in Master File *and* custom fields; staging removal?; delete comp search; +1d
  contacts note; +3d gift card
- **Close Date in 14 days** (SELL Close Date; 3 runs, **6 stopped**) → repairs?; closing
  reminder email; closing gift (no condos); +5d settlement statement; +8d mark closed
- **Closed** → tags; lead stage; birthdays; mark closed in MLS; clear custom fields; forward docs
  to PRE; Gmail → Closed; +1d check received?, social; +7d Zillow review text, thank-you card
- **Referral contract info to Stacie Rihl** (UC on either side, source = Stacie Rihl) → email;
  +14d confirm brokerage sends check copy

### Past clients / contact automations
- Text Happy Birthday (225 runs) — day before any of Birthday 1–7
- Send Birthday Card (219) — 7 days before, past clients only
- Text Happy Homeiversary (120); Send Homeiversary Card (132)
- Yearly mailers ×5 — date triggers on the mailer custom fields

### Leads
- **Buyer/Seller New Lead Created** (tag added) → add 6 Month Update, Newsletter, Event List tags
- **Website Sign Up** (manual) → Newsletter tag; +5 min welcome email
- **Zillow Showcase** (manual) → tags; stage; call/text tasks; 11-email drip over a year

### Patterns that misfire or need babysitting
- **Date-triggered "14 days before close" automations are often stopped** (BUC 14 of 35,
  SUC 6 of 9) — likely close-date changes or deals moving out of order.
- **Pending automations stopped frequently** (BUC 13 of 40).
- Tasks are created all at once on the stage change, then manually re-dated ("move to…",
  "hold task", "assign to best date w/ Luke").
- Buyer side has inspection-deadline reminders; seller side has none.
- New-construction handling is duplicated automations behind a tag check.

## Templates

**Email: 95** in folders BPC, BUC, SPC, SUC, Buyer/Seller Leads, Zillow Showcase (12-email
drip), Open House Followups (12-email drip). Also weekly report templates to Luke
(Sunday/Monday task list, social, closing, contingency, listing), out-of-town notices,
Timberwolves tickets, market update, health check.

**Text: 59** in folders BPC, BUC, SPC, SUC, leads. About 17 are **one-off, property-specific**
("SPC [address] Buyer Agent Showing Text", reverse-prospecting texts) — candidates to become one
template with an `{address}` merge field. Also Alyssa start/end-of-shift texts and out-of-town
texts.

**Import plan for HQ:** import the BPC/BUC/SPC/SUC and drip templates, linked to checklist steps;
archive one-offs and dated notices.

## Smart lists (People sidebar)

- **Clear Daily:** Buyer Leads Under Contract (5), Seller Leads Under Contract (1),
  A/B/C/D Leads Missing Next Touch, Leads Needing A/B/C/D Tags
- **SOI Daily Followups:** 30 / 90 / 180 Day Clients and Sphere
- **Leads:** Buyers NOT Under Contract (42), Sellers NOT Under Contract (16), Under Contract (5),
  Stacie Rihl Leads (5), Zillow Showcase Leads
- **Mailing lists:** Past Client Mailing List (203), Fall/Spring Trifold (239)
- **Holding lists:** Christmas Cards (215), Mailers Only (10), Emails Only (99),
  Archive/No Direct Contact (36), Email Newsletters (418)
- **RE Health Checks:** 2026 (148), 2027 (11)
- **Luke OOT:** Buyers (12), Sellers (2), Showing Agents (4)
- **Other:** Timberwolves Tickets Responded (40) / Not Responded (177)

---

## Owner feedback

### Deals
- **Dislikes:** deal data lives in three places (deal card, BUY/SELL custom fields, Master
  File); the Closed column clutters the board.
- **Direction:** owner agrees the stage-per-step setup is clunky and prefers a
  transaction-coordination approach.
- **Recommendation (pending owner sign-off on mockups):** fewer stages, with the step-by-step
  work moved into the checklist. Stages mark real status changes; the checklist carries
  everything in between and shows progress on the card.
  - Buyer: Lead → Consult → Rep Signed / Searching → Offer Out → Under Contract → Closed.
    "BC Sent to Sign", "Showing Homes" become checklist steps; "Pending" becomes the
    Inspection milestone being Met/Waived (shown on the card), not a separate column.
  - Seller: Lead → Consult → Listing Signed / Prep → Coming Soon → Active → Under Contract →
    Closed. "Withheld", "Media Scheduled/Complete", "Coming Soon Prep" become checklist
    phases under Prep. Coming Soon and Active stay as stages because they mirror MLS status.
  - Stage changes happen automatically when the key checklist step is done (e.g. marking
    "Buyer rep signed" moves the deal), replacing the "Change Deal Stage to…" tasks.
  - Closed deals drop off the board after ~30 days into a Closed list/report.

### Sphere follow-up
- Make follow-up frequency (7/30/60/90/180 days) its own contact field, separate from stage,
  with a "due for a touch" list.

### Data import
- **Wait.** No FUB data moves into HQ yet; build and review with seed data first. The
  8,000-contact agent database decision is deferred to import time.
