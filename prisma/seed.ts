// Seeds roles, the team and default settings. Safe to run on every start:
// each block only fills a table that is still empty, so edits made in Admin are never overwritten.
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { DEFAULT_ROLES } from "../src/server/permissions";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const TEAM = [
  { email: "luke@pettyhomes.com", name: "Luke Pettersen", role: "Admin", isOwner: true },
  { email: "assistant@pettyhomes.com", name: "Alyssa Chakiton", role: "Assistant", isOwner: false },
];
const STAGES = ["Sphere", "Past Client", "Lead", "Industry Partners", "Passive Marketing", "Archive", "Trash"];
const SOURCES = ["Sphere", "Sphere Referral", "Website", "Zillow Preferred", "Open House", "Sign Call"];
const FOLLOW_UP = [7, 30, 60, 90, 180];
const TAGS = ["Buyer", "Seller", "Past Client", "A Lead", "B Lead", "C Lead", "D Lead", "Email Newsletter", "Mailers", "Christmas Cards", "Petty Homes Event List", "Real Estate Health Check", "Investor", "Unsubscribed", "Bounced", "No Bday Needed"];
const REMINDERS = [
  { dateKind: "birthday", title: "Text happy birthday", days: 0, direction: "on", assignee: "Luke", kind: "text", appliesTo: "Everyone" },
  { dateKind: "birthday", title: "Send birthday card", days: 7, direction: "before", assignee: "Alyssa", kind: "task", appliesTo: "Past Client" },
  { dateKind: "homeiversary", title: "Text happy homeiversary", days: 0, direction: "on", assignee: "Luke", kind: "text", appliesTo: "Everyone" },
  { dateKind: "homeiversary", title: "Send homeiversary card", days: 7, direction: "before", assignee: "Alyssa", kind: "task", appliesTo: "Past Client" },
];
// Built-in task lists (SPEC.md §9). Rows exist so they can be ordered with user lists and hidden from Today.
const BUILTIN_LISTS: [string, string][] = [["clients", "Clients"], ["touch", "Due for a touch"], ["dates", "Important dates"], ["recurring", "Recurring"], ["misc", "Misc"]];
type F = { field: string; op: string; value: string };
const f = (field: string, op: string, value: string): F => ({ field, op, value });
const COLLECTIONS: [string, [string, F[]][]][] = [
  ["Clear Daily", [["A leads", [f("tag", "has", "A Lead")]], ["Leads with no upcoming task", [f("stage", "is", "Lead"), f("upcomingTask", "is", "no")]]]],
  ["Sphere", [["Past clients", [f("stage", "is", "Past Client")]], ["Sphere", [f("stage", "is", "Sphere")]], ["Due for a touch", [f("dueForTouch", "is", "yes")]], ["30 day sphere", [f("followUp", "is", "30")]], ["90 day sphere", [f("followUp", "is", "90")]], ["180 day sphere", [f("followUp", "is", "180")]]]],
  ["Leads", [["All leads", [f("stage", "is", "Lead")]], ["Website leads", [f("source", "is", "Website")]], ["Zillow leads", [f("source", "is", "Zillow Preferred")]], ["Gone quiet (60+ days)", [f("stage", "is", "Lead"), f("lastContact", "moreThan", "60")]]]],
  ["Mailing Lists", [["Past client mailers", [f("stage", "is", "Past Client"), f("tag", "has", "Mailers")]], ["Christmas cards", [f("tag", "has", "Christmas Cards")]], ["Email newsletter", [f("tag", "has", "Email Newsletter")]]]],
  ["Partners", [["Industry partners", [f("stage", "is", "Industry Partners")]]]],
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
  // Trash: anything deleted more than 30 days ago is removed for good.
  const cutoff = new Date(Date.now() - 30 * 86400000);
  const purged = await db.person.deleteMany({ where: { deletedAt: { lt: cutoff } } });
  await db.task.deleteMany({ where: { deletedAt: { lt: cutoff } } });
  console.log(`Seeded roles, team and default settings. Purged ${purged.count} from Trash.`);
}

main().finally(() => db.$disconnect());
