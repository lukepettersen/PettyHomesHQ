import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "@/server/db";
import { sendSms } from "@/server/twilio";
import { textingEnabled } from "@/server/integrations";
import { logActivity } from "@/server/activity";
import { UserError } from "@/server/safe";
import { isoFromDate, dateFromIso, normalizePhone, todayCentral } from "@/lib/normalize";
import { cleanConfig, paperDetails, paperProblem, paperSteps, paperText, paperTitle, formName, aOrAn, SOURCE_PREFIX, type PaperConfig, type PaperRequest } from "@/lib/paperwork";

const KEY = "paperwork.steps";
/** The steps for each form and the owner's own forms (Admin → Paperwork steps). */
export async function loadPaperConfig(): Promise<PaperConfig> {
  return cleanConfig((await db.appSetting.findUnique({ where: { key: KEY } }))?.value);
}
export async function savePaperConfig(userId: string, cfg: PaperConfig) {
  const value = { steps: cfg.steps, custom: cfg.custom.map((c) => ({ key: c.key, label: c.label })) };
  await db.appSetting.upsert({ where: { key: KEY }, update: { value }, create: { key: KEY, value } });
  await logActivity(userId, "update", "setting", KEY, `Saved paperwork steps (${cfg.custom.length} of your own forms)`);
}

// Request paperwork (SPEC.md §7.5b, owner request 2026-11-04): a task for a teammate to write a form up in
// ClickContracts, due right away, with a bell alert and a text to their cell (YES checks it off). When it's
// checked off, whoever asked hears it's ready to sign.

const nowClock = () => new Date().toLocaleTimeString("en-GB", { timeZone: "America/Chicago", hour: "2-digit", minute: "2-digit", hour12: false });
const first = (n: string) => n.split(/\s+/)[0];

/** Texts a team member on their cell from their own HQ number. False when they have none or texting is off. */
async function textTeammate(userId: string, body: string): Promise<boolean> {
  if (!(await textingEnabled())) return false;
  const u = await db.user.findUnique({ where: { id: userId }, select: { textNumber: true, forwardTo: true, status: true } });
  if (!u?.textNumber || !u.forwardTo || u.status === "DISABLED") return false;
  const r = await sendSms({ from: u.textNumber, to: u.forwardTo, body });
  if (!r.ok) return false;
  await db.textMessage.create({ data: { ourNumber: u.textNumber, theirNumber: normalizePhone(u.forwardTo), direction: "out", body, twilioSid: r.sid, status: r.status, readAt: new Date() } }).catch(() => null);
  return true;
}

export async function requestPaperwork(from: { id: string; name: string }, personId: string, toId: string, req: PaperRequest) {
  const { steps, custom } = await loadPaperConfig();
  const problem = paperProblem(req, custom);
  if (problem) throw new UserError(problem);
  const person = await db.person.findFirst({ where: { id: personId, deletedAt: null }, select: { id: true, name: true } });
  if (!person) throw new UserError("That person was deleted.");
  const to = await db.user.findFirst({ where: { id: toId, status: { not: "DISABLED" } }, select: { id: true, name: true } });
  if (!to) throw new UserError("Pick who should write it up.");

  const title = paperTitle(req, person.name, custom);
  const details = paperDetails(req, custom);
  const name = formName(req, custom);
  // The form's steps, filled in, are checkboxes on the task (owner 2026-11-05).
  const subtasks = paperSteps(req, person.name, steps, custom).map((t) => ({ title: t, done: false }));
  const task = await db.$transaction(async (tx) => {
    const t = await tx.task.create({
      data: { title, notes: details, kind: "task", dueDate: dateFromIso(isoFromDate(todayCentral())), dueTime: nowClock(), subtasks, priority: 1, personId: person.id, assigneeId: to.id, createdById: from.id, sourceKey: `${SOURCE_PREFIX}${randomUUID()}` },
    });
    await tx.timelineEntry.create({ data: { personId: person.id, kind: "note", authorId: from.id, body: `Asked ${first(to.name)} for ${aOrAn(name)} in ClickContracts.${details ? `\n${details}` : ""}` } });
    if (to.id !== from.id) await tx.notification.create({ data: { toId: to.id, fromId: from.id, personId: person.id, alert: true, text: `${first(from.name)} needs ${aOrAn(name)} for ${person.name} in ClickContracts` } });
    return t;
  });

  // The text is a check-in: a YES from their cell checks the task off (same as "Ask by text" steps).
  const texted = await textTeammate(to.id, paperText(req, person.name, first(from.name), custom));
  if (texted) await db.task.update({ where: { id: task.id }, data: { askState: "asked", askKind: "done", askedAt: new Date() } });
  await logActivity(from.id, "create", "task", task.id, `Requested ${name} for ${person.name} from ${to.name}`);
  return { taskId: task.id, to: first(to.name), texted };
}

/** A paperwork request checked off by someone else: whoever asked gets a bell alert and a text that it's ready to sign. */
export async function paperworkDone(taskId: string, doneById: string): Promise<void> {
  const t = await db.task.findUnique({ where: { id: taskId }, select: { title: true, sourceKey: true, createdById: true, personId: true, completedAt: true, person: { select: { name: true } } } });
  if (!t?.completedAt || !t.sourceKey?.startsWith(SOURCE_PREFIX) || !t.createdById || t.createdById === doneById) return;
  const by = await db.user.findUnique({ where: { id: doneById }, select: { name: true } });
  const what = t.title.replace(/^Write up /, "").replace(/ in ClickContracts.*$/, "");
  const text = `${first(by?.name ?? "Someone")} wrote up the ${what}${t.person ? ` for ${t.person.name}` : ""}: ready to sign in ClickContracts`;
  await db.notification.create({ data: { toId: t.createdById, fromId: doneById, personId: t.personId, alert: true, text } });
  await textTeammate(t.createdById, `HQ: ${text}.`).catch(() => false);
}
