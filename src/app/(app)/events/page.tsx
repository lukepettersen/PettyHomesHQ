import Link from "next/link";
import { loadEvents, loadTemplates } from "@/server/events";
import { shortEventDate } from "@/lib/events";
import { isoFromDate } from "@/lib/normalize";
import { eventsGate } from "./gate";
import { NewEvent } from "./NewEvent";

export const dynamic = "force-dynamic";

/** Events (owner request 2026-11-21; SPEC.md §6.7): client events like Timberwolves tickets and Pi Day pies. */
export default async function Page() {
  const { denied } = await eventsGate();
  if (denied) return denied;
  const [events, templates] = await Promise.all([loadEvents(), loadTemplates()]);
  const today = isoFromDate(new Date());
  const upcoming = events.filter((e) => e.next || !e.last), past = events.filter((e) => !e.next && e.last);
  const when = (e: (typeof events)[number]) => !e.first ? "No dates yet" : e.multiSlot ? `${e.slots} dates · ${shortEventDate(e.first)}–${shortEventDate(e.last!)}${e.next && e.next !== e.first ? ` · next ${shortEventDate(e.next)}` : ""}` : shortEventDate(e.first);
  const list = (rows: typeof events) => (
    <ul className="divide-y divide-misty">
      {rows.map((e) => (
        <li key={e.id}>
          <Link href={`/events/${e.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-sunken">
            <span className="min-w-0"><b>{e.name}</b>{e.type && <span className="ml-2 text-xs muted">{e.type}</span>}<span className="block text-sm muted">{when(e)}</span></span>
            <span className="flex items-center gap-2 text-sm">
              {e.signupOn && <span className="rounded-full bg-accent-soft px-2 text-xs font-semibold text-accent">Signup page on</span>}
              <span className="muted">{e.attendees} {e.attendees === 1 ? "attendee" : "attendees"}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
  return (
    <div className="mx-auto max-w-4xl px-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-extrabold">Events</h1>
        <Link href="/events/templates" className="btn">Event templates</Link>
      </div>
      <NewEvent templates={templates.map((t) => ({ id: t.id, name: t.name, multiSlot: t.multiSlot }))} today={today} />
      <section className="card mt-4 overflow-hidden" aria-labelledby="up-h">
        <h2 id="up-h" className="border-b border-misty px-4 py-2 font-bold">Upcoming</h2>
        {upcoming.length ? list(upcoming) : <p className="px-4 py-3 text-sm muted">No upcoming events. Start one above.</p>}
      </section>
      {past.length > 0 && (
        <details className="card mt-4 overflow-hidden">
          <summary className="cursor-pointer px-4 py-2 font-bold">Past events ({past.length})</summary>
          {list(past)}
        </details>
      )}
    </div>
  );
}
