import Link from "next/link";
import { loadTemplates } from "@/server/events";
import { eventsGate } from "../gate";
import { TemplatesClient } from "./TemplatesClient";

export const dynamic = "force-dynamic";

/** Events → Event templates: reusable setups ("Timberwolves Season", "Pi Day"). */
export default async function Page() {
  const { denied } = await eventsGate();
  if (denied) return denied;
  return (
    <div className="mx-auto max-w-4xl px-4 py-4">
      <Link href="/events" className="text-sm font-semibold text-accent hover:underline">← Events</Link>
      <h1 className="mt-1 text-2xl font-extrabold">Event templates</h1>
      <p className="mt-1 text-sm muted">A template holds the signup questions, whether it has many dates (like games) or one, and the reminder texts. &quot;New event&quot; copies all of it; changing a template later doesn&apos;t change events already made.</p>
      <TemplatesClient templates={await loadTemplates()} />
    </div>
  );
}
