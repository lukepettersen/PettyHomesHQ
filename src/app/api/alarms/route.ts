import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { db } from "@/server/db";
import { LIVE_STEPS } from "@/server/tasks";
import { isoFromDate, todayCentral } from "@/lib/normalize";

export const dynamic = "force-dynamic";

/** Today's open tasks with a set time, assigned to the signed-in person: the browser rings when each comes due. */
export async function GET() {
  const session = await getServerSession(authOptions);
  const id = session?.user?.id;
  if (!id) return Response.json({ error: "Sign in first" }, { status: 401 });
  const today = todayCentral();
  const tasks = await db.task.findMany({
    where: { assigneeId: id, dueDate: today, dueTime: { not: null }, completedAt: null, deletedAt: null, ...LIVE_STEPS },
    include: { person: { select: { name: true } } },
    orderBy: { dueTime: "asc" },
  });
  return Response.json({
    date: isoFromDate(today),
    alarms: tasks.map((t) => ({ id: t.id, title: t.title, time: t.dueTime!, kind: t.kind, personId: t.personId, personName: t.person?.name ?? null })),
  }, { headers: { "Cache-Control": "no-store" } });
}
