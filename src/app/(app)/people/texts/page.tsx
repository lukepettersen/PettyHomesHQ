import Link from "next/link";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db";
import { StopTextButton } from "./StopTextButton";

export const dynamic = "force-dynamic";

const tz = "America/Chicago";
const when = (d: Date) => d.toLocaleString("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).replace(/ (AM|PM)$/, (m) => m.trim().toLowerCase());

/** People → Mass texts (owner request 2026-11-06): your mass texts, how far along, and Stop. */
export default async function Page() {
  const user = await requireUser();
  const jobs = await db.bulkTextJob.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 20 });
  return (
    <div className="mx-auto max-w-4xl px-4 py-4">
      <Link href="/people" className="link text-sm">← People</Link>
      <h1 className="mt-2 text-2xl font-extrabold">Mass texts</h1>
      <p className="mb-4 mt-1 text-sm muted">Sent one every 1–2 minutes, 9am–7pm, up to your daily limit; replies come into Messages. Start one on People: select people, then Text.</p>
      {jobs.length === 0 ? <p className="card p-4 text-sm muted">No mass texts yet.</p> : (
        <ul className="card divide-y divide-misty">
          {jobs.map((j) => {
            const total = (j.personIds as string[]).length;
            const failed = (j.failed as { name: string; error: string }[]).length;
            return (
              <li key={j.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <span className="min-w-0 flex-1"><b className="line-clamp-2 whitespace-pre-wrap">{j.body}</b><span className="text-xs muted">Started {when(j.createdAt)}</span></span>
                <span className={j.state === "stopped" ? "text-bad" : ""}>
                  {j.state === "sending" ? `Sending… ${j.sent} of ${total} texted · next ${when(j.nextAt)}` : `${j.state === "stopped" ? "Stopped" : "Done"}: ${j.sent} of ${total} texted`}
                  {j.skipped > 0 && ` · ${j.skipped} skipped`}{failed > 0 && ` · ${failed} didn't send`}
                  {j.error && j.error !== "Stopped." && <span className="block text-xs text-bad">{j.error}</span>}
                </span>
                {j.state === "sending" && <StopTextButton id={j.id} />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
