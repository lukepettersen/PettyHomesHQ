"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { TemplateSearch, useSlashTemplates } from "@/components/TemplateSearch";
import { formatPhone } from "@/lib/normalize";
import { MAX_TEXT } from "@/lib/texting";
import { fillTextTemplate, sendText, sendTextGroup } from "@/app/(app)/messages/actions";
import { AddRecipient, ExtraChips, type Extra } from "@/components/AddRecipient";
import { EmojiButton } from "@/components/EmojiButton";
import { TextPhotoButton, TextPhotoPreviews } from "@/components/TextPhotos";

/**
 * Write and send a text from your own business number (SPEC.md §11): a template (optional, or "/name" in the
 * message), then Send. `blocked` explains why texting isn't available (not connected, no number, Unsubscribed…).
 */
export function TextComposer({ personId, phones, templates, from, blocked, taskId, initial = "", compact, onSent, groupsOn, autoExtras = [] }: {
  personId: string | null; phones: string[]; templates: { id: string; name: string }[]; from: string | null; blocked: string | null;
  taskId?: string | null; initial?: string; compact?: boolean; onSent?: (name: string) => void; groupsOn?: boolean; autoExtras?: Extra[];
}) {
  const router = useRouter();
  const [to, setTo] = useState(phones[0] ?? "");
  // Others to send the same text to: one group text when group texting is on (starting with the contact's other
  // numbers and the owner's cell), otherwise each gets their own text.
  const [extras, setExtras] = useState<Extra[]>(autoExtras);
  const [templateId, setTemplateId] = useState("");
  const [body, setBody] = useState(initial);
  const [photos, setPhotos] = useState<string[]>([]);
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
    if (groupsOn && extras.length) {
      const g = await sendTextGroup({ numbers: [to, ...extras.map((x) => x.value)], body, personId, taskId: taskId ?? null, media: photos });
      if (!g.ok) { setError(g.error); return; }
      setNotice(`Sent as a group text to ${extras.length + 1} people.`);
      setBody(""); setPhotos([]); setTemplateId(""); setMissing([]); router.refresh(); onSent?.("the group");
      return;
    }
    const r = await sendText({ personId, to, body, taskId: taskId ?? null, media: photos });
    if (!r.ok) { setError(r.error); return; }
    const names = [r.data!.name], failed: string[] = [];
    for (const x of extras) {
      const e = await sendText({ personId: x.personId, to: x.value, body, typed: !x.personId, media: photos });
      if (e.ok) names.push(e.data!.name); else failed.push(`${x.label}: ${e.error}`);
    }
    setNotice(`Sent to ${names.join(", ")}.`); if (failed.length) setError(`Not sent to ${failed.join("; ")}`);
    setBody(""); setPhotos([]); setTemplateId(""); setMissing([]); setExtras([]); router.refresh(); onSent?.(r.data!.name);
  });
  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    slash.onKeyDown(e);
    // Ctrl/⌘ + Enter sends, like most chat apps; plain Enter makes a new line.
    if (!e.defaultPrevented && e.key === "Enter" && (e.metaKey || e.ctrlKey) && (body.trim() || photos.length) && !pending) { e.preventDefault(); send(); }
  };
  return (
    <div className="mt-2 flex flex-col gap-2">
      <div className={`grid grid-cols-1 gap-2 ${compact ? "" : "sm:grid-cols-2"}`}>
        {phones.length > 1 ? (
          <label className="label">To
            <select className="input" value={to} onChange={(e) => setTo(e.target.value)}>{phones.map((p) => <option key={p} value={p}>{formatPhone(p)}</option>)}</select>
          </label>
        ) : !compact && <div className="label">To<span className="py-1.5 text-sm font-semibold text-charcoal">{formatPhone(to)}</span></div>}
        <div className="flex flex-wrap items-center gap-1.5 sm:col-span-2">
          <ExtraChips extras={extras} onRemove={(v) => setExtras(extras.filter((x) => x.value !== v))} />
          <AddRecipient mode="phone" exclude={[to, ...extras.map((x) => x.value)]} onAdd={(x) => setExtras([...extras, x])} />
          {extras.length > 0 && <span className="text-xs muted">{groupsOn ? "Sends as one group text; everyone sees the replies." : "Each person gets their own text; replies come back separately."}</span>}
        </div>
        <label className="label">Template<TemplateSearch templates={templates} value={templateId} disabled={pending} onPick={pick} noneLabel="No text templates yet" /></label>
      </div>
      <div className="relative">
        <textarea ref={box} aria-label="Text message" placeholder="Write a text, or type / and a template name" className={`input font-normal ${compact ? "min-h-20" : "min-h-24"}`} value={body} maxLength={MAX_TEXT}
          onChange={(e) => { setBody(e.target.value); slash.track(); }} onKeyDown={onKey} onKeyUp={slash.track} onClick={slash.track} />
        {slash.menu}
      </div>
      <TextPhotoPreviews photos={photos} onChange={setPhotos} />
      {missing.length > 0 && <p className="text-sm text-[#9a6400]">Not filled in (nothing on file): {missing.join(", ")}. Check the text before sending.</p>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs muted">From your number {from ? formatPhone(from) : ""} · {body.length > 160 ? `${body.length} characters (${Math.ceil(body.length / 153)} texts)` : `${body.length}/160`}</span>
        <span className="flex gap-2">
          <TextPhotoButton photos={photos} onChange={setPhotos} disabled={pending} />
          <EmojiButton box={box} value={body} onChange={setBody} />
          {body && <button type="button" className="btn" disabled={pending} onClick={() => { setBody(""); setTemplateId(""); setMissing([]); }}>Clear</button>}
          <button type="button" className="btn btn-primary" disabled={pending || (!body.trim() && !photos.length) || !to} onClick={send}>{pending ? "Sending…" : "Send text"}</button>
        </span>
      </div>
      {error && <p role="alert" className="text-sm text-bad">{error}</p>}
      {notice && <p role="status" className="text-sm text-accent">{notice}</p>}
    </div>
  );
}
