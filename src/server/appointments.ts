import "server-only";
import { db } from "@/server/db";
import { isoFromDate } from "@/lib/normalize";
import { sortAppts, type ApptView } from "@/lib/appointments";
import { contractEvents } from "@/lib/contractInvites";
import { inviteContext, loadInviteRules } from "@/server/contractInvites";

/** A person's appointments plus the dates from their active contracts (SPEC.md §10). */
export async function loadPersonAppointments(personId: string, personName: string): Promise<ApptView[]> {
  const [rows, pas, rules] = await Promise.all([
    db.appointment.findMany({ where: { personId, deletedAt: null } }),
    db.purchaseAgreement.findMany({ where: { state: "active", deletedAt: null, file: { personId, deletedAt: null } } }),
    loadInviteRules(),
  ]);
  const d = (x: Date | null) => (x ? isoFromDate(x) : null);
  const mine: ApptView[] = rows.map((a) => ({
    id: a.id, type: a.type, title: a.title, date: isoFromDate(a.date), start: a.start, end: a.end, location: a.location,
    invitees: Array.isArray(a.invitees) ? (a.invitees as string[]) : [], fromContract: false,
  }));
  // Contract dates show as appointments the same way they go on the calendar (Admin → Calendar invites).
  const fromContracts = pas.flatMap((p) => contractEvents(rules, inviteContext(p, personName)).map((e): ApptView => ({
    id: null, type: "contract", title: e.title, date: e.date, start: e.start, end: null, location: p.address, invitees: [], fromContract: true,
  })));
  return [...mine, ...fromContracts].sort(sortAppts);
}
