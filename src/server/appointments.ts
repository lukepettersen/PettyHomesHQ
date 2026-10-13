import "server-only";
import { db } from "@/server/db";
import { isoFromDate } from "@/lib/normalize";
import { contractAppointments, sortAppts, type ApptView } from "@/lib/appointments";

/** A person's appointments plus the dates from their active contracts (SPEC.md §10). */
export async function loadPersonAppointments(personId: string, personName: string): Promise<ApptView[]> {
  const [rows, pas] = await Promise.all([
    db.appointment.findMany({ where: { personId, deletedAt: null } }),
    db.purchaseAgreement.findMany({ where: { state: "active", deletedAt: null, file: { personId, deletedAt: null } } }),
  ]);
  const d = (x: Date | null) => (x ? isoFromDate(x) : null);
  const mine: ApptView[] = rows.map((a) => ({
    id: a.id, type: a.type, title: a.title, date: isoFromDate(a.date), start: a.start, end: a.end, location: a.location,
    invitees: Array.isArray(a.invitees) ? (a.invitees as string[]) : [], fromContract: false,
  }));
  const fromContracts = pas.flatMap((p) => {
    const answers = (p.answers && typeof p.answers === "object" ? p.answers : {}) as Record<string, string>;
    return contractAppointments(personName, { address: p.address, inspAppt: answers.inspAppt, inspection: d(p.inspection), writtenStatement: p.writtenStatementNA ? null : d(p.writtenStatement), closing: d(p.closing) });
  });
  return [...mine, ...fromContracts].sort(sortAppts);
}
