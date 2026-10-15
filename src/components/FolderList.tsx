"use client";

import { useState, useTransition, type DragEvent, type ReactNode } from "react";
import { matchTemplates } from "@/lib/templateSearch";

// Side panel for template pages (Admin → Text & email templates, Task templates): folders on top
// (click to open one; drag a template onto a folder to move it), then a searchable list of everything.

export type FolderItem = { id: string; name: string; folder: string; sub?: string };
type MoveResult = { ok: true } | { ok: false; error: string };

export function FolderList({ items, selectedId, onSelect, onMove, canMove, top, initialFolder = null, onFolderChange }: {
  items: FolderItem[]; selectedId: string | null; onSelect: (id: string) => void;
  onMove: (id: string, folder: string) => Promise<MoveResult>;
  canMove?: (id: string) => string | null; // a reason it can't move right now (e.g. unsaved changes), or null
  top?: ReactNode; initialFolder?: string | null; onFolderChange?: (f: string | null) => void;
}) {
  const [folder, setFolderState] = useState<string | null>(initialFolder);
  const setFolder = (f: string | null) => { setFolderState(f); setQ(""); onFolderChange?.(f); };
  const [q, setQ] = useState("");
  const [extra, setExtra] = useState<string[]>([]);
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [moving, start] = useTransition();

  const folders = [...new Set([...items.map((t) => t.folder), ...extra].filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const inFolder = folder === null ? items : items.filter((t) => t.folder === folder);
  const hits = new Set(matchTemplates(inFolder.map((t) => ({ id: t.id, name: `${t.name} ${t.folder}` })), q, 5000).map((m) => m.id));
  const shown = q.trim() ? inFolder.filter((t) => hits.has(t.id)) : inFolder;
  const label = (f: string | null) => (f === null ? "All templates" : f || "No folder");

  const drop = (f: string) => {
    const t = items.find((x) => x.id === dragId);
    setDragId(null); setOver(null);
    if (!t || t.folder === f) return;
    const why = canMove?.(t.id);
    if (why) { setError(why); setNote(""); return; }
    start(async () => {
      const r = await onMove(t.id, f);
      if (!r.ok) { setError(r.error); setNote(""); return; }
      setError(""); setNote(`Moved "${t.name}" to ${f || "No folder"}.`);
    });
  };
  const target = (f: string) => ({
    onDragOver: (e: DragEvent) => { if (dragId) { e.preventDefault(); setOver(f); } },
    onDragLeave: () => setOver((o) => (o === f ? null : o)),
    onDrop: (e: DragEvent) => { e.preventDefault(); drop(f); },
  });
  const folderBtn = (f: string, count: number, dashed = false) => (
    <li key={f || "__none"}>
      <button type="button" aria-pressed={folder === f} onClick={() => setFolder(folder === f ? null : f)} {...target(f)}
        className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm ${dashed ? "border border-dashed border-misty" : ""} ${over === f ? "bg-accent text-white" : folder === f ? "bg-accent-soft font-semibold text-accent" : dashed ? "muted hover:bg-sunken" : "hover:bg-sunken"}`}>
        {!dashed && <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 flex-none" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>}
        <span className="flex-1 truncate">{f || "No folder"}</span><span className="text-xs">{count}</span>
      </button>
    </li>
  );

  return (
    <aside className="card flex flex-col gap-1 p-2 lg:sticky lg:top-3">
      {top}
      {items.length > 0 && (
        <div className="mt-1">
          <div className="flex items-center justify-between px-2.5 pt-1">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider muted">Folders</h2>
            <button type="button" className="text-xs font-semibold text-accent hover:underline" onClick={() => {
              const name = window.prompt("New folder name")?.trim().slice(0, 40);
              if (name) { setExtra((x) => [...x, name]); setError(""); setNote(`Folder "${name}" added. Drag templates onto it.`); }
            }}>+ New folder</button>
          </div>
          <ul>
            {folders.map((f) => folderBtn(f, items.filter((t) => t.folder === f).length))}
            {(items.some((t) => !t.folder) || dragId) && folderBtn("", items.filter((t) => !t.folder).length, true)}
          </ul>
          <p className="px-2.5 pt-1 text-xs muted">{dragId ? "Drop on a folder to move it there." : "Tip: drag a template onto a folder to move it."}</p>
        </div>
      )}
      {error && <p role="alert" className="px-2.5 text-xs text-bad">{error}</p>}
      {note && !error && <p role="status" className="px-2.5 text-xs text-accent">{note}</p>}
      <div className="mt-1 border-t border-misty pt-2">
        <div className="flex items-center justify-between px-2.5">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider muted">{label(folder)} <span className="font-normal">{inFolder.length}</span></h2>
          {folder !== null && <button type="button" className="text-xs font-semibold text-accent hover:underline" onClick={() => setFolder(null)}>Show all</button>}
        </div>
        <input type="search" className="input mt-1 w-full" placeholder={`Search ${label(folder).toLowerCase()}…`} aria-label="Search templates" value={q} onChange={(e) => setQ(e.target.value)} />
        <ul className="mt-1 max-h-[60vh] overflow-auto">
          {shown.map((t) => (
            <li key={t.id} draggable={!moving} title="Drag onto a folder to move it" className={`cursor-grab ${dragId === t.id ? "opacity-50" : ""}`}
              onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", t.id); setDragId(t.id); }}
              onDragEnd={() => { setDragId(null); setOver(null); }}>
              <button type="button" aria-current={t.id === selectedId ? "true" : undefined} onClick={() => onSelect(t.id)}
                className={`flex w-full flex-col rounded-md px-2.5 py-1.5 text-left text-sm ${t.id === selectedId ? "bg-accent-soft font-semibold text-accent" : "hover:bg-sunken"}`}>
                <span>{t.name}</span>
                {(t.sub || (folder === null && t.folder)) && <span className="text-xs font-normal muted">{[folder === null ? t.folder : "", t.sub].filter(Boolean).join(" · ")}</span>}
              </button>
            </li>
          ))}
          {items.length > 0 && shown.length === 0 && <li className="px-2.5 py-2 text-xs muted">{q ? <>No template matches &ldquo;{q}&rdquo;.</> : "Nothing in this folder yet."}</li>}
        </ul>
      </div>
    </aside>
  );
}
