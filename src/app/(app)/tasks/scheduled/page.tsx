import Link from "next/link";
import { requireUser } from "@/server/auth";
import { hasPermission } from "@/server/permissions";
import { loadAllScheduled } from "@/server/scheduledTexts";
import { ScheduledList } from "@/components/ScheduledList";

export const dynamic = "force-dynamic";

type Row = Awaited<ReturnType<typeof loadAllScheduled>>[number];
const isEmail = (r: Row) => r.id.startsWith("email:") || r.body.startsWith("Automatic email");
const isAsk = (r: Row) => r.id.startsWith("ask:");
const matches = (r: Row, k: string) => (!k ? true : k === "failed" ? r.status === "failed" : k === "checkin" ? isAsk(r) : k === "email" ? isEmail(r) : !isEmail(r) && !isAsk(r));
const KINDS = [["", "Everything"], ["text", "Texts"], ["email", "Emails"], ["checkin", "Check-ins"], ["failed", "Didn't send"]] as const;

/** Tasks → Scheduled (owner request 2026-11-03): every text, email, automatic checklist send and check-in text waiting
 *  to go out, for every contact: when, who it's to, who it's from, which checklist, and Cancel / Turn off. */
export default async function Page({ searchParams }: { searchParams: Promise<{ k?: string }> }) {
  const user = await requireUser();
  const k = (await searchParams).k ?? "";
  const all = await loadAllScheduled(user.id, hasPermission(user.permissions, "deleteRecords"));
  const rows = all.filter((r) => matches(r, k));
  return (
    <div className="mx-auto max-w-4xl px-4 py-4">
      <Link href="/tasks" className="link text-sm">← Tasks</Link>
      <h1 className="mt-2 text-2xl font-extrabold">Scheduled</h1>
      <p className="mb-3 mt-1 text-sm muted">Everything waiting to go out, for every contact: scheduled texts and emails, automatic checklist texts and emails, and check-in texts to the team. Click one to read it in full.</p>
      <nav aria-label="Show" className="mb-3 flex flex-wrap gap-1.5">
        {KINDS.map(([key, label]) => {
          const n = all.filter((r) => matches(r, key)).length;
          return <Link key={key} href={key ? `/tasks/scheduled?k=${key}` : "/tasks/scheduled"} aria-current={k === key ? "page" : undefined}
            className={`rounded-full border px-3 py-1 text-sm ${k === key ? "border-charcoal bg-charcoal text-white" : "border-misty bg-white hover:bg-sunken"}`}>{label} <span className={k === key ? "" : "muted"}>{n}</span></Link>;
        })}
      </nav>
      <ScheduledList rows={rows} withPerson empty="Nothing scheduled right now." />
    </div>
  );
}
