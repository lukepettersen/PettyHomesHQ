"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { TextComposer } from "@/components/TextComposer";
import { formatPhone } from "@/lib/normalize";
import { sendProblem } from "@/lib/texting";
import type { Bubble, GroupInfo, Thread } from "@/server/texting";
import { MAX_GROUP } from "@/lib/groupText";
import { addPersonFromNumber, deleteThread, linkNumber, markRead, sendGroup, startGroup } from "./actions";

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
export function MessagesApp({ lines, line, threads, open, person, conversation, composer, group, groupsOn }: {
  lines: Line[]; line: Line | null; threads: Thread[]; open: string | null; person: { id: string; name: string } | null; conversation: Bubble[]; composer: Composer;
  group: GroupInfo | null; groupsOn: boolean;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"all" | "unread">("all");
  const [starting, setStarting] = useState(false);
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
  const unreadThreads = threads.filter((t) => t.unread > 0).length;
  const shown = threads.filter((t) => tab === "all" || t.unread > 0 || t.number === open).filter((t) => !q.trim() || t.name.toLowerCase().includes(q.trim().toLowerCase()) || t.number.includes(q.replace(/\D/g, "") || "~"));
  return (
    <div className="mx-auto grid max-w-[1400px] grid-cols-1 items-start gap-3 px-4 py-4 md:grid-cols-[320px_minmax(0,1fr)]">
      <section aria-label="Conversations" className={`card flex flex-col overflow-hidden ${open ? "max-md:hidden" : ""}`}>
        <div className="flex flex-col gap-2 border-b border-misty p-3">
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-xl font-extrabold">Messages</h1>
            <button type="button" className="btn btn-primary" onClick={() => setStarting(!starting)} aria-expanded={starting}>{starting ? "Cancel" : "+ New message"}</button>
          </div>
          {lines.length > 1 && (
            <select aria-label="Whose texts" className="input text-sm font-semibold" value={line.userId} onChange={(e) => router.push(href(null, e.target.value))}>
              {lines.map((l) => <option key={l.userId} value={l.userId}>{l.userId === line.userId ? "" : "View "}{l.name.split(" ")[0]}&apos;s texts · {formatPhone(l.number)}</option>)}
            </select>
          )}
          {starting && <NewMessage groupsOn={groupsOn} blocked={composer.blocked} onPick={(n) => { setStarting(false); router.push(href(n)); }} />}
          <span className="flex items-center gap-2">
            <span className="inline-flex overflow-hidden rounded-full border border-misty text-sm" role="group" aria-label="Show">
              {([["all", "All"], ["unread", `Unread${unreadThreads ? ` (${unreadThreads})` : ""}`]] as const).map(([k, l]) => (
                <button key={k} type="button" aria-pressed={tab === k} onClick={() => setTab(k)} className={`px-3 py-1 font-semibold ${tab === k ? "bg-charcoal text-white" : "hover:bg-sunken"}`}>{l}</button>
              ))}
            </span>
            <input className="input min-w-0 flex-1" type="search" aria-label="Search conversations" placeholder="Search name or number" value={q} onChange={(e) => setQ(e.target.value)} />
          </span>
        </div>
        {shown.length ? (
          <ul className="max-h-[calc(100vh-220px)] overflow-y-auto">
            {shown.map((t) => (
              <li key={t.number}>
                <Link href={href(t.number)} aria-current={t.number === open ? "true" : undefined}
                  className={`grid grid-cols-[minmax(0,1fr)_auto] gap-x-2 border-t border-misty px-3 py-2.5 first:border-0 hover:bg-sunken ${t.number === open ? "bg-accent-soft" : ""}`}>
                  <span className={`truncate ${t.unread ? "font-extrabold" : "font-semibold"}`}>{t.group && <span className="mr-1 rounded bg-sunken px-1 text-[11px] font-bold uppercase muted">Group</span>}{t.name}</span>
                  <span className="text-xs muted">{when(t.at)}</span>
                  <span className={`truncate text-sm ${t.unread ? "text-charcoal" : "muted"} ${t.lastKind === "missed_call" ? "text-bad" : ""}`}>{t.lastDir === "out" ? "You: " : ""}{t.last}</span>
                  {t.unread > 0 ? <span className="self-center justify-self-end rounded-full bg-coral px-1.5 text-xs font-bold text-white">{t.unread}</span> : <span />}
                </Link>
              </li>
            ))}
          </ul>
        ) : <p className="p-4 text-sm muted">{tab === "unread" && !q.trim() ? "All caught up. No unread texts or missed calls." : threads.length ? "No conversations match." : `No texts yet on ${formatPhone(line.number)}. Click + New message to text a contact.`}</p>}
      </section>

      <section aria-label="Conversation" className={`card flex min-h-[60vh] flex-col ${open ? "" : "max-md:hidden"}`}>
        {!open ? <p className="m-auto p-6 text-sm muted">Pick a conversation.</p> : (
          <>
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-misty p-3">
              <div className="min-w-0">
                <Link href={href(null)} className="text-sm muted md:hidden">‹ Messages</Link>
                {group ? (
                  <>
                    <b className="block text-lg font-extrabold">Group text</b>
                    <span className="flex flex-wrap gap-x-2 text-sm">{group.members.map((m) => m.personId ? <Link key={m.digits} href={`/people/${m.personId}`} className="link">{m.name}</Link> : <span key={m.digits}>{m.name}</span>)}</span>
                  </>
                ) : person ? <Link href={`/people/${person.id}`} className="block truncate text-lg font-extrabold hover:underline">{person.name} ›</Link> : <b className="block text-lg font-extrabold">{formatPhone(open)}</b>}
                {person && <span className="text-xs muted">{formatPhone(open)}</span>}
              </div>
              <span className="flex flex-wrap gap-2">
                {!group && <a className="btn" href={`tel:+1${open}`}>Call</a>}
                <DeleteThread ourNumber={line.number} number={open} onDone={() => router.push(href(null))} />
              </span>
            </header>
            {!person && !group && <Unknown number={open} onDone={() => router.refresh()} />}
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
                        {m.from && <span className="px-1 text-[11px] font-semibold muted">{m.from}</span>}
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
              {group ? <GroupComposer key={open} sid={open} blocked={composer.blocked ?? (groupsOn ? null : "Group texting is off (Admin → Integrations), so HQ can't reply to the group.")} from={composer.from} onSent={() => router.refresh()} />
                : <TextComposer key={open} personId={person?.id ?? null} phones={[open]} compact {...composer} />}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

/**
 * + New message: find a contact and pick their number. Pick more than one number (group texting on) to start a
 * group text: everyone gets it from your number and replies stay in one conversation.
 */
function NewMessage({ onPick, groupsOn, blocked }: { onPick: (key: string) => void; groupsOn: boolean; blocked: string | null }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<{ id: string; name: string; phones: string[] }[]>([]);
  const [picked, setPicked] = useState<{ number: string; name: string }[]>([]);
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  useEffect(() => {
    if (q.trim().length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => { fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal }).then((r) => r.json()).then((d) => setHits(d.results ?? [])).catch(() => {}); }, 200);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [q]);
  const pick = (number: string, name: string) => {
    if (!groupsOn) { onPick(number); return; }
    if (!picked.some((p) => p.number === number) && picked.length < MAX_GROUP - 1) setPicked([...picked, { number, name }]);
    setQ(""); setHits([]);
  };
  const send = () => start(async () => {
    setError("");
    const r = await startGroup({ numbers: picked.map((p) => p.number), body });
    if (!r.ok) { setError(r.error); return; }
    onPick(r.data!.sid);
  });
  return (
    <div className="flex flex-col gap-1 rounded-md bg-sunken p-2">
      {picked.length > 0 && (
        <span className="flex flex-wrap gap-1">
          {picked.map((p) => <span key={p.number} className="inline-flex items-center gap-1 rounded-full border border-misty bg-white px-2 py-0.5 text-xs font-semibold">{p.name} · {formatPhone(p.number)}
            <button type="button" aria-label={`Remove ${p.name}`} className="muted hover:text-bad" onClick={() => setPicked(picked.filter((x) => x.number !== p.number))}>×</button></span>)}
        </span>
      )}
      <input autoFocus className="input" aria-label="Text who?" placeholder={picked.length ? "Add someone else (group text)" : "Text who? Type a name or number"} value={q} onChange={(e) => setQ(e.target.value)} />
      {q.trim().length >= 2 && (hits.length ? hits.map((h) => (
        <div key={h.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 px-1 py-1 text-sm">
          <b>{h.name}</b>
          {h.phones.length ? h.phones.map((n) => <button key={n} type="button" className="rounded-full border border-misty bg-white px-2 py-0.5 text-xs font-semibold hover:border-accent" onClick={() => pick(n, h.name)}>{formatPhone(n)}</button>)
            : <span className="text-xs muted">No phone number on file</span>}
        </div>
      )) : <p className="px-1 text-sm muted">No contacts match.</p>)}
      {picked.length === 1 && <span className="flex flex-wrap items-center gap-2 text-sm"><button type="button" className="btn btn-primary" onClick={() => onPick(picked[0].number)}>Text {picked[0].name}</button><span className="muted">or add more people for a group text</span></span>}
      {picked.length >= 2 && (blocked ? <p className="text-sm muted">{blocked}</p> : (
        <div className="flex flex-col gap-1">
          <textarea className="input min-h-20 font-normal" aria-label="Group text message" placeholder="Write the group text" maxLength={1600} value={body} onChange={(e) => setBody(e.target.value)} />
          <span className="flex flex-wrap items-center justify-between gap-2 text-xs muted">Everyone gets it from your number; replies show here for the whole group.
            <button type="button" className="btn btn-primary" disabled={pending || !body.trim()} onClick={send}>{pending ? "Sending…" : `Send to ${picked.length} people`}</button>
          </span>
          {error && <p role="alert" className="text-sm text-bad">{error}</p>}
        </div>
      ))}
    </div>
  );
}

/** Reply in a group text: everyone in the group gets it from your number. */
function GroupComposer({ sid, blocked, from, onSent }: { sid: string; blocked: string | null; from: string | null; onSent: () => void }) {
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  if (blocked) return <p className="rounded-md bg-sunken px-3 py-2 text-sm muted">{blocked}</p>;
  const send = () => start(async () => {
    setError("");
    const r = await sendGroup({ sid, body });
    if (!r.ok) { setError(r.error); return; }
    setBody(""); onSent();
  });
  return (
    <div className="flex flex-col gap-2">
      <textarea aria-label="Group text message" placeholder="Reply to the group" className="input min-h-20 font-normal" maxLength={1600} value={body}
        onChange={(e) => setBody(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && body.trim() && !pending) { e.preventDefault(); send(); } }} />
      <span className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs muted">To everyone in the group, from your number {from ? formatPhone(from) : ""}</span>
        <button type="button" className="btn btn-primary" disabled={pending || !body.trim()} onClick={send}>{pending ? "Sending…" : "Send to group"}</button>
      </span>
      {error && <p role="alert" className="text-sm text-bad">{error}</p>}
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
