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

## Recommendation for HQ (simple version, approved direction)

Keep it straightforward. Most of the value comes from a few rules.

**A template is a list of steps.** Each step has a name, who does it, a due date written as
"X days before/after a date" (start date or a contract date), a type (task, call, email, text)
and, for email/text, a message template that opens as a draft to review.

**A template starts one of two ways:** a deal enters a stage, or you apply it by hand from a
contact.

**Four rules make it work like transaction coordination software:**
1. When a date changes, the steps move with it. Nothing is ever "stopped".
2. When a date isn't set yet, the step says "waits for inspection date" and gets a due date as
   soon as the date is entered (Paperless Pipeline's behavior).
3. Steps can be done in any order, or marked N/A / skipped.
4. "Only when" (HOA, built before 1978, new construction, FHA/VA, condo) keeps one template
   instead of duplicates (Open To Close's conditional logic).

One optional step action: "When done, move the deal to [stage]" (replaces FUB's
"Change deal stage to…" tasks).

**Birthdays and homeiversaries are not templates.** Admin → Date reminders sets what happens
for each Important Date (e.g. text on the day, card 7 days before for past clients), and HQ
adds those as yearly recurring tasks automatically. This replaces FUB's contact automations
and the yearly-mailer custom field workaround.

**Deferred until needed:** tag triggers, templates that start other templates, multiple
"when done" actions, auto-sending messages, business-day counting and holiday skipping, and a
self-drafting weekly client update (can be a weekly step on the Under Contract template).

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
