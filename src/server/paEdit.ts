import "server-only";
import { db } from "@/server/db";
import { UserError } from "@/server/safe";
import { logActivity } from "@/server/activity";
import { hasPermission } from "@/server/permissions";
import { loadForm } from "@/server/pa";
import { syncContract } from "@/server/google";
import { syncSalesRow } from "@/server/salesSheet";
import { dateFromIso, isoFromDate } from "@/lib/normalize";
import { factsOf, recheckConditions, redateContract } from "@/server/automation";
import { cleanPaAnswers, KEY_DATES, toPaView, type Answers, type DateKey, type PaSection, type PaView } from "@/lib/pa";

// Editing a purchase agreement, shared by Edit on the contract and by texting HQ (owner request 2026-11-02).

const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, string>) : {});
const label = (k: DateKey) => KEY_DATES.find(([x]) => x === k)![1];
const dateData = (dates: Record<DateKey, string | null>) => Object.fromEntries(KEY_DATES.map(([k]) => [k, dates[k] ? dateFromIso(dates[k]!) : null]));

/** A contract as the form's answers (what Edit shows): its answers plus address, price, key dates and, with permission, commission. */
export function answersOf(pa: PaView): Answers {
  const a: Answers = { ...pa.answers, address: pa.address, price: String(pa.price) };
  for (const [k, d] of Object.entries(pa.dates)) if (d) a[k] = d;
  if (pa.writtenStatementNA) a.writtenStatement_na = "yes";
  if (pa.commission !== null) a.commission = pa.commission;
  if (pa.bac !== null) a.bac = pa.bac;
  return a;
}

export function cleanOrThrow(form: PaSection[], answers: Answers, canComm: boolean) {
  try { return cleanPaAnswers(form, answers, { skipCommission: !canComm }); } catch (e) { throw new UserError((e as Error).message); }
}

/** Saves new answers on a contract: a pending key date that moves is marked Extended, checklists re-date and re-check
 *  their "Only when", then the calendar and the sales sheet update. Returns the person and what moved. */
export async function saveContractAnswers(user: { id: string; permissions: string[] }, paId: string, raw: Answers, how = "") {
  const pa = await db.purchaseAgreement.findFirst({ where: { id: paId, deletedAt: null }, include: { file: { include: { person: { select: { name: true } } } } } });
  if (!pa) throw new UserError("That contract was deleted.");
  const canComm = hasPermission(user.permissions as never, "seeCommissions");
  const form = await loadForm(pa.side as "buyer" | "seller");
  const c = cleanOrThrow(form, raw, canComm);
  const status = obj(pa.dateStatus), orig = obj(pa.originalDates);
  const moved: string[] = [];
  for (const [k] of KEY_DATES) {
    const before = pa[k] ? isoFromDate(pa[k]!) : null, after = c.dates[k];
    if (before && after && before !== after) {
      moved.push(label(k));
      if (!status[k] || status[k] === "pending" || status[k] === "extended") { status[k] = "extended"; orig[k] = orig[k] ?? before; }
    }
  }
  const steps = await db.$transaction(async (tx) => {
    await tx.purchaseAgreement.update({
      where: { id: pa.id },
      data: { address: c.address, price: c.price, answers: c.answers, writtenStatementNA: c.writtenStatementNA, ...dateData(c.dates), dateStatus: status, originalDates: orig },
    });
    if (canComm) await tx.paCommission.upsert({ where: { paId: pa.id }, update: c.commission, create: { paId: pa.id, ...c.commission } });
    await redateContract(tx, pa.id);
    return pa.state === "active" ? recheckConditions(tx, pa.id, factsOf(pa.answers, pa.writtenStatementNA), user.id) : { added: 0, removed: 0 };
  });
  await logActivity(user.id, "update", "purchaseAgreement", pa.id, `Updated purchase agreement for ${pa.file.person.name}${how}${moved.length ? ` (moved ${moved.join(", ")})` : ""}${steps.added || steps.removed ? ` (checklist: ${steps.added} added, ${steps.removed} removed)` : ""}`);
  await syncContract(pa.id);
  await syncSalesRow(pa.id, "changed");
  return { personId: pa.file.personId, form, answers: c.answers, moved };
}

/** A contract with its form, for reading or editing by text. */
export async function loadContract(paId: string, permissions: string[]) {
  const pa = await db.purchaseAgreement.findFirst({ where: { id: paId, deletedAt: null }, include: { commission: true, file: { include: { person: { select: { id: true, name: true } } } } } });
  if (!pa) return null;
  const view = toPaView(pa, hasPermission(permissions as never, "seeCommissions"));
  return { pa, view, form: await loadForm(view.side), answers: answersOf(view) };
}
