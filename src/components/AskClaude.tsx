"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { Modal } from "@/components/Modal";
import { TimeSelect } from "@/components/TimeSelect";
import { askAssistant } from "@/app/(app)/assistant/actions";
import { createTask } from "@/app/(app)/tasks/actions";
import { addTimelineEntry } from "@/app/(app)/people/actions";
import type { Proposal } from "@/lib/assistant";

// Ask Claude (SPEC.md §9.6): talk or type → proposed tasks and notes → review → Save.
// Talking uses the browser's own speech-to-text (Chrome, Edge, Safari); otherwise type, or use
// the phone keyboard's mic.

type Recognition = { lang: string; continuous: boolean; interimResults: boolean; start: () => void; stop: () => void; onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null; onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null };
const speechApi = (): (new () => Recognition) | null => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};
const clock = (t: string) => { const [h, m] = t.split(":").map(Number); return `${h % 12 || 12}:${String(m).padStart(2, "0")}${h < 12 ? "am" : "pm"}`; };
const NOTE_LABEL = { note: "Note", call: "Logged call", text: "Logged text" } as const;

type Card = Proposal & { key: number; on: boolean; status?: "saved" | string };

function Mic({ className = "h-4 w-4" }: { className?: string }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10a7 7 0 0 0 14 0M12 17v5M8 22h8" /></svg>;
}

