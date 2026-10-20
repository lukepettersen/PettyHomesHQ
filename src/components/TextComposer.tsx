"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { TemplateSearch, useSlashTemplates } from "@/components/TemplateSearch";
import { formatPhone } from "@/lib/normalize";
import { MAX_TEXT } from "@/lib/texting";
import { fillTextTemplate, sendText } from "@/app/(app)/messages/actions";

/**
 * Write and send a text from your own business number (SPEC.md §11): a template (optional, or "/name" in the
 * message), then Send. `blocked` explains why texting isn't available (not connected, no number, Unsubscribed…).
 */
export function TextComposer({ personId, phones, templates, from, blocked, taskId, initial = "", compact, onSent }: {
  personId: string | null; phones: string[]; templates: { id: string; name: string }[]; from: string | null; blocked: string | null;
  taskId?: string | null; initial?: string; compact?: boolean; onSent?: (name: string) => void;
}) {
  const router = useRouter();
  const [to, setTo] = useState(phones[0] ?? "");
  const [templateId, setTemplateId] = useState("");
  const [body, setBody] = useState(initial);
  const [missing, setMissing] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, start] = useTransition();
  const box = useRef<HTMLTextAreaElement>(null);
  const slash = useSlashTemplates({ box, value: body, templates, onChoose: (tid, a, b) => start(async () => {
    const r = await fillTextTemplate({ personId, templateId: tid });
    if (!r.ok) { setError(r.error); return; }
    const next = body.slice(0, a) + r.data!.body + body.slice(b);
    setBody(next); setTemplateId(tid); setMissing(r.data!.missing);
    const at = a + r.data!.body.length;
    requestAnimationFrame(() => { box.current?.focus(); box.current?.setSelectionRange(at, at); });
  }) });

  if (blocked) return <p className="mt-2 rounded-md bg-sunken px-3 py-2 text-sm muted">{blocked}</p>;
  if (!phones.length) return <p className="mt-2 rounded-md bg-sunken px-3 py-2 text-sm muted">No phone number on file. Add one to their contact first.</p>;

  const pick = (tid: string) => {
    setTemplateId(tid); setError("");
    if (!tid) return;
    start(async () => {
      const r = await fillTextTemplate({ personId, templateId: tid });
      if (!r.ok) { setError(r.error); return; }
      setBody(r.data!.body); setMissing(r.data!.missing);
    });
  };
  const send = () => start(async () => {
    setError(""); setNotice("");
    const r = await sendText({ personId, to, body, taskId: taskId ?? null });
    if (!r.ok) { setError(r.error); return; }
    setNotice(`Sent to ${r.data!.name}.`); setBody(""); setTemplateId(""); setMissing([]); router.refresh(); onSent?.(r.data!.name);
  });
  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    slash.onKeyDown(e);
    // Ctrl/⌘ + Enter sends, like most chat apps; plain Enter makes a new line.
    if (!e.defaultPrevented && e.key === "Enter" && (e.metaKey || e.ctrlKey) && body.trim() && !pending) { e.preventDefault(); send(); }
  };
  return (
    <div className="mt-2 flex flex-col gap-2">
      <div className={`grid grid-cols-1 gap-2 ${compact ? "" : "sm:grid-cols-2"}`}>
        {phones.length > 1 ? (
          <label className="label">To
            <select className="input" value={to} onChange={(e) => setTo(e.target.value)}>{phones.map((p) => <option key={p} value={p}>{formatPhone(p)}</option>)}</select>
          </label>
        ) : !compact && <div className="label">To<span className="py-1.5 text-sm font-semibold text-charcoal">{formatPhone(to)}</span></div>}
        <label className="label">Template<TemplateSearch templates={templates} value={templateId} disabled={pending} onPick={pick} noneLabel="No text templates yet" /></label>
      </div>
      <div className="relative">
        <textarea ref={box} aria-label="Text message" placeholder="Write a text, or type / and a template name" className={`input font-normal ${compact ? "min-h-20" : "min-h-24"}`} value={body} maxLength={MAX_TEXT}
          onChange={(e) => { setBody(e.target.value); slash.track(); }} onKeyDown={onKey} onKeyUp={slash.track} onClick={slash.track} />
        {slash.menu}
      </div>
      {missing.length > 0 && <p className="text-sm text-[#9a6400]">Not filled in (nothing on file): {missing.join(", ")}. Check the text before sending.</p>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs muted">From your number {from ? formatPhone(from) : ""} · {body.length > 160 ? `${body.length} characters (${Math.ceil(body.length / 153)} texts)` : `${body.length}/160`}</span>
        <span className="flex gap-2">
          {body && <button type="button" className="btn" disabled={pending} onClick={() => { setBody(""); setTemplateId(""); setMissing([]); }}>Clear</button>}
          <button type="button" className="btn btn-primary" disabled={pending || !body.trim() || !to} onClick={send}>{pending ? "Sending…" : "Send text"}</button>
        </span>
      </div>
      {error && <p role="alert" className="text-sm text-bad">{error}</p>}
      {notice && <p role="status" className="text-sm text-accent">{notice}</p>}
    </div>
  );
}
