"use client";

import { CallLink } from "@/components/CallCenter";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { useDropdown } from "@/components/useDropdown";
import { TextComposer } from "@/components/TextComposer";
import { EmojiButton } from "@/components/EmojiButton";
import { TextPhotoButton, TextPhotoPreviews } from "@/components/TextPhotos";
import { PHOTO_ONLY } from "@/lib/textMedia";
import { formatPhone } from "@/lib/normalize";
import { sendProblem } from "@/lib/texting";
import type { Bubble, GroupInfo, Thread, ThreadPerson } from "@/server/texting";
import { MAX_GROUP } from "@/lib/groupText";
import type { ScheduledRow } from "../people/[id]/FileTabs";
import { SEND_REACTIONS } from "@/lib/reactions";
import { ScheduleText } from "@/components/ScheduleText";
import { TemplateSearch, useSlashTemplates } from "@/components/TemplateSearch";
import { addPersonFromNumber, archiveThread, cancelScheduledText, deleteThread, fillTextTemplate, reactToText, linkNumber, markRead, sendGroup, startGroup } from "./actions";

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
export function MessagesApp({ lines, line, threads, open, person, conversation, composer, group, groupsOn, scheduled, threadPeople }: {
  lines: Line[]; line: Line | null; threads: Thread[]; open: string | null; person: { id: string; name: string } | null; conversation: Bubble[]; composer: Composer;
  group: GroupInfo | null; groupsOn: boolean; scheduled: ScheduledRow[]; threadPeople: ThreadPerson[];
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"all" | "unread" | "archived" | "scheduled">("all");
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
  const unreadThreads = threads.filter((t) => t.unread > 0 && !t.archived).length;
  const archivedThreads = threads.filter((t) => t.archived).length;
  // All = the inbox (archived conversations are under Archived until someone texts again; owner request 2026-10-28).
  const shown = threads.filter((t) => t.number === open || (tab === "archived" ? t.archived : !t.archived && (tab === "all" || t.unread > 0))).filter((t) => !q.trim() || t.name.toLowerCase().includes(q.trim().toLowerCase()) || t.number.includes(q.replace(/\D/g, "") || "~"));
  return (
    <div className={`mx-auto grid max-w-[1600px] grid-cols-1 gap-3 px-4 py-4 md:h-[calc(100dvh-80px)] md:grid-cols-[190px_320px_minmax(0,1fr)] ${open && threadPeople.length ? "xl:grid-cols-[190px_300px_minmax(0,1fr)_260px]" : ""}`}>
      {/* Folders on the left like FUB (owner/assistant request 2026-10-28): Inbox, Unread, Scheduled, Archived. */}
      <nav aria-label="Folders" className={`card flex flex-col gap-1 p-3 ${open ? "max-md:hidden" : ""}`}>
        <div className="mb-1 flex items-center justify-between gap-2">
          <h1 className="text-xl font-extrabold">Messages</h1>
        </div>
        <button type="button" className={`btn mb-2 ${starting ? "" : "btn-primary"}`} onClick={() => setStarting(!starting)} aria-expanded={starting}>{starting ? "Cancel" : "+ New message"}</button>
        {lines.length > 1 && (
          <select aria-label="Whose texts" className="input mb-2 text-sm font-semibold" value={line.userId} onChange={(e) => router.push(href(null, e.target.value))}>
            {lines.map((l) => <option key={l.userId} value={l.userId}>{l.userId === line.userId ? "" : "View "}{l.name.split(" ")[0]}&apos;s texts</option>)}
          </select>
        )}
        {([["all", "Inbox", threads.filter((t) => !t.archived).length], ["unread", "Unread", unreadThreads], ["scheduled", "Scheduled", scheduled.filter((x) => x.status !== "failed").length], ["archived", "Archived", archivedThreads]] as const).map(([k, l, n]) => (
          <button key={k} type="button" aria-pressed={tab === k} onClick={() => setTab(k)}
            className={`flex items-center justify-between rounded-md px-2.5 py-1.5 text-left text-sm font-semibold ${tab === k ? "bg-accent-soft text-accent" : "hover:bg-sunken"}`}>
            {l}{n > 0 && <span className={`text-xs ${k === "unread" ? "rounded-full bg-coral px-1.5 font-bold text-white" : "muted"}`}>{n}</span>}
          </button>
        ))}
      </nav>
      <section aria-label="Conversations" className={`card flex min-h-0 flex-col overflow-hidden ${open ? "max-md:hidden" : ""}`}>
        <div className="flex flex-col gap-2 border-b border-misty p-3">
          {starting && <NewMessage templates={composer.templates} groupsOn={groupsOn} blocked={composer.blocked} onPick={(n) => { setStarting(false); router.push(href(n)); }} />}
          <input className="input w-full" type="search" aria-label="Search conversations" placeholder="Search name or number" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {tab === "scheduled" ? <ScheduledList rows={scheduled} q={q} onChanged={() => router.refresh()} /> : shown.length ? (
          <ul className="min-h-0 flex-1 overflow-y-auto max-md:max-h-[70vh]">
            {shown.map((t) => (
              <li key={t.number}>
                <Link href={href(t.number)} aria-current={t.number === open ? "true" : undefined}
                  className={`grid grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-x-2.5 border-t border-misty px-3 py-2.5 first:border-0 hover:bg-sunken ${t.number === open ? "bg-accent-soft" : ""}`}>
                  <Avatar name={t.name} group={!!t.group} missed={t.lastKind === "missed_call"} />
                  <span className="min-w-0">
                    <span className={`block truncate ${t.unread ? "font-extrabold" : "font-semibold"}`}>{t.name}</span>
                    <span className={`block truncate text-sm ${t.lastKind === "missed_call" ? "text-bad" : t.unread ? "text-charcoal" : "muted"}`}>{t.lastDir === "out" ? "You: " : ""}{t.last}</span>
                  </span>
                  <span className="flex flex-col items-end gap-1 self-start"><span className="text-xs muted">{when(t.at)}</span>{t.unread > 0 && <span className="rounded-full bg-coral px-1.5 text-xs font-bold text-white">{t.unread}</span>}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : <p className="p-4 text-sm muted">{tab === "archived" && !q.trim() ? "Nothing archived. Click Archive on a conversation when you're done with it." : tab === "unread" && !q.trim() ? "All caught up. No unread texts or missed calls." : threads.length ? "No conversations match." : `No texts yet on ${formatPhone(line.number)}. Click + New message to text a contact.`}</p>}
      </section>

      <section aria-label="Conversation" className={`card flex min-h-[60vh] flex-col overflow-hidden md:min-h-0 ${open ? "" : "max-md:hidden"}`}>
        {!open ? <p className="m-auto p-6 text-sm muted">Pick a conversation.</p> : (
          <>
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-misty px-3 py-2.5">
              <div className="flex min-w-0 items-center gap-2.5">
                {!group && <Avatar name={person?.name ?? formatPhone(open)} />}
                <div className="min-w-0">
                <Link href={href(null)} className="text-sm muted md:hidden">‹ Messages</Link>
                {group ? (
                  <>
                    <b className="block text-lg font-extrabold">Group text</b>
                    <span className="flex flex-wrap gap-x-2 text-sm">{group.members.map((m) => m.personId ? <Link key={m.digits} href={`/people/${m.personId}`} className="link">{m.name}</Link> : <span key={m.digits}>{m.name}</span>)}</span>
                  </>
                ) : person ? <Link href={`/people/${person.id}`} className="block truncate text-lg font-extrabold hover:underline">{person.name} ›</Link> : <b className="block text-lg font-extrabold">{formatPhone(open)}</b>}
                </div>
              </div>
              <span className="flex flex-wrap gap-2">
                {!group && <CallLink className="btn" number={`+1${open}`} name={person?.name}>Call</CallLink>}
                <ArchiveThread ourNumber={line.number} number={open} archived={!!current?.archived} onDone={(a) => router.push(a ? href(null) : href(open))} />
                <MoreMenu><DeleteThread ourNumber={line.number} number={open} onDone={() => router.push(href(null))} /></MoreMenu>
              </span>
            </header>
            {!person && !group && <Unknown number={open} onDone={() => router.refresh()} />}
            <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto p-3 max-md:max-h-[60vh]">
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
                        {!!m.photos?.length && (
                          <span className={`flex flex-wrap gap-1 ${m.direction === "out" ? "justify-end" : ""}`}>
                            {m.photos.map((src) => (
                              <a key={src} href={src} target="_blank" rel="noreferrer">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={src} alt="Photo" loading="lazy" className="max-h-60 max-w-[240px] rounded-2xl border border-misty object-cover" />
                              </a>
                            ))}
                          </span>
                        )}
                        {!(m.photos?.length && m.body === PHOTO_ONLY) && <p className={`whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm ${m.direction === "out" ? "bg-accent text-white" : "bg-sunken"}`}>{m.body}</p>}
                        {!!m.reactions?.length && <span className="-mt-2 rounded-full border border-misty bg-white px-1.5 text-sm shadow-sm" aria-label={`Reactions: ${m.reactions.join(" ")}`}>{[...new Set(m.reactions)].join("")}{m.reactions.length > new Set(m.reactions).size ? ` ${m.reactions.length}` : ""}</span>}
                        <span className={`flex items-center gap-1 px-1 text-[11px] muted ${m.direction === "out" ? "flex-row-reverse" : ""}`}>
                          {!composer.blocked && m.body !== PHOTO_ONLY && <ReactButton id={m.id} out={m.direction === "out"} mine={m.mine ?? []} onDone={() => router.refresh()} />}
                          <span>{clock(m.at)}{m.direction === "out" ? ` · ${m.by ? `${m.by} · ` : ""}${STATUS[m.status] ?? m.status}` : ""}</span>
                        </span>
                        {m.error && ["failed", "undelivered"].includes(m.status) && <span className="px-1 text-xs text-bad">{sendProblem(m.error)}</span>}
                      </div>
                    )}
                  </div>
                );
              })}
              <div ref={end} />
            </div>
            <div className="border-t border-misty bg-white px-3 py-2.5">
              {group ? <GroupComposer key={open} sid={open} members={group.members.map((m) => m.digits)} templates={composer.templates} blocked={composer.blocked ?? (groupsOn ? null : "Group texting is off (Admin → Integrations), so HQ can't reply to the group.")} from={composer.from} onSent={() => router.refresh()} />
                : <TextComposer key={open} personId={person?.id ?? null} phones={[open]} compact {...composer} />}
            </div>
          </>
        )}
      </section>
      {open && threadPeople.length > 0 && <PeoplePanel people={threadPeople} />}
    </div>
  );
}

