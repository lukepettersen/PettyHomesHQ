import "server-only";
import { db } from "@/server/db";
import { hasPermission } from "@/server/permissions";
import type { SessionUser } from "@/server/auth";
import { isoFromDate, todayCentral } from "@/lib/normalize";
import { toFileView, type FileView } from "@/lib/files";
import { toPaView, ucColumn, type PaView } from "@/lib/pa";
import { LIVE_STEPS } from "@/server/tasks";

export type StatusRow = { id: string; kind: string; name: string; untilDate: string | null };

export async function loadStatuses(): Promise<Record<"buyer" | "listing" | "uc", StatusRow[]>> {
  const rows = await db.pipelineStatus.findMany({ orderBy: [{ kind: "asc" }, { position: "asc" }] });
  const by = (k: string) => rows.filter((r) => r.kind === k).map(({ id, kind, name, untilDate }) => ({ id, kind, name, untilDate }));
  return { buyer: by("buyer"), listing: by("listing"), uc: by("uc") };
}

/** Commission and BAC are only read from the database for users with "See commissions". */
function fileInclude(user: SessionUser) {
  return { person: { select: { name: true } }, status: { select: { name: true } }, commission: hasPermission(user.permissions, "seeCommissions") } as const;
}

export async function loadPersonFiles(personId: string, user: SessionUser): Promise<FileView[]> {
  const files = await db.clientFile.findMany({ where: { personId, deletedAt: null }, include: fileInclude(user), orderBy: [{ closedAt: { sort: "desc", nulls: "first" } }, { createdAt: "desc" }] });
  return files.map((f) => toFileView(f, hasPermission(user.permissions, "seeCommissions")));
}

type Next = { nextTask: { title: string; due: string | null } | null; overdue: number; assignees: string[] };
export type PipelineCard = FileView & Next;
export type ContractCard = PaView & Next & { personId: string; personName: string; columnId: string | null };

/** The Pipeline board: active files without a contract, active contracts by Under Contract column, and closings this year. */
export async function loadPipeline(user: SessionUser): Promise<{ files: PipelineCard[]; contracts: ContractCard[]; closed: ContractCard[] }> {
  const today = todayCentral(), todayIso = isoFromDate(today);
  const can = hasPermission(user.permissions, "seeCommissions");
  const yearStart = new Date(Date.UTC(today.getUTCFullYear(), 0, 1));
  const [files, pas, ucCols] = await Promise.all([
    db.clientFile.findMany({ where: { deletedAt: null, closedAt: null, person: { deletedAt: null } }, include: fileInclude(user), orderBy: { statusSince: "asc" } }),
    db.purchaseAgreement.findMany({
      where: { deletedAt: null, file: { deletedAt: null, person: { deletedAt: null } }, OR: [{ state: "active" }, { state: "closed", endedOn: { gte: yearStart } }] },
      include: { commission: can, file: { select: { personId: true, person: { select: { name: true } } } } },
      orderBy: [{ endedOn: "desc" }, { closing: "asc" }],
    }),
    db.pipelineStatus.findMany({ where: { kind: "uc" }, orderBy: { position: "asc" } }),
  ]);
  const personIds = [...new Set([...files.map((f) => f.personId), ...pas.map((p) => p.file.personId)])];
  const tasks = await db.task.findMany({
    where: { personId: { in: personIds }, completedAt: null, deletedAt: null, ...LIVE_STEPS },
    orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { priority: "desc" }],
    include: { assignee: { select: { name: true } } },
  });
  const next = (personId: string): Next => {
    const mine = tasks.filter((t) => t.personId === personId), n = mine[0];
    return {
      nextTask: n ? { title: n.title, due: n.dueDate ? isoFromDate(n.dueDate) : null } : null,
      overdue: mine.filter((t) => t.dueDate && t.dueDate < today).length,
      assignees: [...new Set(mine.map((t) => t.assignee?.name).filter((x): x is string => !!x))],
    };
  };
  const underContract = new Set(pas.filter((p) => p.state === "active").map((p) => p.fileId));
  const card = (p: (typeof pas)[number]): ContractCard => {
    const v = toPaView(p, can);
    return { ...v, ...next(p.file.personId), personId: p.file.personId, personName: p.file.person.name, columnId: p.state === "active" ? ucColumn(ucCols, v, todayIso)?.id ?? null : null };
  };
  return {
    files: files.filter((f) => !underContract.has(f.id)).map((f) => ({ ...toFileView(f, can), ...next(f.personId) })),
    contracts: pas.filter((p) => p.state === "active").map(card),
    closed: pas.filter((p) => p.state === "closed").map(card),
  };
}
