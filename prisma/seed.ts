// Seeds roles, the team and default settings. Safe to run on every start:
// each block only fills a table that is still empty, so edits made in Admin are never overwritten.
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { DEFAULT_ROLES } from "../src/server/permissions";
import { DEFAULT_FORMS, upgradeNotesAnswers, upgradeNotesForm, type Answers, type PaSection } from "../src/lib/pa";
import { STARTER_TEMPLATES } from "./starterTemplates";
import { defaultFileForm } from "../src/lib/files";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const TEAM = [
  { email: "luke@pettyhomes.com", name: "Luke Pettersen", role: "Admin", isOwner: true },
  { email: "assistant@pettyhomes.com", name: "Alyssa Chakiton", role: "Assistant", isOwner: false },
];
const STAGES = ["Sphere", "Past Client", "Lead", "Industry Partners", "Passive Marketing", "Archive", "Trash"];
const SOURCES = ["Sphere", "Sphere Referral", "Website", "Zillow Preferred", "Open House", "Sign Call"];
const FOLLOW_UP = [7, 30, 60, 90, 180];
const TAGS = ["Buyer", "Seller", "Past Client", "A Lead", "B Lead", "C Lead", "D Lead", "Email Newsletter", "Mailers", "Christmas Cards", "Petty Homes Event List", "Real Estate Health Check", "Investor", "Email Unsubscribed", "Text Unsubscribed", "Bounced", "No Bday Needed"];
const REMINDERS = [
  { dateKind: "birthday", title: "Text Happy Birthday", days: 0, direction: "on", assignee: "Luke", kind: "text", appliesTo: "Everyone" },
  { dateKind: "birthday", title: "Send Birthday Card", days: 7, direction: "before", assignee: "Alyssa", kind: "task", appliesTo: "Past Client" },
  { dateKind: "homeiversary", title: "Text Happy Homeiversary", days: 0, direction: "on", assignee: "Luke", kind: "text", appliesTo: "Everyone" },
  { dateKind: "homeiversary", title: "Send Homeiversary Card", days: 7, direction: "before", assignee: "Alyssa", kind: "task", appliesTo: "Past Client" },
];
// Built-in task lists (SPEC.md §9). Rows exist so they can be ordered with user lists and hidden from Today.
const BUILTIN_LISTS: [string, string][] = [["clients", "Clients"], ["touch", "Due for a touch"], ["dates", "Important dates"], ["recurring", "Recurring"], ["misc", "Misc"]];
const STATUSES: [string, string[]][] = [
  ["buyer", ["Consult scheduled", "Consult complete", "Rep signed", "Showing homes", "Submitting offers"]],
  ["listing", ["Consult scheduled", "Consult complete", "Listing signed / Prep", "Coming soon", "Active"]],
];
const UC_COLUMNS: [string, string][] = [["Inspection", "inspection"], ["Pending", "closing"]];
type F = { field: string; op: string; value: string };
const f = (field: string, op: string, value: string): F => ({ field, op, value });
const COLLECTIONS: [string, [string, F[]][]][] = [
  ["Clear Daily", [["A leads", [f("tag", "has", "A Lead")]], ["Leads with no upcoming task", [f("stage", "is", "Lead"), f("upcomingTask", "is", "no")]]]],
  ["Sphere", [["Past clients", [f("stage", "is", "Past Client")]], ["Sphere", [f("stage", "is", "Sphere")]], ["Due for a touch", [f("dueForTouch", "is", "yes")]], ["30 day sphere", [f("followUp", "is", "30")]], ["90 day sphere", [f("followUp", "is", "90")]], ["180 day sphere", [f("followUp", "is", "180")]]]],
  ["Leads", [["All leads", [f("stage", "is", "Lead")]], ["Website leads", [f("source", "is", "Website")]], ["Zillow leads", [f("source", "is", "Zillow Preferred")]], ["Gone quiet (60+ days)", [f("stage", "is", "Lead"), f("lastContact", "moreThan", "60")]]]],
  ["Mailing Lists", [["Past client mailers", [f("stage", "is", "Past Client"), f("tag", "has", "Mailers")]], ["Christmas cards", [f("tag", "has", "Christmas Cards")]], ["Email newsletter", [f("tag", "has", "Email Newsletter")]]]],
  ["Partners", [["Industry partners", [f("stage", "is", "Industry Partners")]], ["Realtors", [f("type", "is", "Realtor")]], ["Lenders", [f("type", "is", "Lender")]], ["Title", [f("type", "is", "Title")]]]],
];

