import Link from "next/link";

type Row = { id: string; eventId: string; line: string; summary: string; date: string; status: string; statusLabel: string };
const CHIP: Record<string, string> = { invited: "bg-sunken text-charcoal", confirmed: "bg-accent-soft text-accent", sent: "bg-[#e3ecf7] text-[#24507a]", declined: "bg-[#f7e2de] text-bad" };

/** Their events, newest first (owner request 2026-11-21): "Wolves vs Lakers 1/14/27", "Pi Day 2026 3/14/26 · 2 Apple". */
type Wait = { id: string; eventId: string; label: string; since: string; waiting: boolean };
export function EventsCard({ rows, today, waits = [] }: { rows: Row[]; today: string; waits?: Wait[] }) {
  if (!rows.length && !waits.length) return null;
  const went = rows.filter((r) => r.date < today && (r.status === "confirmed" || r.status === "sent")).length;
  return (
    <section className="card p-4" aria-labelledby="events-h">
      <div className="flex items-baseline justify-between">
        <h2 id="events-h" className="text-lg font-bold">Events</h2>
        <span className="text-xs muted">{rows.length}{went ? ` · went to ${went}` : ""}</span>
      </div>
      <ul className="mt-1">
        {waits.map((w) => (
          <li key={w.id} className="flex items-start justify-between gap-2 border-t border-misty/60 py-1.5 text-sm first:border-0">
            <Link href={`/events/${w.eventId}`} className="min-w-0 hover:underline">{w.label}<span className="muted"> · since {w.since.slice(5).replace("-", "/")}</span></Link>
            <span className={`flex-none rounded-full px-2 text-xs font-semibold ${w.waiting ? "bg-[#f6efd9] text-[#7a5d12]" : "bg-accent-soft text-accent"}`}>{w.waiting ? "Waiting" : "Has a game"}</span>
          </li>
        ))}
        {rows.map((r) => (
          <li key={r.id} className="flex items-start justify-between gap-2 border-t border-misty/60 py-1.5 text-sm first:border-0">
            <Link href={`/events/${r.eventId}`} className="min-w-0 hover:underline">{r.line}{r.summary && <span className="muted"> · {r.summary}</span>}</Link>
            <span className={`flex-none rounded-full px-2 text-xs font-semibold ${CHIP[r.status] ?? ""}`}>{r.statusLabel}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
