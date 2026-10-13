"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createCollection, deleteCollection, deleteSmartList, duplicateSmartList, renameCollection, renameSmartList, saveSidebarOrder } from "./listActions";

type L = { id: string; name: string; count: number };
type C = { id: string; name: string; lists: L[] };
type Result = { ok: true; data?: unknown } | { ok: false; error: string };

export function Sidebar({ collections, currentId, total }: { collections: C[]; currentId?: string; total: number }) {
  const [cols, setCols] = useState(collections);
  const [open, setOpen] = useState<Set<string>>(() => new Set(collections.filter((c) => c.lists.some((l) => l.id === currentId)).map((c) => c.id)));
  const [menu, setMenu] = useState<string | null>(null); // "l:<id>" | "c:<id>"
  const [renaming, setRenaming] = useState<{ key: string; value: string } | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [, start] = useTransition();
  const router = useRouter();
  // Keep local order in sync when the server sends new data.
  const [last, setLast] = useState(collections);
  if (last !== collections) { setLast(collections); setCols(collections); }
  // Whenever a different list is opened, make sure its collection is expanded.
  const [lastCurrent, setLastCurrent] = useState(currentId);
  if (lastCurrent !== currentId) {
    setLastCurrent(currentId);
    const holder = collections.find((c) => c.lists.some((l) => l.id === currentId));
    if (holder && !open.has(holder.id)) setOpen(new Set([...open, holder.id]));
  }

  const run = (fn: () => Promise<Result>, after?: (r: Result) => void) => start(async () => {
    setError(""); const r = await fn();
    if (!r.ok) { setError(r.error); setCols(collections); return; }
    setMenu(null); setRenaming(null); setConfirm(null); after?.(r); router.refresh();
  });
  const saveOrder = (next: C[]) => { setCols(next); run(() => saveSidebarOrder(next.map((c) => ({ id: c.id, lists: c.lists.map((l) => l.id) })))); };

  function moveList(listId: string, toCol: string, beforeId: string | null) {
    const list = cols.flatMap((c) => c.lists).find((l) => l.id === listId); if (!list) return;
    const next = cols.map((c) => ({ ...c, lists: c.lists.filter((l) => l.id !== listId) }));
    const target = next.find((c) => c.id === toCol)!;
    const at = beforeId ? target.lists.findIndex((l) => l.id === beforeId) : target.lists.length;
    target.lists.splice(at < 0 ? target.lists.length : at, 0, list);
    setOpen(new Set([...open, toCol]));
    saveOrder(next);
  }
  function moveCol(colId: string, beforeId: string | null) {
    const c = cols.find((x) => x.id === colId)!; const rest = cols.filter((x) => x.id !== colId);
    const at = beforeId ? rest.findIndex((x) => x.id === beforeId) : rest.length;
    rest.splice(at < 0 ? rest.length : at, 0, c); saveOrder(rest);
  }
  function onDrop(target: string) {
    if (!drag || drag === target) return;
    const [dk, did] = drag.split(":"), [tk, tid] = target.split(":");
    if (dk === "l") {
      if (tk === "l") { const col = cols.find((c) => c.lists.some((l) => l.id === tid))!; moveList(did, col.id, tid); }
      else moveList(did, tid, null); // dropped on a collection header or its end
    } else {
      const beforeCol = tk === "c" ? tid : cols.find((c) => c.lists.some((l) => l.id === tid))?.id ?? null;
      moveCol(did, beforeCol);
    }
  }
  const dnd = (key: string, draggable = true) => ({
    draggable, onDragStart: (e: React.DragEvent) => { setDrag(key); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", key); },
    onDragOver: (e: React.DragEvent) => { if (drag && drag !== key) { e.preventDefault(); setOver(key); } },
    onDragLeave: () => setOver((o) => (o === key ? null : o)),
    onDrop: (e: React.DragEvent) => { e.preventDefault(); onDrop(key); setDrag(null); setOver(null); },
    onDragEnd: () => { setDrag(null); setOver(null); },
  });
  const overCls = (key: string) => (over === key ? "shadow-[inset_0_2px_0_var(--color-accent)] bg-accent-soft" : "");

  return (
    <aside className="md:sticky md:top-3 md:self-start" aria-label="Smart lists">
      <Link href="/people" className={`flex justify-between rounded-md px-2.5 py-1.5 text-sm ${!currentId ? "bg-accent-soft font-bold text-accent" : "hover:bg-sunken"}`}>
        <span>All people</span><span className="muted">{total}</span>
      </Link>
      {cols.map((c, ci) => {
        const isOpen = open.has(c.id), ck = `c:${c.id}`;
        return (
          <div key={c.id} className="mt-1.5">
            <div {...dnd(ck)} className={`group flex cursor-grab items-center rounded-md ${overCls(ck)} ${drag === ck ? "opacity-40" : ""}`}>
              {renaming?.key === ck ? (
                <form className="flex flex-1 gap-1 py-1" onSubmit={(e) => { e.preventDefault(); run(() => renameCollection(c.id, renaming.value)); }}>
                  <input className="input" autoFocus value={renaming.value} aria-label="Collection name" onChange={(e) => setRenaming({ key: ck, value: e.target.value })} onKeyDown={(e) => e.key === "Escape" && setRenaming(null)} />
                  <button className="btn px-2">Save</button>
                </form>
              ) : (
                <button type="button" aria-expanded={isOpen} onClick={() => { const n = new Set(open); if (isOpen) n.delete(c.id); else n.add(c.id); setOpen(n); }}
                  className="flex flex-1 items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm font-bold hover:bg-sunken">
                  <span aria-hidden="true" className={`text-[10px] muted transition-transform ${isOpen ? "rotate-90" : ""}`}>▶</span>{c.name}
                </button>
              )}
              <button type="button" aria-label={`Options for ${c.name}`} className="rounded px-1.5 py-1 muted hover:bg-sunken hover:text-charcoal" onClick={() => setMenu(menu === ck ? null : ck)}>⋯</button>
            </div>
            {menu === ck && (
              <div className="ml-4 mt-1 flex flex-wrap gap-1 rounded-lg border border-misty bg-white p-1.5 text-xs">
                <button type="button" className="btn px-2 py-1 text-xs" onClick={() => { setRenaming({ key: ck, value: c.name }); setMenu(null); }}>Rename</button>
                <button type="button" className="btn px-2 py-1 text-xs" disabled={ci === 0} onClick={() => moveCol(c.id, cols[ci - 1]?.id ?? null)}>↑</button>
                <button type="button" className="btn px-2 py-1 text-xs" disabled={ci === cols.length - 1} onClick={() => moveCol(c.id, cols[ci + 2]?.id ?? null)}>↓</button>
                <button type="button" className="btn btn-danger px-2 py-1 text-xs" onClick={() => confirm === ck ? run(() => deleteCollection(c.id)) : setConfirm(ck)}>{confirm === ck ? "Click again" : "Delete"}</button>
              </div>
            )}
            {isOpen && (
              <div className="ml-3 flex flex-col">
                {c.lists.map((l, li) => {
                  const lk = `l:${l.id}`;
                  return (
                    <div key={l.id}>
                      <div {...dnd(lk)} className={`group flex cursor-grab items-center rounded-md ${overCls(lk)} ${drag === lk ? "opacity-40" : ""}`}>
                        {renaming?.key === lk ? (
                          <form className="flex flex-1 gap-1 py-1" onSubmit={(e) => { e.preventDefault(); run(() => renameSmartList(l.id, renaming.value)); }}>
                            <input className="input" autoFocus value={renaming.value} aria-label="List name" onChange={(e) => setRenaming({ key: lk, value: e.target.value })} onKeyDown={(e) => e.key === "Escape" && setRenaming(null)} />
                            <button className="btn px-2">Save</button>
                          </form>
                        ) : (
                          <Link href={`/people?list=${l.id}`} draggable={false} className={`flex flex-1 justify-between rounded-md px-2.5 py-1.5 text-sm ${l.id === currentId ? "bg-accent-soft font-bold text-accent" : "hover:bg-sunken"}`}>
                            <span>{l.name}</span><span className="muted">{l.count}</span>
                          </Link>
                        )}
                        <button type="button" aria-label={`Options for ${l.name}`} className="rounded px-1.5 py-1 muted opacity-0 group-hover:opacity-100 focus:opacity-100 hover:bg-sunken hover:text-charcoal" onClick={() => setMenu(menu === lk ? null : lk)}>⋯</button>
                      </div>
                      {menu === lk && (
                        <div className="my-1 ml-2 flex flex-wrap items-center gap-1 rounded-lg border border-misty bg-white p-1.5">
                          <button type="button" className="btn px-2 py-1 text-xs" onClick={() => { setRenaming({ key: lk, value: l.name }); setMenu(null); }}>Rename</button>
                          <button type="button" className="btn px-2 py-1 text-xs" disabled={li === 0} aria-label="Move up" onClick={() => moveList(l.id, c.id, c.lists[li - 1]?.id ?? null)}>↑</button>
                          <button type="button" className="btn px-2 py-1 text-xs" disabled={li === c.lists.length - 1} aria-label="Move down" onClick={() => moveList(l.id, c.id, c.lists[li + 2]?.id ?? null)}>↓</button>
                          <select className="rounded border border-misty bg-white px-1 py-1 text-xs" aria-label="Move to collection" value="" onChange={(e) => e.target.value && moveList(l.id, e.target.value, null)}>
                            <option value="">Move to…</option>
                            {cols.filter((x) => x.id !== c.id).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                          </select>
                          <button type="button" className="btn px-2 py-1 text-xs" onClick={() => run(() => duplicateSmartList(l.id))}>Duplicate</button>
                          <button type="button" className="btn btn-danger px-2 py-1 text-xs" onClick={() => confirm === lk ? run(() => deleteSmartList(l.id), () => { if (l.id === currentId) router.push("/people"); }) : setConfirm(lk)}>{confirm === lk ? "Click again" : "Delete"}</button>
                        </div>
                      )}
                    </div>
                  );
                })}
                <div {...dnd(`e:${c.id}`, false)} onDrop={(e) => { e.preventDefault(); if (drag?.startsWith("l:")) moveList(drag.slice(2), c.id, null); setDrag(null); setOver(null); }}
                  className={`rounded-md px-2.5 py-1 text-xs muted ${overCls(`e:${c.id}`)}`}>
                  <Link href={`/people?new=${c.id}`} className="hover:underline">+ New smart list</Link>
                </div>
              </div>
            )}
          </div>
        );
      })}
      <button type="button" className="mt-2 px-2.5 text-sm font-semibold text-accent hover:underline"
        onClick={() => run(() => createCollection("New collection"), (r) => { const id = (r as { ok: true; data?: { id: string } }).data?.id; if (id) setRenaming({ key: `c:${id}`, value: "New collection" }); })}>
        + New collection
      </button>
      <p className="mt-2 px-2.5 text-xs muted">Drag lists and collections to reorder or move them, or use ⋯.</p>
      {error && <p role="alert" className="mt-2 px-2.5 text-sm text-bad">{error}</p>}
    </aside>
  );
}
