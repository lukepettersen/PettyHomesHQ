import { adminGate } from "../gate";
import { loadTemplates } from "@/server/automation";
import { loadStatuses } from "@/server/files";
import { loadTeam } from "@/server/tasks";
import { db } from "@/server/db";
import { isoFromDate, todayCentral } from "@/lib/normalize";
import { TemplatesClient } from "./TemplatesClient";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const denied = await adminGate("editTaskTemplates");
  if (denied) return denied;
  const [templates, statuses, team, tags, sp, messages, stages] = await Promise.all([loadTemplates(), loadStatuses(), loadTeam(), db.tag.findMany({ orderBy: { name: "asc" } }), searchParams,
    db.messageTemplate.findMany({ orderBy: [{ folder: "asc" }, { name: "asc" }], select: { id: true, kind: true, name: true, folder: true } }), db.stage.findMany({ orderBy: { position: "asc" } })]);
  return (
    <>
      <h1 className="text-2xl font-extrabold">Task templates</h1>
      <p className="mb-4 mt-1 text-sm muted">
        A template is a list of steps that become tasks. It starts when a deal enters a stage, when a purchase agreement is added or closes, when a phone call is booked, or when you apply it from a contact.
        Due dates count from the start date or a contract date and move when that date changes. If the date isn&apos;t set yet, the task waits for it.
      </p>
      <TemplatesClient messages={messages} templates={templates} statuses={[...statuses.buyer, ...statuses.listing]} team={team.map((m) => m.name.split(/\s+/)[0])}
        tags={tags.map((t) => t.name)} stages={stages.map((s) => s.name)} today={isoFromDate(todayCentral())} initialId={sp.t ?? templates[0]?.id ?? null} />
    </>
  );
}
