import { notFound } from "next/navigation";
import { loadEvent } from "@/server/events";
import { isoFromDate } from "@/lib/normalize";
import { eventsGate } from "../gate";
import { EventHeader } from "./EventClient";
import { EventTabs } from "./EventTabs";

export const dynamic = "force-dynamic";

/** One event: a summary at the top, then tabs (Games / Waitlist / Reminder texts / Signup page / Import). */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { user, denied } = await eventsGate();
  if (denied) return denied;
  const e = await loadEvent((await params).id, user);
  if (!e) notFound();
  const today = isoFromDate(new Date());
  return (
    <div className="mx-auto max-w-5xl px-4 py-4">
      <EventHeader key={`h${e.name}${JSON.stringify(e.fields)}${e.intro}`} e={e} today={today} />
      <EventTabs e={e} today={today} />
    </div>
  );
}