/**
 * + New message: find a contact and pick their number. Pick more than one number (group texting on) to start a
 * group text: everyone gets it from your number and replies stay in one conversation.
 */
function NewMessage({ onPick, groupsOn, blocked, templates }: { onPick: (key: string) => void; groupsOn: boolean; blocked: string | null; templates: Template[] }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<{ id: string; name: string; phones: string[] }[]>([]);
  const [picked, setPicked] = useState<{ number: string; name: string }[]>([]);
  const [note, setNote] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const box = useRef<HTMLTextAreaElement>(null);
  const tpl = useGroupTemplates({ templates, box, body, setBody, start, setError });
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
          {h.phones.length ? h.phones.map((n) => <button key={n} type="button" className="rounded-full border border-misty bg-white px-2 py-1 text-sm font-semibold hover:border-accent" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(n, h.name)}>{formatPhone(n)}</button>)
            : <span className="text-xs muted">No phone number on file</span>}
        </div>
      )) : <p className="px-1 text-sm muted">No contacts match.</p>)}
      {note && <p role="status" className="text-sm text-accent">{note}</p>}
      {picked.length === 1 && <span className="flex flex-wrap items-center gap-2 text-sm"><button type="button" className="btn btn-primary" onClick={() => onPick(picked[0].number)}>Text {picked[0].name}</button><span className="muted">or add more people for a group text</span></span>}
      {picked.length >= 2 && (blocked ? <p className="text-sm muted">{blocked}</p> : (
        <div className="flex flex-col gap-1">
          {tpl.picker}
          <div className="relative">
            <textarea ref={box} className="input min-h-20 w-full font-normal" aria-label="Group text message" placeholder="Write the group text, or type / and a template name" maxLength={1600} value={body}
              onChange={(e) => { setBody(e.target.value); tpl.slash.track(); }} onKeyDown={tpl.slash.onKeyDown} onKeyUp={tpl.slash.track} onClick={tpl.slash.track} />
            {tpl.slash.menu}
          </div>
          {tpl.note}
          <span className="flex flex-wrap items-center justify-between gap-2 text-xs muted">Everyone gets it from your number; replies show here for the whole group.
            <button type="button" className="btn btn-primary" disabled={pending || !body.trim()} onClick={send}>{pending ? "Sending…" : `Send to ${picked.length} people`}</button>
            <ScheduleText numbers={picked.map((p) => p.number)} body={body} disabled={pending || !body.trim()} onScheduled={(when) => { setError(""); setBody(""); setPicked([]); setNote(`Group text scheduled for ${when}.`); }} />
          </span>
          {error && <p role="alert" className="text-sm text-bad">{error}</p>}
        </div>
      ))}
    </div>
  );
}

