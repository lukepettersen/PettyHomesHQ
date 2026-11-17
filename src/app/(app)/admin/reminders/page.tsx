import { adminGate } from "../gate";
import { db } from "@/server/db";
import { RemindersClient } from "./RemindersClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  const denied = await adminGate();
  if (denied) return denied;
  const [reminders, stages, team] = await Promise.all([
    db.dateReminder.findMany({ orderBy: { position: "asc" } }),
    db.stage.findMany({ orderBy: { position: "asc" } }),
    db.user.findMany({ where: { status: { not: "DISABLED" } }, orderBy: [{ isOwner: "desc" }, { name: "asc" }] }),
  ]);
  return (
    <>
      <h1 className="text-2xl font-extrabold">Date reminders</h1>
      <p className="mb-4 mt-1 text-sm muted">Every birthday and homeiversary in a contact&apos;s Important Dates creates these tasks each year, automatically. They show in Tasks → Important dates up to 60 days ahead.</p>
      <RemindersClient
        reminders={reminders.map(({ id, dateKind, title, days, direction, assignee, kind, appliesTo }) => ({ id, dateKind, title, days, direction, assignee, kind, appliesTo }))}
        stages={stages.map((s) => s.name)} team={team.map((u) => u.name.split(/\s+/)[0])} />
    </>
  );
}
