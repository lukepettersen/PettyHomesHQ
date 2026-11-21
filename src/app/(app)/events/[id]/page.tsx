import { notFound } from "next/navigation";
import { loadEvent } from "@/server/events";
import { isoFromDate } from "@/lib/normalize";
import { eventsGate } from "../gate";
import { EventHeader, EventSlots } from "./EventClient";
import { Reminders, SignupSettings } from "./EventSide";
import { WaitlistCard } from "./Waitlist";

export const dynamic = "force-dynamic";

/** One event: its dates (games) and people on the left; signup page and reminder texts on the right. */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { denied } = await eventsGate();
  if (denied) return denied;
  const e = await loadEvent((await params).id);
  if (!e) notFound();
  return (
    <div className="mx-auto max-w-6xl px-4 py-4">
      <EventHeader key={`h${e.name}${e.fields.length}`} e={e} />
      <div className="mt-3 grid grid-cols-1 items-start gap-3 lg:grid-cols-[minmax(0,1fr)_380px]">
        <EventSlots e={e} today={isoFromDate(new Date())} />
        <div className="flex flex-col gap-3">
          {e.multiSlot && <WaitlistCard e={e} />}
          <SignupSettings key={`s${e.signupKey}${e.signupOn}`} e={e} />
          <Reminders e={e} />
        </div>
      </div>
    </div>
  );
}