async function main() {
  for (const [name, permissions] of Object.entries(DEFAULT_ROLES)) {
    await db.role.upsert({ where: { name }, update: {}, create: { name, permissions } });
  }
  for (const m of TEAM) {
    const role = await db.role.findUniqueOrThrow({ where: { name: m.role } });
    await db.user.upsert({ where: { email: m.email }, update: {}, create: { email: m.email, name: m.name, isOwner: m.isOwner, roleId: role.id } });
  }
  if ((await db.stage.count()) === 0) await db.stage.createMany({ data: STAGES.map((name, position) => ({ name, position })) });
  if ((await db.source.count()) === 0) await db.source.createMany({ data: SOURCES.map((name, position) => ({ name, position })) });
  if ((await db.followUpOption.count()) === 0) await db.followUpOption.createMany({ data: FOLLOW_UP.map((days, position) => ({ days, position })) });
  if ((await db.tag.count()) === 0) await db.tag.createMany({ data: TAGS.map((name) => ({ name })) });
  if ((await db.dateReminder.count()) === 0) await db.dateReminder.createMany({ data: REMINDERS.map((r, position) => ({ ...r, position })) });
  if ((await db.collection.count()) === 0) {
    for (const [ci, [name, lists]] of COLLECTIONS.entries()) {
      await db.collection.create({ data: { name, position: ci, lists: { create: lists.map(([n, filters], position) => ({ name: n, position, filters })) } } });
    }
  }
  for (const [i, [builtin, name]] of BUILTIN_LISTS.entries()) {
    const exists = await db.taskList.findUnique({ where: { builtin } });
    if (!exists) await db.taskList.create({ data: { builtin, name: (await db.taskList.findUnique({ where: { name } })) ? `${name} (built in)` : name, position: i } });
  }
  if ((await db.pipelineStatus.count()) === 0) {
    for (const [kind, names] of STATUSES) await db.pipelineStatus.createMany({ data: names.map((name, position) => ({ kind, name, position })) });
    await db.pipelineStatus.createMany({ data: UC_COLUMNS.map(([name, untilDate], position) => ({ kind: "uc", name, untilDate, position })) });
  }
  for (const side of ["buyer", "seller"] as const) {
    if (!(await db.paForm.findUnique({ where: { side } }))) await db.paForm.create({ data: { side, sections: DEFAULT_FORMS[side] } });
  }
  // One-time upgrade (owner request 2026-10-26): Referral fee / Material defect become Yes/No with follow-ups,
  // Earnest money to becomes a client-name dropdown. Earlier answers move to the new questions.
  if (!(await db.appSetting.findUnique({ where: { key: "pa.notesUpgrade" } }))) {
    for (const row of await db.paForm.findMany()) {
      const up = Array.isArray(row.sections) ? upgradeNotesForm(row.sections as unknown as PaSection[]) : null;
      if (!up) continue;
      await db.paForm.update({ where: { side: row.side }, data: { sections: up.form } });
      for (const pa of await db.purchaseAgreement.findMany({ where: { side: row.side }, select: { id: true, answers: true } })) {
        const a = upgradeNotesAnswers((pa.answers ?? {}) as Answers, up);
        if (a) await db.purchaseAgreement.update({ where: { id: pa.id }, data: { answers: a } });
      }
    }
    await db.appSetting.create({ data: { key: "pa.notesUpgrade", value: true } });
  }
  // One-time fix (2026-10-29): booking a consult used to overwrite an automatic step's picked send time with the
  // consult's time. Once only, so a time someone later changes by hand stays.
  if (!(await db.appSetting.findUnique({ where: { key: "tasks.autoTimeFix" } }))) {
    await db.$executeRaw`UPDATE "Task" SET "dueTime" = "autoSend"->>'time' WHERE "autoState" = 'pending' AND "offsetMinutes" IS NULL AND "completedAt" IS NULL AND "autoSend"->>'time' IS NOT NULL AND "dueTime" IS DISTINCT FROM "autoSend"->>'time'`;
    await db.appSetting.create({ data: { key: "tasks.autoTimeFix", value: true } });
  }
  // Buyer and listing forms, once, shown at the same statuses as before they were editable.
  for (const kind of ["buyer", "listing"] as const) {
    if (!(await db.fileFormDef.findUnique({ where: { kind } }))) {
      const statuses = await db.pipelineStatus.findMany({ where: { kind }, orderBy: { position: "asc" } });
      await db.fileFormDef.create({ data: { kind, sections: defaultFileForm(kind, statuses) } });
    }
  }
  // Starter task templates, once, matched to the statuses by name (SPEC.md §8).
  if ((await db.taskTemplate.count()) === 0) {
    const statuses = await db.pipelineStatus.findMany();
    const statusId = (kind: string, name: string) => statuses.find((x) => x.kind === kind && x.name === name)?.id;
    for (const [position, t] of STARTER_TEMPLATES.entries()) {
      const trigger = typeof t.trigger === "object" && t.trigger ? (statusId(t.trigger.status.kind, t.trigger.status.name) ? `status:${statusId(t.trigger.status.kind, t.trigger.status.name)}` : null) : t.trigger;
      const phases = t.phases.map((ph) => ({
        ...ph,
        steps: ph.steps.map(({ advanceName, ...st }) => ({ ...st, ...(advanceName && statusId(t.advanceKind, String(advanceName)) ? { advance: statusId(t.advanceKind, String(advanceName)) } : {}) })),
      }));
      await db.taskTemplate.create({ data: { name: t.name, trigger, phases, position } });
    }
  }
  // One-time repair: template tasks created 2026-10-15/16 lost their assignee and "When done" status (fixed in automation.ts).
  const orphans = await db.task.findMany({ where: { templateId: { not: null }, stepId: { not: null }, assigneeId: null, completedAt: null, deletedAt: null }, include: { person: { select: { assignedToId: true } } } });
  if (orphans.length) {
    const team = await db.user.findMany({ where: { status: { not: "DISABLED" } }, select: { id: true, name: true, isOwner: true } });
    const owner = team.find((u) => u.isOwner)?.id ?? null;
    const tpls = new Map((await db.taskTemplate.findMany({ where: { id: { in: [...new Set(orphans.map((o) => o.templateId!))] } } })).map((t) => [t.id, t]));
    for (const o of orphans) {
      const phases = (Array.isArray(tpls.get(o.templateId!)?.phases) ? tpls.get(o.templateId!)!.phases : []) as { steps: { id: string; assignee?: string; advance?: string }[] }[];
      const step = phases.flatMap((p) => p.steps).find((x) => x.id === o.stepId);
      const named = step?.assignee ? team.find((u) => u.name.split(/\s+/)[0].toLowerCase() === step.assignee!.toLowerCase())?.id : undefined;
      await db.task.update({ where: { id: o.id }, data: { assigneeId: named ?? o.person?.assignedToId ?? owner, advanceStatusId: o.advanceStatusId ?? step?.advance ?? null } });
    }
  }
  // Trash: anything deleted more than 30 days ago is removed for good.
  const cutoff = new Date(Date.now() - 30 * 86400000);
  // People with stored files are purged by the app (it removes the files from the bucket first).
  const purged = await db.person.deleteMany({ where: { deletedAt: { lt: cutoff }, documents: { none: {} } } });
  await db.task.deleteMany({ where: { deletedAt: { lt: cutoff } } });
  await db.clientFile.deleteMany({ where: { deletedAt: { lt: cutoff } } });
  console.log(`Seeded roles, team and default settings. Purged ${purged.count} from Trash.`);
}

main().finally(() => db.$disconnect());
