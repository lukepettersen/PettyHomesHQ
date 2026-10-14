import "server-only";
import { db } from "@/server/db";
import { loadForm } from "@/server/pa";
import { loadFileForm } from "@/server/files";
import { hasPermission } from "@/server/permissions";
import type { SessionUser } from "@/server/auth";
import { isoFromDate } from "@/lib/normalize";
import { formMergeFields, formValues, mergeValues, type MergeCtx } from "@/lib/merge";
import type { PaSection } from "@/lib/pa";

const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, string>) : {});

/** The forms whose questions are merge fields, in the order the field list shows them. */
export async function loadMergeForms(): Promise<{ group: string; sections: PaSection[] }[]> {
  const [buyerPa, sellerPa, buyerFile, listingFile] = await Promise.all([loadForm("buyer"), loadForm("seller"), loadFileForm("buyer"), loadFileForm("listing")]);
  return [
    { group: "Contract (buyer side)", sections: buyerPa },
    { group: "Contract (seller side)", sections: sellerPa },
    { group: "Buyer file", sections: buyerFile },
    { group: "Listing file", sections: listingFile },
  ];
}

/**
 * Merge values for a person: their contract (the given one, else the active one), its file (else their open
 * file), the team and the signed-in user. Every form question is a key; empty ones are "". Commission/BAC
 * fill in only with "See commissions".
 */
export async function mergeFor(user: SessionUser, personId: string | null, where: { paId?: string | null; fileId?: string | null } = {}) {
  const p = personId ? await db.person.findFirst({ where: { id: personId, deletedAt: null }, include: { emails: { orderBy: { position: "asc" }, take: 1 }, phones: { orderBy: { position: "asc" }, take: 1 } } }) : null;
  const ctx: MergeCtx = { personName: p?.name ?? "", mailingName: p?.mailingName, email: p?.emails[0]?.address, phone: p?.phones[0]?.number, homeAddress: p?.address };
  const canComm = hasPermission(user.permissions, "seeCommissions");
  const forms = await loadMergeForms();
  const fields = formMergeFields(forms);
  const extra: Record<string, string> = Object.fromEntries(fields.map((f) => [f.key, ""]));
  if (p) {
    const pa = await db.purchaseAgreement.findFirst({ where: where.paId ? { id: where.paId } : { state: "active", deletedAt: null, file: { personId: p.id, deletedAt: null, ...(where.fileId ? { id: where.fileId } : {}) } }, orderBy: { createdAt: "desc" }, include: { commission: canComm } });
    const file = await db.clientFile.findFirst({ where: pa ? { id: pa.fileId } : { personId: p.id, deletedAt: null, closedAt: null, ...(where.fileId ? { id: where.fileId } : {}) }, orderBy: { createdAt: "desc" }, include: { commission: canComm } });
    const comm = (c: { commission: string; bac: string } | null | undefined): Record<string, string> => (canComm && c ? { commission: c.commission, bac: c.bac } : {});
    if (file) Object.assign(extra, formValues(forms.find((f) => f.group === (file.kind === "listing" ? "Listing file" : "Buyer file"))!.sections,
      { ...obj(file.info), address: file.address ?? "", price: file.price ? String(file.price) : "", ...comm(file.commission) }));
    if (pa) {
      const d = (x: Date | null) => (x ? isoFromDate(x) : "");
      const answers = { ...obj(pa.answers), address: pa.address, price: String(pa.price), ...comm(pa.commission),
        finalAcceptance: d(pa.finalAcceptance), inspection: d(pa.inspection), writtenStatement: d(pa.writtenStatement), hoaRescission: d(pa.hoaRescission), closing: d(pa.closing),
        ...(pa.writtenStatementNA ? { writtenStatement_na: "yes" } : {}) };
      for (const [k, val] of Object.entries(formValues(forms.find((f) => f.group === (pa.side === "seller" ? "Contract (seller side)" : "Contract (buyer side)"))!.sections, answers))) if (val || !extra[k]) extra[k] = val;
      const a = obj(pa.answers), dn = (x: Date | null) => (x ? isoFromDate(x) : null);
      Object.assign(ctx, { address: pa.address, price: pa.price, inspAppt: a.inspAppt ?? null, lender: a.lenderName ?? null, titleCompany: a.titleCompany ?? null,
        dates: { finalAcceptance: dn(pa.finalAcceptance), inspection: dn(pa.inspection), writtenStatement: pa.writtenStatementNA ? null : dn(pa.writtenStatement), closing: dn(pa.closing) } });
    } else if (file) Object.assign(ctx, { address: file.address, price: file.price, lender: obj(file.info).lender ?? null });
  }
  const team = await db.user.findMany({ where: { status: { not: "DISABLED" } }, orderBy: { isOwner: "desc" } });
  ctx.agentName = team.find((t) => t.isOwner)?.name ?? "";
  ctx.assistantName = team.find((t) => !t.isOwner)?.name ?? "";
  ctx.myName = user.name;
  ctx.extra = extra;
  return { values: mergeValues(ctx), label: (k: string) => fields.find((f) => f.key === k)?.label ?? k };
}