export function AskClaude({ connected }: { connected: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="flex items-center gap-1.5 rounded-md px-2 py-1.5 font-semibold text-white hover:bg-white/10" title="Ask Claude: say or type tasks and notes">
        <Mic /><span className="hidden lg:inline">Ask Claude</span><span className="sr-only lg:hidden">Ask Claude</span>
      </button>
      {/* Rendered at page level so it doesn't pick up the header's colors. */}
      {open && createPortal(<AskDialog connected={connected} onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}

function AskDialog({ connected, onClose }: { connected: boolean; onClose: () => void }) {
  const router = useRouter();
  const path = usePathname();
  const personId = path.match(/^\/people\/([^/]+)$/)?.[1] ?? null;
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [canTalk, setCanTalk] = useState(false);
  const [reply, setReply] = useState("");
  const [cards, setCards] = useState<Card[] | null>(null);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const rec = useRef<Recognition | null>(null);
  const base = useRef("");

  const stopTalking = useCallback(() => { rec.current?.stop(); }, []);
  const talk = useCallback(() => {
    const Api = speechApi();
    if (!Api) return;
    const r = new Api();
    r.lang = "en-US"; r.continuous = true; r.interimResults = true;
    base.current = text ? `${text.trimEnd()} ` : "";
    r.onresult = (e) => {
      let finals = "", interim = "";
      for (let i = 0; i < e.results.length; i++) (e.results[i].isFinal ? (finals += e.results[i][0].transcript) : (interim += e.results[i][0].transcript));
      setText(base.current + finals + interim);
    };
    r.onerror = (e) => { if (e.error === "not-allowed" || e.error === "service-not-allowed") setError("The browser blocked the microphone. Allow it in the address bar, or type instead."); };
    r.onend = () => { setListening(false); rec.current = null; };
    rec.current = r;
    try { r.start(); setListening(true); setError(""); } catch { setListening(false); }
  }, [text]);

  // Start listening as soon as the window opens (the click counts as permission to ask for the mic).
  useEffect(() => {
    const ok = !!speechApi();
    const t = setTimeout(() => { setCanTalk(ok); if (ok && connected) talk(); }, 0);
    return () => { clearTimeout(t); rec.current?.stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ask = () => {
    stopTalking();
    if (!text.trim()) { setError("Say or type something first."); return; }
    start(async () => {
      setError("");
      const r = await askAssistant({ text, personId });
      if (!r.ok) { setError(r.error); return; }
      setReply(r.data!.reply);
      setCards(r.data!.proposals.map((p, key) => ({ ...p, key, on: true })));
    });
  };

  const edit = (key: number, patch: Partial<Card>) => setCards((cs) => cs!.map((c) => (c.key === key ? ({ ...c, ...patch } as Card) : c)));
  const toSave = cards?.filter((c) => c.on && c.status !== "saved") ?? [];

  const save = () => start(async () => {
    setError("");
    let failed = 0;
    for (const c of toSave) {
      const r = c.type === "task"
        ? await createTask({ title: c.title, kind: c.kind, personId: c.personId, assigneeId: c.assigneeId, due: c.due, time: c.time ?? "" })
        : await addTimelineEntry({ personId: c.personId, kind: c.kind, body: c.body });
      if (!r.ok) failed++;
      edit(c.key, { status: r.ok ? "saved" : r.error });
    }
    router.refresh();
    if (!failed) onClose();
  });

  const startOver = () => { setCards(null); setReply(""); setText(""); setError(""); };

  if (!connected) {
    return (
      <Modal title="Ask Claude" onClose={onClose}>
        <p className="text-sm">Ask Claude isn&apos;t connected yet. Luke adds the <b>ANTHROPIC_API_KEY</b> variable in Railway; steps are in Admin → Integrations.</p>
        <div className="mt-4 flex justify-end"><button type="button" className="btn" onClick={onClose}>Close</button></div>
      </Modal>
    );
  }

  return (
    <Modal title="Ask Claude" onClose={onClose} wide>
      {!cards ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm muted">
            Say what to add, like <i>&ldquo;Remind me to call the Ortizes Tuesday at 2&rdquo;</i> or <i>&ldquo;Note on Sam: they want a bigger yard. @Alyssa send them listings.&rdquo;</i>
            {personId && " You're on a contact, so “them” means this person."} You&apos;ll check everything before it saves.
          </p>
          <textarea className="input min-h-28" aria-label="What should Claude add?" value={text} placeholder={listening ? "Listening… start talking" : "Type or talk"} autoFocus={!canTalk}
            onChange={(e) => { setText(e.target.value); if (listening) stopTalking(); }}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(); } }} />
          <div className="flex flex-wrap items-center gap-2">
            {canTalk && (
              <button type="button" className={`btn flex items-center gap-1.5 ${listening ? "border-coral text-coral" : ""}`} onClick={listening ? stopTalking : talk} disabled={pending} aria-pressed={listening}>
                <Mic />{listening ? <><span className="inline-block h-2 w-2 animate-pulse rounded-full bg-coral" />Stop listening</> : "Talk"}
              </button>
            )}
            {!canTalk && <span className="text-xs muted">This browser can&apos;t listen. Type, or tap the mic on your phone&apos;s keyboard.</span>}
            <button type="button" className="btn ml-auto" onClick={onClose}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={ask} disabled={pending || !text.trim()}>{pending ? "Thinking…" : "Go"}</button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-xs muted">You said: &ldquo;{text}&rdquo;</p>
          {reply && <p className="text-sm">{reply}</p>}
          {cards.length === 0 && <p className="text-sm muted">Nothing to add from that.</p>}
          <ul className="flex flex-col gap-2">
            {cards.map((c) => (
              <li key={c.key} className={`rounded-lg border border-misty p-3 ${c.on ? "" : "opacity-50"}`}>
                <div className="flex items-start gap-2">
                  <input type="checkbox" className="mt-1" checked={c.on} disabled={c.status === "saved"} aria-label="Include this" onChange={(e) => edit(c.key, { on: e.target.checked })} />
                  <div className="flex flex-1 flex-col gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide muted">
                      {c.type === "task" ? `Task for ${c.assigneeName.split(" ")[0]}` : NOTE_LABEL[c.kind]}
                      {c.personName ? ` · ${c.personName}` : ""}
                      {c.status === "saved" && <span className="ml-2 text-accent">Saved</span>}
                    </p>
                    {c.type === "task" ? (
                      <>
                        <input className="input" aria-label="Task" value={c.title} onChange={(e) => edit(c.key, { title: e.target.value })} disabled={c.status === "saved"} />
                        <div className="flex flex-wrap items-center gap-2">
                          <input type="date" className="input w-auto" aria-label="Due date" value={c.due} onChange={(e) => edit(c.key, { due: e.target.value })} disabled={c.status === "saved"} />
                          <TimeSelect label="Time" allowNone value={c.time ?? ""} onChange={(v) => edit(c.key, { time: v || null })} className="input w-auto" />
                          {c.time && <span className="text-xs muted">alarm at {clock(c.time)}</span>}
                        </div>
                      </>
                    ) : (
                      <textarea className="input min-h-20" aria-label={NOTE_LABEL[c.kind]} value={c.body} onChange={(e) => edit(c.key, { body: e.target.value })} disabled={c.status === "saved"} />
                    )}
                    {c.status && c.status !== "saved" && <p role="alert" className="text-xs text-bad">{c.status}</p>}
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn" onClick={startOver} disabled={pending}>Start over</button>
            <button type="button" className="btn ml-auto" onClick={onClose}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={save} disabled={pending || !toSave.length}>{pending ? "Saving…" : `Save ${toSave.length || ""}`.trim()}</button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-sm text-bad">{error}</p>}
    </Modal>
  );
}