type Template = { id: string; name: string };

/**
 * Text templates in group texts (owner request 2026-10-28): the Template box or "/name". Your own details fill in;
 * client details (like their first name) can't for a whole group, so those are listed to type in.
 */
function useGroupTemplates({ templates, box, body, setBody, start, setError }: {
  templates: Template[]; box: React.RefObject<HTMLTextAreaElement | null>; body: string; setBody: (s: string) => void;
  start: (fn: () => Promise<void>) => void; setError: (s: string) => void;
}) {
  const [templateId, setTemplateId] = useState("");
  const [missing, setMissing] = useState<string[]>([]);
  const slash = useSlashTemplates({ box, value: body, templates, onChoose: (tid, a, b) => start(async () => {
    const r = await fillTextTemplate({ personId: null, templateId: tid });
    if (!r.ok) { setError(r.error); return; }
    setBody(body.slice(0, a) + r.data!.body + body.slice(b)); setTemplateId(tid); setMissing(r.data!.missing);
    const at = a + r.data!.body.length;
    requestAnimationFrame(() => { box.current?.focus(); box.current?.setSelectionRange(at, at); });
  }) });
  const pick = (tid: string) => {
    setTemplateId(tid); setError("");
    if (!tid) { setMissing([]); return; }
    start(async () => {
      const r = await fillTextTemplate({ personId: null, templateId: tid });
      if (!r.ok) { setError(r.error); return; }
      setBody(r.data!.body); setMissing(r.data!.missing);
    });
  };
  const picker = templates.length ? <label className="label">Template<TemplateSearch templates={templates} value={templateId} onPick={pick} noneLabel="No text templates yet" /></label> : null;
  const smallPicker = templates.length ? <span className="w-48"><TemplateSearch templates={templates} value={templateId} onPick={pick} emptyLabel="Template" noneLabel="No text templates yet" /></span> : null;
  const note = missing.length ? <p className="text-xs text-bad">Fill in by hand before sending: {missing.join(", ")}.</p> : null;
  return { slash, picker, smallPicker, note };
}

