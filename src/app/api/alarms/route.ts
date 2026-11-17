import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { db } from "@/server/db";
import { LIVE_STEPS } from "@/server/tasks";
import { isoFromDate, todayCentral } from "@/lib/normalize";

export const dynamic = "force-dynamic";

/** Today's open tasks with a set time, assigned to the signed-in person: the browser rings when each comes due.
 *  Automatic sends and "ask by text" steps are left out: those text instead. */
export async function GET() {
  const session = await getServerSession(authOptions);
  const id = session?.user?.id;
  if (!id) return Response.json({ error: "Sign in first" }, { status: 401 });
  const today = todayCentral();
  const tasks = await db.task.findMany({
    // A step that texts you instead ("ask by text", still waiting or asked) doesn't also ring here (owner report 2026-11-02).
    where: { assigneeId: id, dueDate: today, dueTime: { not: null }, completedAt: null, deletedAt: null, ...LIVE_STEPS, OR: [{ askState: null }, { askState: { notIn: ["pending", "asked"] } }] },
    include: { person: { select: { name: true } } },
    orderBy: { dueTime: "asc" },
  });
  return Response.json({
    date: isoFromDate(today),
    alarms: tasks.map((t) => ({ id: t.id, title: t.title, time: t.dueTime!, kind: t.kind, personId: t.personId, personName: t.person?.name ?? null })),
  }, { headers: { "Cache-Control": "no-store" } });
}
