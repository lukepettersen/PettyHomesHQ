"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { SaveBar } from "@/components/SaveBar";
import { fill, sampleValues, type MergeField } from "@/lib/merge";
import { toHtml } from "@/lib/email";
import { FormatBar } from "@/components/FormatBar";
import { deleteMessageTemplate, saveMessageTemplate } from "./actions";
import { matchTemplates } from "@/lib/templateSearch";

type Kind = "email" | "text";
export type Msg = { id: string | null; kind: Kind; name: string; folder: string; subject: string; body: string };

export function MessagesClient({ templates, initialKind, initialId, fields }: { templates: Msg[]; initialKind: Kind; initialId: string | null; fields: MergeField[] }) {
  const router = useRouter();
  const [kind, setKind] = useState<Kind>(initialKind);
  const [selId, setSelId] = useState<string | null>(initialId ?? templates.find((t) => t.kind === initialKind)?.id ?? null);
  const [draftNew, setDraftNew] = useState<Msg | null>(null);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState("");
  const list = templates.filter((t) => t.kind === kind);
  const folders = [...new Set(list.map((t) => t.folder).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  // Folders on top (click one to open it); below, a searchable list of everything (or just that folder).
  const [folder, setFolder] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const inFolder = folder === null ? list : list.filter((t) => t.folder === folder);
  // Search matches words in the name or the folder.
  const hits = new Set(matchTemplates(inFolder.map((t) => ({ id: t.id!, name: `${t.name} ${t.folder}` })), q, 1000).map((m) => m.id));
  const shown = q.trim() ? inFolder.filter((t) => hits.has(t.id!)) : inFolder;
  const sel = draftNew ?? templates.find((t) => t.id === selId && t.kind === kind) ?? null;
  const guard = (fn: () => void) => { if (dirty) { setMsg("Save or discard your changes first."); return; } setMsg(""); fn(); };
  const url = (k: Kind, id: string | null) => window.history.replaceState(null, "", `/admin/messages?kind=${k}${id ? `&t=${id}` : ""}`);

  return (
    <>
      <div role="tablist" aria-label="Template type" className="mb-3 flex gap-1 border-b border-misty">
        {(["email", "text"] as const).map((k) => (
          <button key={k} role="tab" type="button" aria-selected={kind === k} onClick={() => guard(() => { setKind(k); setDraftNew(null); setFolder(null); setQ(""); const first = templates.find((t) => t.kind === k)?.id ?? null; setSelId(first); url(k, first); })}
            className={`-mb-px border-b-[3px] px-3 py-2 ${kind === k ? "border-coral font-semibold" : "border-transparent muted"}`}>{k === "email" ? "Email templates" : "Text templates"} <span className="text-xs muted">{templates.filter((t) => t.kind === k).length}</span></button>
        ))}
      </div>
      {msg && <p role="alert" className="mb-2 text-sm text-bad">{msg}</p>}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="card flex flex-col gap-1 p-2 lg:sticky lg:top-3">
          <button type="button" className="btn btn-primary" onClick={() => guard(() => { setDraftNew({ id: null, kind, name: "", folder: folder ?? "", subject: "", body: "" }); setSelId(null); })}>+ New {kind} template</button>
          {folders.length > 0 && (
            <div className="mt-1">
              <h2 className="px-2.5 pt-1 text-[11px] font-semibold uppercase tracking-wider muted">Folders</h2>
              <ul>
                {folders.map((f) => (
                  <li key={f}><button type="button" aria-pressed={folder === f} onClick={() => { setFolder(folder === f ? null : f); setQ(""); }}
                    className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm ${folder === f ? "bg-accent-soft font-semibold text-accent" : "hover:bg-sunken"}`}>
                    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 flex-none" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>
                    <span className="flex-1 truncate">{f}</span><span className="text-xs muted">{list.filter((t) => t.folder === f).length}</span>
                  </button></li>
                ))}
              </ul>
            </div>
          )}
          <div className="mt-2 border-t border-misty pt-2">
            <div className="flex items-center justify-between px-2.5">
              <h2 className="text-[11px] font-semibold uppercase tracking-wider muted">{folder ?? "All templates"} <span className="font-normal">{inFolder.length}</span></h2>
              {folder !== null && <button type="button" className="text-xs font-semibold text-accent hover:underline" onClick={() => { setFolder(null); setQ(""); }}>Show all</button>}
            </div>
            <input type="search" className="input mt-1 w-full" placeholder={`Search ${folder ?? "all templates"}…`} aria-label="Search templates" value={q} onChange={(e) => setQ(e.target.value)} />
            <ul className="mt-1 max-h-[60vh] overflow-auto">
              {shown.map((t) => (
                <li key={t.id}><button type="button" aria-current={t.id === selId && !draftNew ? "true" : undefined} onClick={() => guard(() => { setDraftNew(null); setSelId(t.id); url(kind, t.id); })}
                  className={`flex w-full flex-col rounded-md px-2.5 py-1.5 text-left text-sm ${t.id === selId && !draftNew ? "bg-accent-soft font-semibold text-accent" : "hover:bg-sunken"}`}>
                  <span>{t.name}</span>{folder === null && t.folder && <span className="text-xs font-normal muted">{t.folder}</span>}
                </button></li>
              ))}
              {list.length > 0 && shown.length === 0 && <li className="px-2.5 py-2 text-xs muted">No template matches &ldquo;{q}&rdquo;.</li>}
            </ul>
          </div>
          {list.length === 0 && <p className="px-2.5 py-2 text-xs muted">No {kind} templates yet.</p>}
        </aside>
        <div className="min-w-0">
          {sel ? <Editor key={sel.id ?? "new"} t={sel} fields={fields} folders={folders} onDirty={setDirty} onSaved={(id) => { setDraftNew(null); setSelId(id); url(kind, id); router.refresh(); }} onDeleted={() => { setSelId(null); router.refresh(); }} />
            : <div className="card p-6 muted">Pick a template, or create one with + New {kind} template.</div>}
        </div>
      </div>
    </>
  );
}

function Editor({ t: initial, fields, folders, onDirty, onSaved, onDeleted }: { t: Msg; fields: MergeField[]; folders: string[]; onDirty: (d: boolean) => void; onSaved: (id: string) => void; onDeleted: () => void }) {
  const [t, setT] = useState(initial);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  const body = useRef<HTMLTextAreaElement>(null);
  const isNew = !initial.id;
  const dirty = isNew || JSON.stringify(t) !== JSON.stringify(initial);
  const set = (p: Partial<Msg>) => { const n = { ...t, ...p }; setT(n); onDirty(isNew || JSON.stringify(n) !== JSON.stringify(initial)); };
  const insert = (key: string) => {
    const el = body.current, tag = `{${key}}`;
    const at = el?.selectionStart ?? t.body.length;
    set({ body: t.body.slice(0, at) + tag + t.body.slice(el?.selectionEnd ?? at) });
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(at + tag.length, at + tag.length); });
  };
  const values = sampleValues(fields);
  const preview = fill(t.body, values), subj = fill(t.subject, values);
  return (
    <div className="flex flex-col gap-3">
      <section className="card flex flex-col gap-3 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_180px]">
          <label className="label">Name<input className="input" value={t.name} placeholder={t.kind === "email" ? "e.g. Purchase agreement accepted" : "e.g. Consult confirmation"} onChange={(e) => set({ name: e.target.value })} /></label>
          <label className="label">Folder<input className="input" list="msg-folders" value={t.folder} placeholder="Pick or type a new one" onChange={(e) => set({ folder: e.target.value })} />
            <datalist id="msg-folders">{folders.map((f) => <option key={f} value={f} />)}</datalist></label>
        </div>
        {t.kind === "email" && <label className="label">Subject<input className="input" value={t.subject} onChange={(e) => set({ subject: e.target.value })} /></label>}
        {t.kind === "email" ? (
          <div className="label">Message
            <div>
              <FormatBar box={body} value={t.body} onChange={(v) => set({ body: v })} />
              <textarea ref={body} aria-label="Message" className="input min-h-48 rounded-t-none font-normal" value={t.body} onChange={(e) => set({ body: e.target.value })} />
            </div>
          </div>
        ) : (
          <label className="label">Message
            <textarea ref={body} className="input min-h-48 font-normal" value={t.body} onChange={(e) => set({ body: e.target.value })} />
          </label>
        )}
        <div>
          <span className="text-xs font-semibold muted">Insert a merge field (every question on your forms is one):</span>
          {[...new Set(fields.map((f) => f.group))].map((g) => (
            <details key={g} className="mt-1" open={g === "Client"}>
              <summary className="cursor-pointer text-sm font-semibold">{g} <span className="text-xs font-normal muted">{fields.filter((f) => f.group === g).length}</span></summary>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {fields.filter((f) => f.group === g).map((f) => <button key={f.key} type="button" className="chip hover:bg-misty" title={`{${f.key}}`} onClick={() => insert(f.key)}>{f.label}</button>)}
              </div>
            </details>
          ))}
        </div>
        {t.kind === "text" && <p className="text-xs muted">{preview.text.length} characters{preview.text.length > 160 ? " (longer texts are sent as several messages)" : ""}.</p>}
        {!isNew && (
          <div>
            <button type="button" className="btn btn-danger" disabled={pending} onBlur={() => setConfirm(false)}
              onClick={() => { if (!confirm) { setConfirm(true); return; } start(async () => { const r = await deleteMessageTemplate(initial.id!); if (!r.ok) setError(r.error); else { onDirty(false); onDeleted(); } }); }}>
              {confirm ? "Click again to delete" : "Delete template"}
            </button>
          </div>
        )}
      </section>
      <section className="card p-4">
        <h2 className="font-bold">Preview <span className="text-sm font-normal muted">with sample details</span></h2>
        {t.kind === "email" && <p className="mt-2 text-sm"><b>Subject:</b> {subj.text || <span className="muted">(none)</span>}</p>}
        {t.kind === "email" && preview.text
          // toHtml escapes everything typed and only adds bold, links and lists, so this is safe to show.
          ? <div className="mt-2 rounded-md bg-sunken p-3 text-sm [&_a]:text-accent [&_a]:underline [&_ul]:list-disc [&_ul]:pl-5" dangerouslySetInnerHTML={{ __html: toHtml(preview.text) }} />
          : <p className="mt-2 whitespace-pre-wrap rounded-md bg-sunken p-3 text-sm">{preview.text || <span className="muted">Nothing written yet.</span>}</p>}
      </section>
      <SaveBar dirty={dirty} pending={pending} error={error} onDiscard={() => { if (isNew) { onDirty(false); onDeleted(); } else { setT(initial); onDirty(false); } setError(""); }}
        onSave={() => start(async () => { setError(""); const r = await saveMessageTemplate(t); if (!r.ok) { setError(r.error); return; } onDirty(false); onSaved(r.data!.id); })} />
    </div>
  );
}