/** Reply in a group text: everyone in the group gets it from your number. */
function GroupComposer({ sid, members, blocked, from, onSent, templates }: { sid: string; members: string[]; blocked: string | null; from: string | null; onSent: () => void; templates: Template[] }) {
  const [notice, setNotice] = useState("");
  const [body, setBody] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const box = useRef<HTMLTextAreaElement>(null);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const tpl = useGroupTemplates({ templates, box, body, setBody, start, setError });
  if (blocked) return <p className="rounded-md bg-sunken px-3 py-2 text-sm muted">{blocked}</p>;
  const send = () => start(async () => {
    setError("");
    const r = await sendGroup({ sid, body, media: photos });
    if (!r.ok) { setError(r.error); return; }
    setBody(""); setPhotos([]); onSent();
  });
  return (
    // Same one-line box as one-to-one texts (owner request 2026-10-28).
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-2">
        <div className="relative min-w-[240px] flex-1">
          <textarea ref={box} aria-label="Group text message" placeholder="Reply to the group… (type / for a template)" rows={1} className="input max-h-40 min-h-[40px] w-full resize-none py-2 font-normal" maxLength={1600} value={body}
            onChange={(e) => { setBody(e.target.value); tpl.slash.track(); e.target.style.height = "auto"; e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`; }} onKeyUp={tpl.slash.track} onClick={tpl.slash.track}
            onKeyDown={(e) => { tpl.slash.onKeyDown(e); if (!e.defaultPrevented && e.key === "Enter" && (e.metaKey || e.ctrlKey) && (body.trim() || photos.length) && !pending) { e.preventDefault(); send(); } }} />
          {tpl.slash.menu}
        </div>
        <span className="flex flex-wrap items-center justify-end gap-2">
          {tpl.smallPicker}
          <TextPhotoButton photos={photos} onChange={setPhotos} disabled={pending} /><EmojiButton box={box} value={body} onChange={setBody} />
          <ScheduleText numbers={members} body={body} media={photos} disabled={pending || !body.trim() || members.length < 2} onScheduled={(when) => { setNotice(`Scheduled for ${when}.`); setBody(""); setPhotos([]); onSent(); }} />
          <button type="button" className="btn btn-primary" disabled={pending || (!body.trim() && !photos.length)} onClick={send}>{pending ? "Sending…" : "Send"}</button>
        </span>
      </div>
      {tpl.note}
      <TextPhotoPreviews photos={photos} onChange={setPhotos} />
      <span className="text-xs muted">To everyone in the group, from your number {from ? formatPhone(from) : ""}</span>
      {notice && <p role="status" className="text-sm text-accent">{notice}</p>}
      {error && <p role="alert" className="text-sm text-bad">{error}</p>}
    </div>
  );
}

/** Heart, thumbs up and the other reactions on a message; the one you already sent is highlighted and clicking it again removes it. */
function ReactButton({ id, out, mine, onDone }: { id: string; out: boolean; mine: string[]; onDone: () => void }) {
  const { open, setOpen, ref } = useDropdown<HTMLSpanElement>();
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  return (
    <span ref={ref} className="relative">
      <button type="button" aria-label="React" aria-expanded={open} disabled={pending} onClick={() => setOpen(!open)} className="rounded px-1 text-sm leading-none hover:bg-sunken">{pending ? "…" : "☺︎"}</button>
      {open && (
        <span role="group" aria-label="Reactions" className={`absolute top-1/2 z-20 flex -translate-y-1/2 gap-0.5 ${out ? "right-full mr-1" : "left-full ml-1"} rounded-full border border-misty bg-white p-1 shadow-lg`}>
          {SEND_REACTIONS.map((k) => (
            <button key={k.emoji} type="button" title={mine.includes(k.emoji) ? `Remove ${k.noun}` : k.verb} aria-pressed={mine.includes(k.emoji)}
              className={`grid h-8 w-8 place-items-center rounded-full text-lg hover:bg-sunken ${mine.includes(k.emoji) ? "bg-accent-soft" : ""}`}
              onClick={() => { setOpen(false); setError(""); start(async () => { const r = await reactToText({ messageId: id, emoji: k.emoji }); if (r.ok) onDone(); else setError(r.error); }); }}>{k.emoji}</button>
          ))}
        </span>
      )}
      {error && <span role="alert" className="absolute top-full z-20 mt-1 w-56 rounded bg-white p-1 text-xs text-bad shadow">{error}</span>}
    </span>
  );
}

/** Messages → Scheduled: texts set to go out from this number, soonest first, with Cancel (owner request 2026-10-28). */
function ScheduledList({ rows, q, onChanged }: { rows: ScheduledRow[]; q: string; onChanged: () => void }) {
  const [error, setError] = useState("");
  const [busy, start] = useTransition();
  const shown = rows.filter((x) => !q.trim() || `${x.to} ${x.body}`.toLowerCase().includes(q.trim().toLowerCase()));
  if (!shown.length) return <p className="p-4 text-sm muted">{rows.length ? "No scheduled texts match." : "Nothing scheduled. Use Schedule next to Send to send a text later."}</p>;
  return (
    <ul className="min-h-0 flex-1 overflow-y-auto">
      {shown.map((x) => (
        <li key={x.id} className="border-t border-misty px-3 py-2.5 text-sm first:border-0">
          <span className="flex items-baseline justify-between gap-2">
            {x.personId ? <Link href={`/people/${x.personId}`} className="truncate font-semibold hover:underline">{x.to}</Link> : <b className="truncate">{x.to}</b>}
            <span className={`flex-none text-xs ${x.status === "failed" ? "font-semibold text-bad" : "muted"}`}>{x.status === "failed" ? "Not sent" : x.when}</span>
          </span>
          <span className="line-clamp-2 muted">{x.body}</span>
          {x.error && <span className="block text-xs text-bad">{x.when}: {x.error}</span>}
          {x.status === "pending" && x.mine && <button type="button" className="mt-0.5 text-xs font-semibold text-bad hover:underline" disabled={busy}
            onClick={() => start(async () => { setError(""); const r = await cancelScheduledText(x.id); if (!r.ok) setError(r.error); else onChanged(); })}>Cancel</button>}
        </li>
      ))}
      {error && <li role="alert" className="px-3 py-2 text-sm text-bad">{error}</li>}
    </ul>
  );
}

/** Who's in this conversation (owner request 2026-10-28): each contact with stage, assigned to and open deals. Wide screens only. */
function PeoplePanel({ people }: { people: ThreadPerson[] }) {
  return (
    <aside aria-label="People in this conversation" className="card hidden min-h-0 flex-col gap-3 overflow-y-auto p-3 xl:flex">
      <h2 className="text-xs font-semibold uppercase tracking-wider muted">{people.length > 1 ? `In this text · ${people.length}` : "Contact"}</h2>
      {people.map((p) => (
        <section key={p.id} className="border-t border-misty pt-3 first-of-type:border-0 first-of-type:pt-0">
          <div className="flex items-center gap-2"><Avatar name={p.name} /><Link href={`/people/${p.id}`} className="min-w-0 font-bold leading-tight hover:underline">{p.name} ›</Link></div>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
            <dt className="muted">Stage</dt><dd>{p.stage ?? <span className="muted">Not set</span>}</dd>
            <dt className="muted">Assigned</dt><dd>{p.assignedTo?.split(" ")[0] ?? <span className="muted">Not set</span>}</dd>
          </dl>
          {p.deals.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1.5">
              {p.deals.map((d, i) => (
                <li key={i} className="rounded-md border border-misty bg-paper px-2 py-1.5 text-sm">
                  <span className={`mr-1 rounded px-1 text-[10px] font-bold uppercase ${d.kind === "Buyer" ? "bg-accent-soft text-accent" : "bg-[#f6e3d9] text-[#9a4f2e]"}`}>{d.kind}</span><b>{d.line}</b>
                  {d.contract && <span className="block text-xs muted">{d.contract}</span>}
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </aside>
  );
}

/** Initials in a circle; a group gets 👥, a missed call a red "!". */
function Avatar({ name, group, missed }: { name: string; group?: boolean; missed?: boolean }) {
  const ini = name.split(/\s+/).filter((w) => /[A-Za-z]/.test(w[0] ?? "")).slice(0, 2).map((w) => w[0].toUpperCase()).join("") || "#";
  return <span aria-hidden="true" className={`grid h-9 w-9 flex-none place-items-center rounded-full text-xs font-extrabold ${missed ? "bg-[#f9e1de] text-bad" : group ? "bg-sunken text-muted" : "bg-accent-soft text-accent"}`}>{missed ? "!" : group ? "👥" : ini}</span>;
}

/** "⋯" for rarely used actions (Delete). */
function MoreMenu({ children }: { children: React.ReactNode }) {
  const { open, setOpen, ref } = useDropdown<HTMLSpanElement>();
  return (
    <span ref={ref} className="relative">
      <button type="button" className="btn px-3" aria-label="More" aria-expanded={open} onClick={() => setOpen(!open)}>⋯</button>
      {open && <span className="absolute right-0 top-full z-20 mt-1 flex w-52 flex-col rounded-lg border border-misty bg-white p-1.5 shadow-xl [&>button]:w-full">{children}</span>}
    </span>
  );
}

/** Archive, like email: done with it for now; a new text brings it back to the inbox. */
function ArchiveThread({ ourNumber, number, archived, onDone }: { ourNumber: string; number: string; archived: boolean; onDone: (archived: boolean) => void }) {
  const [pending, start] = useTransition();
  return (
    <button type="button" className="btn" disabled={pending} onClick={() => start(async () => { const r = await archiveThread({ ourNumber, number, archived: !archived }); if (r.ok) onDone(!archived); })}>
      {archived ? "Move to inbox" : "Archive"}
    </button>
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
