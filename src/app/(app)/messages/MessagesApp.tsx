"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { TextComposer } from "@/components/TextComposer";
import { formatPhone } from "@/lib/normalize";
import { sendProblem } from "@/lib/texting";
import type { Bubble, Thread } from "@/server/texting";
import { addPersonFromNumber, deleteThread, linkNumber, markRead } from "./actions";

type Line = { userId: string; name: string; number: string };
type Composer = { from: string | null; blocked: string | null; templates: { id: string; name: string }[] };

const tz = "America/Chicago";
const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).replace(" ", "").toLowerCase();
const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { timeZone: tz, month: "short", day: "numeric" });
const sameDay = (a: string, b: Date) => day(a) === day(b.toISOString());
/** "8:05pm" today, "Oct 19" before. */
const when = (iso: string) => (sameDay(iso, new Date()) ? clock(iso) : day(iso));
const STATUS: Record<string, string> = { queued: "Sending…", accepted: "Sending…", sending: "Sending…", sent: "Sent", delivered: "Delivered", failed: "Not delivered", undelivered: "Not delivered" };

/** Messages (SPEC.md §11): conversations on the left, the open one on the right. Refreshes every 15 seconds. */
export function MessagesApp({ lines, line, threads, open, person, conversation, composer }: {
  lines: Line[]; line: Line | null; threads: Thread[]; open: string | null; person: { id: string; name: string } | null; conversation: Bubble[]; composer: Composer;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const href = (n: string | null, lineId = line?.userId) => `/messages?${new URLSearchParams({ ...(lineId ? { line: lineId } : {}), ...(n ? { n } : {}) })}`;
  const current = threads.find((t) => t.number === open);

  useEffect(() => { const t = setInterval(() => router.refresh(), 15000); return () => clearInterval(t); }, [router]);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [open, conversation.length]);
  useEffect(() => { if (line && open && current?.unread) void markRead({ ourNumber: line.number, number: open }).then(() => router.refresh()); }, [line, open, current?.unread, router]);

  if (!line) return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-extrabold">Messages</h1>
      <p className="card mt-4 p-5 text-sm">Nobody has a texting number yet. An Admin adds each person&apos;s Twilio number in Admin → Integrations.</p>
    </div>
  );
  const shown = threads.filter((t) => !q.trim() || t.name.toLowerCase().includes(q.trim().toLowerCase()) || t.number.includes(q.replace(/\D/g, "") || "~"));
  return (
    <div className="mx-auto grid max-w-[1400px] grid-cols-1 items-start gap-3 px-4 py-4 md:grid-cols-[320px_minmax(0,1fr)]">
      <section aria-label="Conversations" className={`card flex flex-col overflow-hidden ${open ? "max-md:hidden" : ""}`}>
        <div className="flex flex-col gap-2 border-b border-misty p-3">
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-xl font-extrabold">Messages</h1>
            {lines.length > 1 && (
              <select aria-label="Whose texts" className="input w-auto text-sm font-semibold" value={line.userId} onChange={(e) => router.push(href(null, e.target.value))}>
                {lines.map((l) => <option key={l.userId} value={l.userId}>{l.name.split(" ")[0]} · {formatPhone(l.number)}</option>)}
              </select>
            )}
          </div>
          <input className="input" type="search" aria-label="Search conversations" placeholder="Search name or number" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {shown.length ? (
          <ul className="max-h-[calc(100vh-220px)] overflow-y-auto">
            {shown.map((t) => (
              <li key={t.number}>
                <Link href={href(t.number)} aria-current={t.number === open ? "true" : undefined}
                  className={`grid grid-cols-[minmax(0,1fr)_auto] gap-x-2 border-t border-misty px-3 py-2.5 first:border-0 hover:bg-sunken ${t.number === open ? "bg-accent-soft" : ""}`}>
                  <span className={`truncate ${t.unread ? "font-extrabold" : "font-semibold"}`}>{t.name}</span>
                  <span className="text-xs muted">{when(t.at)}</span>
                  <span className={`truncate text-sm ${t.unread ? "text-charcoal" : "muted"} ${t.lastKind === "missed_call" ? "text-bad" : ""}`}>{t.lastDir === "out" ? "You: " : ""}{t.last}</span>
                  {t.unread > 0 ? <span className="self-center justify-self-end rounded-full bg-coral px-1.5 text-xs font-bold text-white">{t.unread}</span> : <span />}
                </Link>
              </li>
            ))}
          </ul>
        ) : <p className="p-4 text-sm muted">{threads.length ? "No conversations match." : `No texts yet on ${formatPhone(line.number)}. Text a contact from their page (Send text), or wait for someone to text this number.`}</p>}
      </section>

      <section aria-label="Conversation" className={`card flex min-h-[60vh] flex-col ${open ? "" : "max-md:hidden"}`}>
        {!open ? <p className="m-auto p-6 text-sm muted">Pick a conversation.</p> : (
          <>
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-misty p-3">
              <div className="min-w-0">
                <Link href={href(null)} className="text-sm muted md:hidden">‹ Messages</Link>
                {person ? <Link href={`/people/${person.id}`} className="block truncate text-lg font-extrabold hover:underline">{person.name} ›</Link> : <b className="block text-lg font-extrabold">{formatPhone(open)}</b>}
                {person && <span className="text-xs muted">{formatPhone(open)}</span>}
              </div>
              <span className="flex flex-wrap gap-2">
                <a className="btn" href={`tel:+1${open}`}>Call</a>
                <DeleteThread ourNumber={line.number} number={open} onDone={() => router.push(href(null))} />
              </span>
            </header>
            {!person && <Unknown number={open} onDone={() => router.refresh()} />}
            <div className="flex flex-1 flex-col gap-1.5 overflow-y-auto p-3" style={{ maxHeight: "calc(100vh - 380px)" }}>
              {conversation.map((m, i) => {
                const newDay = i === 0 || day(conversation[i - 1].at) !== day(m.at);
                return (
                  <div key={m.id} className="flex flex-col">
                    {newDay && <p className="my-2 text-center text-xs font-semibold muted">{day(m.at)}</p>}
                    {m.kind === "missed_call" ? (
                      <p className="self-center rounded-full bg-[#f9e1de] px-3 py-1 text-xs font-semibold text-bad">Missed call · {clock(m.at)}</p>
                    ) : (
                      <div className={`flex max-w-[80%] flex-col ${m.direction === "out" ? "items-end self-end" : "items-start self-start"}`}>
                        <p className={`whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm ${m.direction === "out" ? "bg-accent text-white" : "bg-sunken"}`}>{m.body}</p>
                        <span className="px-1 text-[11px] muted">
                          {clock(m.at)}{m.direction === "out" ? ` · ${m.by ? `${m.by} · ` : ""}${STATUS[m.status] ?? m.status}` : ""}
                        </span>
                        {m.error && ["failed", "undelivered"].includes(m.status) && <span className="px-1 text-xs text-bad">{sendProblem(m.error)}</span>}
                      </div>
                    )}
                  </div>
                );
              })}
              <div ref={end} />
            </div>
            <div className="border-t border-misty p-3">
              <TextComposer key={open} personId={person?.id ?? null} phones={[open]} compact {...composer} />
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function DeleteThread({ ourNumber, number, onDone }: { ourNumber: string; number: string; onDone: () => void }) {
  const [sure, setSure] = useState(false);
  const [pending, start] = useTransition();
  return (
    <button type="button" className="btn text-bad" disabled={pending} onBlur={() => setSure(false)} onClick={() => {
      if (!sure) { setSure(true); return; }
      start(async () => { const r = await deleteThread({ ourNumber, number }); if (r.ok) onDone(); });
    }}>{sure ? "Click again to delete" : "Delete"}</button>
  );
}

/** A number that isn't on any contact: add them as a new person, or put the number on someone who exists. */
function Unknown({ number, onDone }: { number: string; onDone: () => void }) {
  const [mode, setMode] = useState<"" | "new" | "link">("");
  const [name, setName] = useState("");
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<{ id: string; name: string; detail: string }[]>([]);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  useEffect(() => {
    if (mode !== "link" || q.trim().length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => { fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal }).then((r) => r.json()).then((d) => setHits(d.results ?? [])).catch(() => {}); }, 200);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [mode, q]);
  const done = (r: { ok: boolean; error?: string }) => { if (!r.ok) { setError(r.error ?? "Something went wrong."); return; } setMode(""); onDone(); };
  return (
    <div className="flex flex-col gap-2 border-b border-misty bg-sunken/60 p-3 text-sm">
      <p>This number isn&apos;t on any contact.</p>
      {mode === "" && <span className="flex flex-wrap gap-2"><button type="button" className="btn" onClick={() => setMode("new")}>Add as new person</button><button type="button" className="btn" onClick={() => setMode("link")}>Add to an existing contact</button></span>}
      {mode === "new" && (
        <span className="flex flex-wrap gap-2">
          <input autoFocus className="input w-64" aria-label="Their name" placeholder="Their name" value={name} onChange={(e) => setName(e.target.value)} />
          <button type="button" className="btn" onClick={() => setMode("")}>Cancel</button>
          <button type="button" className="btn btn-primary" disabled={pending || !name.trim()} onClick={() => start(async () => done(await addPersonFromNumber({ number, name })))}>Add person</button>
        </span>
      )}
      {mode === "link" && (
        <div className="flex flex-col gap-1">
          <span className="flex gap-2"><input autoFocus className="input w-64" aria-label="Find a contact" placeholder="Search contacts" value={q} onChange={(e) => setQ(e.target.value)} /><button type="button" className="btn" onClick={() => setMode("")}>Cancel</button></span>
          {q.trim().length >= 2 && hits.map((h) => (
            <button key={h.id} type="button" disabled={pending} className="self-start rounded-md px-2 py-1 text-left hover:bg-white" onClick={() => start(async () => done(await linkNumber({ number, personId: h.id })))}>
              <b>{h.name}</b> <span className="muted">{h.detail}</span>
            </button>
          ))}
        </div>
      )}
      {error && <p role="alert" className="text-bad">{error}</p>}
    </div>
  );
}
