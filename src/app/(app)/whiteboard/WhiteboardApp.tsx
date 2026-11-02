"use client";

import Link from "next/link";
import { Caveat } from "next/font/google";
import { useEffect, useRef, useState } from "react";
import { BOARD, NOTE_COLORS, placeNew, type BoardItem } from "@/lib/whiteboard";
import { saveBoard } from "./actions";

const hand = Caveat({ subsets: ["latin"], weight: ["500", "700"] });
const newId = () => Math.random().toString(36).slice(2, 10);
type Hit = { id: string; name: string; stage: string };

/** The owner's whiteboard (owner request 2026-11-02): sticky notes, marker text and people, dragged anywhere; saves itself. */
export function WhiteboardApp({ initial }: { initial: BoardItem[] }) {
  const [items, setItems] = useState(initial);
  const [sel, setSel] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [status, setStatus] = useState<"saved" | "saving" | "error">("saved");
  const [picking, setPicking] = useState(false);
  const [fresh, setFresh] = useState<string | null>(null); // just added: the cursor goes in it
  const scroller = useRef<HTMLDivElement>(null);
  const first = useRef(true);

  // Saves a moment after the last change.
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const t = setTimeout(async () => { setStatus("saving"); const r = await saveBoard(items); setStatus(r.ok ? "saved" : "error"); }, 800);
    return () => clearTimeout(t);
  }, [items]);

  const patch = (id: string, p: Partial<BoardItem>) => setItems((list) => list.map((i) => (i.id === id ? { ...i, ...p } : i)));
  const view = () => ({ left: scroller.current?.scrollLeft ?? 0, top: scroller.current?.scrollTop ?? 0, w: scroller.current?.clientWidth, h: scroller.current?.clientHeight });
  const add = (i: Omit<BoardItem, "id" | "x" | "y">) => { const id = newId(); setItems((list) => [...list, { ...i, id, ...placeNew(view(), list, i.kind === "note" ? { w: i.w ?? 220, h: i.h ?? 160 } : { w: 320, h: (i.size ?? 36) * 1.5 }) }]); setSel(id); setFresh(id); };
  const selected = items.find((i) => i.id === sel);
  const remove = (id: string) => { if (confirm !== id) { setConfirm(id); return; } setItems((list) => list.filter((i) => i.id !== id)); setConfirm(null); setSel(null); };

  /** Dragging by the grip (or a note's top bar) moves it; the corner resizes a note. */
  const drag = (id: string, mode: "move" | "size") => (e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation(); setSel(id);
    const it = items.find((i) => i.id === id); if (!it) return;
    const sx = e.clientX, sy = e.clientY, ox = mode === "move" ? it.x : it.w ?? 220, oy = mode === "move" ? it.y : it.h ?? 160;
    const target = e.currentTarget as HTMLElement; target.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - sx, dy = ev.clientY - sy;
      if (mode === "move") patch(id, { x: Math.max(0, Math.min(BOARD.w - 40, ox + dx)), y: Math.max(0, Math.min(BOARD.h - 30, oy + dy)) });
      else patch(id, { w: Math.max(120, Math.min(700, ox + dx)), h: Math.max(80, Math.min(700, oy + dy)) });
    };
    const up = () => { target.removeEventListener("pointermove", move); target.removeEventListener("pointerup", up); };
    target.addEventListener("pointermove", move); target.addEventListener("pointerup", up);
  };
  const resizeText = (d: number) => { if (selected && selected.kind !== "note") patch(selected.id, { size: Math.max(16, Math.min(120, (selected.size ?? 36) + d)) }); };
  const grip = (id: string) => (
    <span role="button" tabIndex={-1} aria-label="Drag to move" title="Drag to move" onPointerDown={drag(id, "move")}
      className="absolute -left-6 top-1 hidden cursor-move touch-none select-none rounded px-1 text-sm text-muted group-hover:block group-focus-within:block">⠿</span>
  );
  const x = (id: string, cls = "") => (
    <button type="button" aria-label={confirm === id ? "Click again to remove" : "Remove"} onClick={() => remove(id)} onBlur={() => setConfirm((c) => (c === id ? null : c))}
      className={`rounded px-1 text-xs ${confirm === id ? "bg-bad font-bold text-white" : "text-black/40 hover:text-bad"} ${cls}`}>{confirm === id ? "Remove?" : "×"}</button>
  );

  return (
    <div className="flex h-[calc(100dvh-64px)] flex-col px-4 pb-4 pt-3">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h1 className="mr-2 text-2xl font-extrabold">Whiteboard</h1>
        <span className="flex items-center gap-1.5 rounded-lg border border-misty bg-white px-2.5 py-1.5 text-sm font-semibold">
          <button type="button" className="hover:underline" onClick={() => add({ kind: "note", text: "", color: NOTE_COLORS[0], w: 220, h: 160 })}>+ Sticky note</button>
          {NOTE_COLORS.map((c, n) => (
            <button key={c} type="button" title={selected?.kind === "note" ? "Change this note's color" : "Add a note in this color"} aria-label={`${selected?.kind === "note" ? "Color" : "Add note"} ${n + 1}`}
              onClick={() => (selected?.kind === "note" ? patch(selected.id, { color: c }) : add({ kind: "note", text: "", color: c, w: 220, h: 160 }))}
              className={`size-4 rounded border ${selected?.kind === "note" && selected.color === c ? "border-charcoal ring-1 ring-charcoal" : "border-black/10"}`} style={{ background: c }} />
          ))}
        </span>
        <button type="button" className="btn" onClick={() => add({ kind: "text", text: "", size: 40 })}>+ Text</button>
        <span className="relative">
          <button type="button" className="btn" aria-expanded={picking} onClick={() => setPicking(!picking)}>+ Person</button>
          {picking && <PersonPicker onPick={(h) => { add({ kind: "person", text: h.name, personId: h.id, size: 30 }); setPicking(false); }} onClose={() => setPicking(false)} />}
        </span>
        <span className="flex overflow-hidden rounded-lg border border-misty bg-white text-sm font-semibold">
          <button type="button" className="px-2.5 py-1.5 hover:bg-sunken disabled:opacity-40" disabled={!selected || selected.kind === "note"} onClick={() => resizeText(-4)} aria-label="Smaller">A−</button>
          <button type="button" className="border-l border-misty px-2.5 py-1.5 hover:bg-sunken disabled:opacity-40" disabled={!selected || selected.kind === "note"} onClick={() => resizeText(4)} aria-label="Bigger">A+</button>
        </span>
        <span className={`ml-auto text-xs ${status === "error" ? "font-semibold text-bad" : "muted"}`} role="status">
          {status === "saving" ? "Saving…" : status === "error" ? "Couldn't save. Check your connection." : "Saved ✓ · only you can see this"}
        </span>
      </div>
      <div ref={scroller} className="min-h-0 flex-1 overflow-auto rounded-2xl border border-misty bg-white shadow-[inset_0_0_0_10px_#f6f4f1]" onPointerDown={(e) => { if (!(e.target as HTMLElement).closest("[data-item]")) setSel(null); }}>
        <div className={`relative ${hand.className}`} style={{ width: BOARD.w, height: BOARD.h, backgroundImage: "radial-gradient(#e7e2da 1px, transparent 1px)", backgroundSize: "22px 22px" }}>
          {items.length === 0 && <p className="absolute left-10 top-10 font-sans text-sm muted">Empty board. Add a sticky note, some text or a person with the buttons above.</p>}
          {items.map((i) => {
            const on = sel === i.id;
            if (i.kind === "note") return (
              <div key={i.id} data-item onPointerDown={() => setSel(i.id)} className={`absolute flex flex-col rounded shadow-[0_6px_14px_rgba(56,50,50,.15)] ${on ? "outline-2 outline-offset-4 outline-dashed outline-coral" : ""}`}
                style={{ left: i.x, top: i.y, width: i.w, height: i.h, background: i.color }}>
                <div onPointerDown={drag(i.id, "move")} title="Drag to move" className="flex h-5 flex-none cursor-move touch-none items-center justify-end px-1">{x(i.id, "font-sans")}</div>
                <textarea aria-label="Sticky note" autoFocus={fresh === i.id} value={i.text} placeholder="Type…" onChange={(e) => patch(i.id, { text: e.target.value })} onFocus={() => setSel(i.id)}
                  className="min-h-0 flex-1 resize-none bg-transparent px-3 pb-3 text-[24px] leading-tight text-charcoal outline-none placeholder:text-black/30" />
                <span onPointerDown={drag(i.id, "size")} aria-hidden="true" className="absolute -bottom-1.5 -right-1.5 size-3.5 cursor-nwse-resize touch-none rounded-sm border-2 border-coral bg-white" />
              </div>
            );
            const size = i.size ?? 36;
            if (i.kind === "person") return (
              <div key={i.id} data-item onPointerDown={() => setSel(i.id)} className={`group absolute flex items-center gap-1 ${on ? "outline-2 outline-offset-4 outline-dashed outline-coral" : ""}`} style={{ left: i.x, top: i.y }}>
                {grip(i.id)}
                <Link href={`/people/${i.personId}`} draggable={false} className="whitespace-nowrap text-[#2f5d8a] underline decoration-1 underline-offset-4" style={{ fontSize: size }}>{i.text}</Link>
                <span className="hidden font-sans group-hover:inline">{x(i.id)}</span>
              </div>
            );
            const lines = (i.text || "Type here").split("\n");
            return (
              <div key={i.id} data-item onPointerDown={() => setSel(i.id)} className={`group absolute ${on ? "outline-2 outline-offset-4 outline-dashed outline-coral" : ""}`} style={{ left: i.x, top: i.y }}>
                {grip(i.id)}
                <textarea aria-label="Text" autoFocus={fresh === i.id} value={i.text} placeholder="Type here" rows={lines.length} onChange={(e) => patch(i.id, { text: e.target.value })} onFocus={() => setSel(i.id)}
                  className="resize-none overflow-hidden bg-transparent font-bold leading-tight text-[#2f5d8a] outline-none placeholder:text-[#2f5d8a]/40"
                  style={{ fontSize: size, width: `${Math.max(4, ...lines.map((l) => l.length)) * 0.55 + 1}em` }} />
                <span className="absolute -right-6 top-0 hidden font-sans group-hover:block">{x(i.id)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Search HQ for a person; picking one puts their name on the board. */
function PersonPicker({ onPick, onClose }: { onPick: (h: Hit) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (q.trim().length < 2) return;
    const t = setTimeout(async () => {
      const r = await fetch(`/api/search?q=${encodeURIComponent(q.trim())}`).then((x) => (x.ok ? x.json() : { results: [] })).catch(() => ({ results: [] }));
      setHits((r.results ?? []) as Hit[]);
    }, 200);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    const click = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) onClose(); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("mousedown", click); window.addEventListener("keydown", key);
    return () => { window.removeEventListener("mousedown", click); window.removeEventListener("keydown", key); };
  }, [onClose]);
  const shown = q.trim().length < 2 ? [] : hits;
  return (
    <div ref={box} className="absolute left-0 top-full z-30 mt-1 w-72 rounded-xl border border-misty bg-white p-2 shadow-xl">
      <input autoFocus className="input" placeholder="Search people…" aria-label="Search people" value={q} onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && shown[0]) onPick(shown[0]); }} />
      <ul className="mt-1 max-h-64 overflow-y-auto">
        {shown.map((h) => (
          <li key={h.id}><button type="button" onClick={() => onPick(h)} className="flex w-full justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-sunken">
            <span className="truncate">{h.name}</span><span className="flex-none text-xs muted">{h.stage}</span></button></li>
        ))}
        {q.trim().length >= 2 && !shown.length && <li className="px-2 py-1.5 text-sm muted">No one found.</li>}
      </ul>
    </div>
  );
}
