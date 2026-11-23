import Link from "next/link";
import { adminGate } from "../gate";
import { loadGmailStatus } from "@/server/google";
import { loadShowingLog } from "@/server/showings";
import { LookAgain } from "./LookAgain";

export const dynamic = "force-dynamic";

const tz = "America/Chicago";
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-US", { timeZone: tz, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).replace(/ (AM|PM)$/, (m) => m.trim().toLowerCase()) : "never");
const TONE = { added: "bg-accent-soft text-accent", updated: "bg-[#e3ecf7] text-[#24507a]", skipped: "bg-sunken", failed: "bg-[#fbe3df] text-bad" } as const;
const LABEL = { added: "Added", updated: "Updated", skipped: "Skipped", failed: "Didn't work" } as const;

/** Admin → Showing emails (owner request 2026-11-23: "somewhere I can track this feature"): is HQ reading Gmail, and
 *  every ShowingTime email it read with what it did. */
export default async function Page() {
  const denied = await adminGate();
  if (denied) return denied;
  const [inboxes, log] = await Promise.all([loadGmailStatus(), loadShowingLog()]);
  return (
    <>
      <h1 className="text-2xl font-extrabold">Showing emails</h1>
      <p className="mb-4 mt-1 text-sm muted">HQ checks Gmail every few minutes for ShowingTime emails. Each confirmed showing adds a note to the agent&apos;s contact and starts the &quot;When a showing is confirmed&quot; checklist (texts and tasks). This page shows whether Gmail is being read and what HQ did with each ShowingTime email.</p>
      <section className="card mb-4 p-4" aria-labelledby="inb">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="inb" className="font-bold">Inboxes HQ reads</h2>
          <LookAgain />
        </div>
        {!inboxes.length && <p className="mt-2 text-sm text-bad">No Google account is connected, so HQ can&apos;t read showing emails. Connect Google in <Link href="/admin/integrations" className="link">Admin → Integrations</Link>.</p>}
        <ul className="mt-2 divide-y divide-misty text-sm">
          {inboxes.map((i) => {
            const bad = !i.reads || (i.errorAt && (!i.okAt || i.errorAt > i.okAt));
            return (
              <li key={i.email + i.shared} className="flex flex-wrap items-baseline justify-between gap-2 py-1.5">
                <span><b>{i.email}</b> <span className="text-xs muted">{i.shared ? "(the shared Google connection)" : "(their own Gmail)"}</span></span>
                <span className={bad ? "text-bad" : i.okAt ? "text-accent" : "muted"}>
                  {!i.reads ? "Not allowed to read email: Reconnect Google in Admin → Integrations" : bad ? `Couldn't read Gmail ${when(i.errorAt)}: ${i.error}. Reconnect Google in Admin → Integrations.` : i.okAt ? `Read OK, last ${when(i.okAt)}` : "No read recorded yet. Click Look again to check it now."}
                </span>
              </li>
            );
          })}
        </ul>
      </section>
      <section className="card overflow-hidden" aria-labelledby="log">
        <h2 id="log" className="border-b border-misty px-4 py-2 font-bold">ShowingTime emails HQ read <span className="text-sm font-normal muted">(newest first, the last 80)</span></h2>
        {!log.length && <p className="px-4 py-3 text-sm muted">None yet. New ones show here as HQ reads them; &quot;Look again&quot; reads the last 3 days now.</p>}
        <ul className="divide-y divide-misty text-sm">
          {log.map((r, i) => (
            <li key={i} className="px-4 py-2">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className={`rounded-full px-2 text-xs font-semibold ${TONE[r.result]}`}>{LABEL[r.result]}</span>
                <b className="min-w-0 flex-1 break-words">{r.subject || "(no subject)"}</b>
                <span className="text-xs muted">received {when(r.received)}{r.inbox ? ` · ${r.inbox}` : ""}</span>
              </div>
              <p className="mt-0.5 text-xs muted">{r.why}{r.personId && <> · <Link href={`/people/${r.personId}`} className="link">Open the contact</Link></>}</p>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
