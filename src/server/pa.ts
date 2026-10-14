import "server-only";
import { db } from "@/server/db";
import { hasPermission } from "@/server/permissions";
import type { SessionUser } from "@/server/auth";
import { DEFAULT_FORMS, toPaView, type PaSection, type PaView, type Side } from "@/lib/pa";

export async function loadForm(side: Side): Promise<PaSection[]> {
  const row = await db.paForm.findUnique({ where: { side } });
  return Array.isArray(row?.sections) ? (row.sections as unknown as PaSection[]) : DEFAULT_FORMS[side];
}

export const paInclude = (user: SessionUser) => ({ commission: hasPermission(user.permissions, "seeCommissions"), partners: { include: { person: { select: { id: true, name: true } } } } });

export async function loadPersonContracts(personId: string, user: SessionUser): Promise<PaView[]> {
  const rows = await db.purchaseAgreement.findMany({ where: { deletedAt: null, file: { personId, deletedAt: null } }, include: paInclude(user), orderBy: { createdAt: "desc" } });
  return rows.map((r) => toPaView(r, hasPermission(user.permissions, "seeCommissions")));
}
