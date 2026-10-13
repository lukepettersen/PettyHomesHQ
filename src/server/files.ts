import "server-only";
import { db } from "@/server/db";
import { hasPermission } from "@/server/permissions";
import type { SessionUser } from "@/server/auth";
import { isoFromDate, todayCentral } from "@/lib/normalize";
import { toFileView, type FileView } from "@/lib/files";

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

export type PipelineCard = FileView & { nextTask: { title: string; due: string | null } | null; overdue: number; assignees: string[] };

/** Active files for the Pipeline board, each with its client's next open task (checklists join in piece 3). */
export async function loadPipeline(user: SessionUser): Promise<PipelineCard[]> {
  const today = todayCentral();
  const files = await db.clientFile.findMany({ where: { deletedAt: null, closedAt: null, person: { deletedAt: null } }, include: fileInclude(user), orderBy: { statusSince: "asc" } });
  const tasks = await db.task.findMany({
    where: { personId: { in: [...new Set(files.map((f) => f.personId))] }, completedAt: null, deletedAt: null },
    orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { priority: "desc" }],
    include: { assignee: { select: { name: true } } },
  });
  const can = hasPermission(user.permissions, "seeCommissions");
  return files.map((f) => {
    const mine = tasks.filter((t) => t.personId === f.personId);
    const n = mine[0];
    return {
      ...toFileView(f, can),
      nextTask: n ? { title: n.title, due: n.dueDate ? isoFromDate(n.dueDate) : null } : null,
      overdue: mine.filter((t) => t.dueDate && t.dueDate < today).length,
      assignees: [...new Set(mine.map((t) => t.assignee?.name).filter((x): x is string => !!x))],
    };
  });
}
