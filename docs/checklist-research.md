# Checklists & Automations: Research and Recommendation

How HQ should combine what Follow Up Boss automations do well with what transaction
coordination (TC) platforms do well. Based on the FUB account review (`docs/fub-review.md`)
and vendor documentation for Follow Up Boss, Open To Close, ListedKit and Paperless Pipeline
(sources at the bottom). Most sources are vendor pages, so treat feature claims as claims.

## What each side gets right

**Follow Up Boss automations (relationship side)**
- Many trigger types: stage change, tag added, deal stage change, calendar date (close date,
  custom dates), appointment, manual. Actions: create tasks, send email, change stage, tag,
  reassign. Date triggers start at 8 AM.
- Great for things that repeat on a person, not a transaction: birthdays, homeiversaries,
  yearly mailers, website sign-up drips, past-client touches. Your review confirms these work.

**Where FUB breaks for transactions (from your account)**
- Deal-stage automations fire once, on the stage change. Tasks are created all at once, then
  re-dated by hand ("MOVE TO DAY BEFORE ACTIVE", "move due date to day after inspection").
- Date-triggered "14 days before close" automations were stopped in 14 of 35 buyer runs and
  6 of 9 seller runs, likely because close dates move or deals move out of order.
- Deal data lives in three places (deal card, BUY/SELL fields, Master File), so tasks exist
  just to keep them in sync.
- New construction is a duplicate copy of each automation behind a tag check.

**TC platforms (transaction side)**
- Paperless Pipeline: checklist templates where each task is due relative to a trigger date
  (acceptance, close, listing, inspection, etc.). Dates resolve when the checklist is added
  and **recalculate whenever the trigger date changes**. If the date isn't known yet, the task
  simply has no due date until it is. Per-deal edits don't change the template. Business vs
  calendar days and skipping weekends/holidays are advertised.
- Open To Close: task templates split by process, with **conditional logic** so each deal
  only gets the tasks that apply; custom fields become merge fields; **completing a task can
  send an email or text or apply another template**; past-due notifications; "property
  templates" bundle fields, documents, triggers and tasks.
- ListedKit: tasks tied to contract dates that update when an amendment changes them;
  reusable **milestones** (mini-checklists) you can add to any file at any time; each email
  template has a "when should this be used" rule so the right draft appears when a task comes
  due; emails send from your own Gmail.
- TC practice: a **weekly client status update** (even when nothing changed) plus immediate
  updates at big milestones; contingencies are where deals fail, so each one needs a tracked
  deadline.

## Recommendation for HQ

One system, three building blocks. This keeps FUB's flexibility and adds TC-style date logic.

### 1. Templates with four ways to start
Every template is a set of steps that become tasks. A template starts in one of four ways:

| Starts when | Example | Replaces in FUB |
|---|---|---|
| A deal enters a stage | Buyer → Under Contract | Deal Stage Changed automations |
| A date comes around | 7 days before a birthday; homeiversary; 14 days before closing | Calendar Date automations, yearly mailer fields |
| A tag is added | `Offer` tag → offer checklist | Tag Added automations |
| You apply it by hand | Open house follow-up, mid-deal "Repair negotiation" | Manual automations |

Templates can also start other templates (Open To Close) so big flows stay small and reusable,
for example "Under Contract" starts "HOA review" only when the property has an HOA.

### 2. Steps that stay correct when dates move
- Due date = a named date ± days. Named dates: start date, any contract date, any person date
  (birthday, homeiversary) or custom date field.
- **Recalculate on every date change.** No step is ever "stopped" because a date moved.
- **No date yet means no due date yet** (Paperless). The step appears with "waiting on
  inspection date" and gets a date as soon as one is entered.
- Per step: calendar or **business days**, and "skip weekends and holidays", since many MN
  purchase agreement deadlines are counted in business days.
- **Conditions** at the template and step level (HOA, new construction, built before 1978,
  financing type, cash, condo, referral partner). One template, no duplicates.
- Steps can be marked Done, N/A or Skipped, in any order. Waiving a contract date resolves its
  steps.

### 3. Steps that do things
- Type: task, call, email, text. Email and text steps link to a message template.
- **Send mode per step:** "Draft for review" (default) or "Send automatically" for low-risk
  messages like birthday texts or a weekly update. Matches how you already work (tasks that
  say "send template X") without blind auto-sending.
- **When done:** move the deal to a stage, start another template, notify someone, and/or
  send a message. Replaces FUB's "Change deal stage to…" tasks.
- **Past-due alerts** to the assignee (and to you for anything client-facing).

### 4. Built-in communication rhythm (TC practice)
- A **weekly client update** template that drafts itself every Monday for each deal under
  contract, filled from live data: what happened, what's next, upcoming deadlines.
- Milestone messages at acceptance, inspection result, appraisal, clear to close, closing.

### 5. Person-level automations stay simple
Birthdays, homeiversaries, yearly mailers, follow-up frequency touches and lead drips run from
date triggers and recurring tasks on the person, not on deals.

## What changes in the mockup
1. Template "Starts" gets the four trigger types (stage, date, tag, by hand) instead of
   stage-or-manual only.
2. Template-level "Only for" conditions, and "start another template" as a step action.
3. Step options: business days / skip weekends, send mode (draft vs auto-send), and multiple
   "when done" actions.
4. Deal checklist shows "waiting on [date]" for steps whose date isn't set yet.
5. A seeded "Weekly client update" template and person-level templates (birthday,
   homeiversary, yearly mailers) to replace the FUB contact automations.

## Sources
- Follow Up Boss Help Center: Automations 2.0 triggers and migration —
  https://help.followupboss.com/hc/en-us/articles/33217901299095-Automations-2-0-Migration
- Follow Up Boss changelog: trigger an automation when changing a deal's stage —
  https://updates.followupboss.com/en/trigger-an-automation-when-changing-a-deals-stage
- Follow Up Boss changelog: deal custom dates and automations —
  https://updates.followupboss.com/en/level-up-your-deal-organization-and-workflow-track-commissions-splits-automation-more
- Paperless Pipeline: understanding checklists and tasks —
  https://help.paperlesspipeline.com/help/understanding-checklists-and-tasks
- Paperless Pipeline: add a checklist template —
  https://paperless-sandbox.knowledgeowl.com/help/add-a-checklist-template
- Paperless Pipeline: critical due dates —
  https://www.paperlesspipeline.com/transaction-software-features/real-estate-transaction-due-dates
- Open To Close: Tasks 101 — https://intercom.help/open-to-close/en/articles/8992983-tasks-101
- Open To Close: Emails 101 — https://intercom.help/open-to-close/en/articles/9007053-emails-101
- Open To Close: features — https://opentoclose.com/features
- ListedKit: tasks — https://www.listedkit.com/features/tasks
- ListedKit: quick start guide —
  https://help.listedkit.com/getting-started/4gsigo5uo7GhqHs82v32cZ/listedkit-quick-start-guidneed-help-tailoring-listedkit-to-your-workflow/4gsigo5uo7b1GRSpyErC7R
- ListedKit: transaction coordinator checklist —
  https://www.listedkit.com/resources/real-estate-transaction-coordinator-checklist
