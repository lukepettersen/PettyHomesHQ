"use client";

import Link from "next/link";
import { Caveat } from "next/font/google";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { BOARD, boxOf, NOTE_COLORS, listEnter, listMark, placeNew, plainText, richSegments, toggleAll, toggleList, toggleMark, type BoardItem } from "@/lib/whiteboard";
import { saveBoard } from "./actions";

const hand = Caveat({ subsets: ["latin"], weight: ["500", "700"] });
const newId = () => Math.random().toString(36).slice(2, 10);
type Hit = { id: string; name: string; stage: string };

/** The owner's whiteboard (owner request 2026-11-02): sticky notes, marker text and people, dragged anywhere; saves itself.
 *  Several can be picked at once (⌘/Ctrl/Shift-click, or drag a box on an empty spot) to move, resize, recolor or delete
 *  together, keeping how they're laid out. */
export function WhiteboardApp({ initial }: { initial: BoardItem[] }) {
  const [items, setItems] = useState(initial);
  const [picked, setPicked] = useState<string[]>([]);
  const [confirm, setConfirm] = useState<string | null>(null); // an item id, or "many" for Delete on several
  const [status, setStatus] = useState<"saved" | "saving" | "error">("saved");
  const [picking, setPicking] = useState(false);
  const [fresh, setFresh] = useState<string | null>(null); // just added: the cursor goes in it
  // The note or text being typed in shows the raw words (with **bold** markers); the rest show formatted (owner request 2026-11-02).
  const [editing, setEditing] = useState<string | null>(null);
  const typingIn = (id: string) => editing === id || fresh === id;
  const box2 = useRef<HTMLTextAreaElement | null>(null); // the textarea being typed in
  const selRange = useRef<{ start: number; end: number } | null>(null); // the selection to restore after B / I / U / lists
  /** B / I / U: around the selected words while typing, else the whole of each picked note or text. */
  const format = (mark: "**" | "*" | "__") => {
    const el = box2.current, id = editing ?? fresh;
    if (el && id && document.activeElement === el) {
      let a = el.selectionStart, z = el.selectionEnd;
      // Nothing selected: the line the cursor is on (e.g. a heading like "OFFERS SUBMITTED").
      if (a === z) { const v = el.value; a = v.lastIndexOf("\n", a - 1) + 1; z = v.indexOf("\n", z); if (z < 0) z = v.length; while (a < z && v[a] === " ") a++; while (z > a && v[z - 1] === " ") z--; }
      const r = toggleMark(el.value, a, z, mark);
      selRange.current = { start: r.start, end: r.end }; // put back right after the change shows
      patch(id, { text: r.text });
      return;
    }
    setItems((list) => list.map((i) => (picked.includes(i.id) && i.kind !== "person" ? { ...i, text: toggleAll(i.text, mark) } : i)));
  };
  /** • List / 1. List: the lines the cursor or selection touches, else the whole of each picked note or text. */
  const list = (kind: "bullet" | "number") => {
    const el = box2.current, id = editing ?? fresh;
    if (el && id && document.activeElement === el) {
      const r = toggleList(el.value, el.selectionStart, el.selectionEnd, kind);
      selRange.current = { start: r.end, end: r.end };
      patch(id, { text: r.text });
      return;
    }
    setItems((all) => all.map((i) => (picked.includes(i.id) && i.kind !== "person" ? { ...i, text: toggleList(i.text, 0, i.text.length, kind).text } : i)));
  };
  const keys = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const id = editing ?? fresh;
    // Enter on a list line keeps the list going; Enter on an empty item ends it.
    if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey && id) {
      const el = e.currentTarget, r = el.selectionStart === el.selectionEnd ? listEnter(el.value, el.selectionStart) : null;
      if (r) { e.preventDefault(); selRange.current = { start: r.pos, end: r.pos }; patch(id, { text: r.text }); }
      return;
    }
    if (!(e.metaKey || e.ctrlKey)) return;
    const mark = ({ b: "**", i: "*", u: "__" } as const)[e.key.toLowerCase() as "b" | "i" | "u"];
    if (mark) { e.preventDefault(); format(mark); }
  };
  const field = (id: string) => ({
    ref: (el: HTMLTextAreaElement | null) => {
      if (!el) return;
      box2.current = el;
      if (document.activeElement !== el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
      if (selRange.current && el.value.length >= selRange.current.end) { el.setSelectionRange(selRange.current.start, selRange.current.end); selRange.current = null; }
    },
    onKeyDown: keys,
    onBlur: () => { setEditing((x) => (x === id ? null : x)); setFresh((x) => (x === id ? null : x)); },
  });
  const [box, setBox] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  // A smaller screen (a phone) shrinks the board so everything placed on the computer still shows (owner 2026-11-02).
  const [area, setArea] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = scroller.current; if (!el) return;
    const ro = new ResizeObserver(() => setArea({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el); return () => ro.disconnect();
  }, []);
  const [frozen, setFrozen] = useState<number | null>(null); // held still while dragging so the board doesn't jump
  const layer = useRef<HTMLDivElement>(null);
  const [extent, setExtent] = useState({ w: 0, h: 0 }); // how far right and down the items actually reach
  useLayoutEffect(() => {
    if (frozen != null || !layer.current) return;
    let w = 0, h = 0;
    layer.current.querySelectorAll<HTMLElement>("[data-item]").forEach((el) => { w = Math.max(w, el.offsetLeft + el.offsetWidth); h = Math.max(h, el.offsetTop + el.offsetHeight); });
    setExtent((e) => (e.w === w && e.h === h ? e : { w, h }));
  }, [items, frozen]);
  const scale = frozen ?? fitScale(extent, area);
  // The board fills the rest of the screen, never scrolls; zooming the browser out gives it more room (owner 2026-11-02).
  const page = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | undefined>(undefined);
  useEffect(() => {
    const fit = () => { const top = page.current?.getBoundingClientRect().top ?? 0; setHeight(Math.max(320, window.innerHeight - top)); };
    fit(); window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  // Saves only when the owner clicks Save (or ⌘S); Cancel goes back to the last save (owner request 2026-11-02).
  const [saved, setSaved] = useState(initial);
  const dirty = items !== saved;
  const save = async () => {
    if (!dirty || status === "saving") return;
    setStatus("saving"); const now = items; const r = await saveBoard(now);
    if (r.ok) setSaved(now);
    setStatus(r.ok ? "saved" : "error");
  };
  const cancel = () => { setItems(saved); setPicked([]); setConfirm(null); setStatus("saved"); };
  const saveRef = useRef(save);
  useEffect(() => { saveRef.current = save; });
  useEffect(() => {
    if (!dirty) return;
    const leave = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", leave);
    return () => window.removeEventListener("beforeunload", leave);
  }, [dirty]);

  const patch = (id: string, p: Partial<BoardItem>) => setItems((list) => list.map((i) => (i.id === id ? { ...i, ...p } : i)));
  const view = () => ({ left: 0, top: 0, w: area.w / scale || undefined, h: area.h / scale || undefined });
  const add = (i: Omit<BoardItem, "id" | "x" | "y">) => { const id = newId(); setItems((list) => [...list, { ...i, id, ...placeNew(view(), list, i.kind === "note" ? { w: i.w ?? 220, h: i.h ?? 160 } : { w: 320, h: (i.size ?? 36) * 1.5 }) }]); setPicked([id]); setFresh(id); };
  const sel = items.filter((i) => picked.includes(i.id));
  const notes = sel.filter((i) => i.kind === "note"), words = sel.filter((i) => i.kind !== "note"), aligned = sel.filter((i) => i.kind !== "person");
  const removeIds = (ids: string[]) => { setItems((list) => list.filter((i) => !ids.includes(i.id))); setPicked([]); setConfirm(null); };
  const remove = (id: string) => { if (confirm !== id) { setConfirm(id); return; } removeIds([id]); };
  /** A click picks one; ⌘/Ctrl/Shift-click adds or removes it from what's picked. */
  /** An item and everything grouped with it. */
  const members = (id: string) => { const g = items.find((i) => i.id === id)?.group; return g ? items.filter((i) => i.group === g).map((i) => i.id) : [id]; };
  const withGroups = (ids: string[]) => [...new Set(ids.flatMap(members))];
  const pick = (id: string, e: React.PointerEvent | React.FocusEvent) => {
    const add = "metaKey" in e && (e.metaKey || e.ctrlKey || e.shiftKey);
    const alone = "altKey" in e && e.altKey; // ⌥ (Option): just this one, even inside a group
    const mine = alone ? [id] : members(id);
    setPicked((p) => (add ? (p.includes(id) ? p.filter((x) => !mine.includes(x)) : [...new Set([...p, ...mine])]) : alone ? [id] : p.includes(id) ? p : mine));
  };
  const group = () => { const g = newId(); setItems((list) => list.map((i) => (picked.includes(i.id) ? { ...i, group: g } : i))); };
  const ungroup = () => setItems((list) => list.map((i) => (picked.includes(i.id) ? { ...i, group: undefined } : i)));
  const pickedGroup = sel.length > 1 && sel[0].group && sel.every((i) => i.group === sel[0].group) && items.filter((i) => i.group === sel[0].group).length === sel.length;

  // Delete removes everything picked (asks once); Escape unpicks. Not while typing in a note or text.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement).closest("textarea, input");
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") { e.preventDefault(); void saveRef.current(); return; }
      if (e.key === "Escape") { setPicked([]); setConfirm(null); (document.activeElement as HTMLElement | null)?.blur(); return; }
      if (typing || !picked.length || (e.key !== "Delete" && e.key !== "Backspace")) return;
      e.preventDefault();
      if (confirm !== "many") { setConfirm("many"); return; }
      removeIds(picked);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [picked, confirm]);

  /** Moves an item, and everything else picked with it, keeping their layout; the corner resizes a note.
   *  From the grip (or a note's top bar) it moves at once; from the name, text or note itself it waits for a small move,
   *  so a plain click still opens the name or puts the cursor in the text (owner request 2026-11-02). */
  const startMove = (id: string, e: React.PointerEvent, mode: "move" | "size", wait: boolean) => {
    const el = e.target as HTMLElement;
    if (el.closest("button")) return; // the × is a button, not a drag (owner report 2026-11-02)
    if (wait && el.closest("textarea") === document.activeElement && el.closest("textarea")) return; // already typing: drag selects words
    if (!wait) { e.preventDefault(); e.stopPropagation(); }
    const multi = e.metaKey || e.ctrlKey || e.shiftKey;
    const group = mode === "size" || e.altKey ? [id] : picked.includes(id) && !multi ? picked : members(id);
    if (!picked.includes(id) || multi || e.altKey) pick(id, e);
    if (multi && wait) return; // ⌘-click only picks
    const start = items.filter((i) => group.includes(i.id)).map((i) => { const b = boxOf(i); return { id: i.id, x: i.x, y: i.y, w: b.w, h: b.h, kind: i.kind }; });
    const sx = e.clientX, sy = e.clientY;
    let moving = !wait;
    const k = scale; setFrozen(k);
    const move = (ev: PointerEvent) => {
      let dx = (ev.clientX - sx) / k, dy = (ev.clientY - sy) / k;
      if (!moving) {
        if (Math.hypot(dx * k, dy * k) < 5) return;
        moving = true;
        (document.activeElement as HTMLElement | null)?.blur(); window.getSelection()?.removeAllRanges();
        document.body.style.userSelect = "none";
      }
      ev.preventDefault();
      if (mode === "size") {
        const s0 = start[0];
        if (s0.kind === "note") patch(id, { w: Math.max(120, Math.min(700, s0.w + dx)), h: Math.max(80, Math.min(700, s0.h + dy)) });
        else patch(id, { w: Math.round(Math.max(60, s0.w + dx)), h: Math.round(Math.max(30, s0.h + dy)) }); // a text box: the words wrap inside it
        return;
      }
      // The whole group stays on the visible board, keeping its layout (it's the size of the screen; owner 2026-11-02).
      const W = (area.w ? area.w / k : BOARD.w) - 40, H = (area.h ? area.h / k : BOARD.h) - 30;
      dx = Math.max(-Math.min(...start.map((s) => s.x)), Math.min(W - Math.max(...start.map((s) => s.x)), dx));
      dy = Math.max(-Math.min(...start.map((s) => s.y)), Math.min(H - Math.max(...start.map((s) => s.y)), dy));
      setItems((list) => list.map((i) => { const s = start.find((x) => x.id === i.id); return s ? { ...i, x: s.x + dx, y: s.y + dy } : i; }));
    };
    const up = () => {
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", up);
      document.body.style.userSelect = ""; setFrozen(null);
      // A drag that ends on a name shouldn't also open it.
      if (moving && wait) { const stop = (c: MouseEvent) => { c.preventDefault(); c.stopPropagation(); }; window.addEventListener("click", stop, { capture: true, once: true }); setTimeout(() => window.removeEventListener("click", stop, { capture: true }), 0); }
    };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up); window.addEventListener("pointercancel", up);
  };
  const drag = (id: string, mode: "move" | "size") => (e: React.PointerEvent) => startMove(id, e, mode, false);
  const grab = (id: string) => (e: React.PointerEvent) => startMove(id, e, "move", true);
  /** Dragging on an empty spot draws a box; what it touches gets picked. */
  const boxStart = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("[data-item]")) return;
    const r = e.currentTarget.getBoundingClientRect(), keep = e.metaKey || e.ctrlKey || e.shiftKey ? picked : [];
    const k = scale, x0 = (e.clientX - r.left) / k, y0 = (e.clientY - r.top) / k;
    if (!keep.length) setPicked([]);
    setConfirm(null);
    const target = e.currentTarget; target.setPointerCapture(e.pointerId);
    let cur = { x0, y0, x1: x0, y1: y0 };
    const move = (ev: PointerEvent) => { cur = { x0, y0, x1: (ev.clientX - r.left) / k, y1: (ev.clientY - r.top) / k }; setBox(cur); };
    const up = () => {
      target.removeEventListener("pointermove", move); target.removeEventListener("pointerup", up); setBox(null);
      const L = Math.min(cur.x0, cur.x1), R = Math.max(cur.x0, cur.x1), T = Math.min(cur.y0, cur.y1), B = Math.max(cur.y0, cur.y1);
      if (R - L < 4 && B - T < 4) return;
      const hit = items.filter((i) => { const b = boxOf(i); return b.x < R && b.x + b.w > L && b.y < B && b.y + b.h > T; }).map((i) => i.id);
      setPicked(withGroups([...keep, ...hit]));
    };
    target.addEventListener("pointermove", move); target.addEventListener("pointerup", up);
  };
  const resizeText = (d: number) => setItems((list) => list.map((i) => (picked.includes(i.id) && i.kind !== "note" ? { ...i, size: Math.max(16, Math.min(120, (i.size ?? 36) + d)) } : i)));
  const grip = (id: string) => (
    <span role="button" tabIndex={-1} aria-label="Drag to move" title="Drag to move" onPointerDown={drag(id, "move")}
      className={`absolute -left-6 top-1 cursor-move touch-none select-none rounded px-1 text-sm text-muted group-hover:block group-focus-within:block ${picked.includes(id) ? "block" : "hidden"}`}>⠿</span>
  );
  const x = (id: string, cls = "") => (
    <button type="button" aria-label={confirm === id ? "Click again to remove" : "Remove"} onClick={() => remove(id)} onBlur={() => setConfirm((c) => (c === id ? null : c))}
      className={`rounded px-1.5 text-sm leading-5 ${confirm === id ? "bg-bad text-xs font-bold text-white" : "text-black/45 hover:bg-black/5 hover:text-bad"} ${cls}`}>{confirm === id ? "Remove?" : "×"}</button>
  );
  const ring = (id: string) => (picked.includes(id) ? "outline-2 outline-offset-4 outline-dashed outline-coral" : "");

  return (
    <div ref={page} className="flex flex-col px-4 pb-4 pt-3" style={{ height }}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h1 className="mr-2 text-2xl font-extrabold">Whiteboard</h1>
        <span className="flex items-center gap-1.5 rounded-lg border border-misty bg-white px-2.5 py-1.5 text-sm font-semibold">
          <button type="button" className="hover:underline" onClick={() => add({ kind: "note", text: "", color: NOTE_COLORS[0], w: 220, h: 160 })}>+ Sticky note</button>
          {NOTE_COLORS.map((c, n) => (
            <button key={c} type="button" title={notes.length ? `Change the color of ${notes.length === 1 ? "this note" : `these ${notes.length} notes`}` : "Add a note in this color"} aria-label={`${notes.length ? "Color" : "Add note"} ${n + 1}`}
              onClick={() => (notes.length ? setItems((list) => list.map((i) => (picked.includes(i.id) && i.kind === "note" ? { ...i, color: c } : i))) : add({ kind: "note", text: "", color: c, w: 220, h: 160 }))}
              className={`size-4 rounded border ${notes.length && notes.every((i) => i.color === c) ? "border-charcoal ring-1 ring-charcoal" : "border-black/10"}`} style={{ background: c }} />
          ))}
        </span>
        <button type="button" className="btn" onClick={() => add({ kind: "text", text: "", size: 40 })}>+ Text</button>
        <span className="relative">
          <button type="button" className="btn" aria-expanded={picking} onClick={() => setPicking(!picking)}>+ Person</button>
          {picking && <PersonPicker onPick={(h) => { add({ kind: "person", text: h.name, personId: h.id, size: 30 }); setPicking(false); }} onClose={() => setPicking(false)} />}
        </span>
        <span className="flex overflow-hidden rounded-lg border border-misty bg-white text-sm font-semibold">
          <button type="button" className="px-2.5 py-1.5 hover:bg-sunken disabled:opacity-40" disabled={!words.length} onClick={() => resizeText(-4)} aria-label="Smaller">A−</button>
          <button type="button" className="border-l border-misty px-2.5 py-1.5 hover:bg-sunken disabled:opacity-40" disabled={!words.length} onClick={() => resizeText(4)} aria-label="Bigger">A+</button>
        </span>
        <span className="flex overflow-hidden rounded-lg border border-misty bg-white text-sm font-semibold" role="group" aria-label="Line up the words">
          {(["left", "center", "right"] as const).map((a, n) => (
            <button key={a} type="button" disabled={!aligned.length} onClick={() => setItems((list) => list.map((i) => (picked.includes(i.id) && i.kind !== "person" ? { ...i, align: a } : i)))}
              aria-label={`Align ${a}`} title={`Align ${a}`} aria-pressed={aligned.length > 0 && aligned.every((i) => (i.align ?? "left") === a)}
              className={`px-2.5 py-1.5 hover:bg-sunken disabled:opacity-40 aria-pressed:bg-sunken ${n ? "border-l border-misty" : ""}`}><AlignIcon a={a} /></button>
          ))}
        </span>
        <span className="flex overflow-hidden rounded-lg border border-misty bg-white text-sm" role="group" aria-label="Bold, italic, underline">
          {([["**", "Bold (⌘B)", "font-bold", "B"], ["*", "Italic (⌘I)", "italic font-serif", "I"], ["__", "Underline (⌘U)", "underline", "U"]] as const).map(([m, label, cls, ch], n) => (
            <button key={m} type="button" disabled={!aligned.length && !editing && !fresh} aria-label={label} title={label}
              onPointerDown={(e) => e.preventDefault()} onMouseDown={(e) => e.preventDefault()} onClick={() => format(m)}
              className={`w-8 py-1.5 hover:bg-sunken disabled:opacity-40 ${cls} ${n ? "border-l border-misty" : ""}`}>{ch}</button>
          ))}
          {([["bullet", "Bullet list", "•"], ["number", "Numbered list", "1."]] as const).map(([k, label, ch]) => (
            <button key={k} type="button" disabled={!aligned.length && !editing && !fresh} aria-label={label} title={label}
              onPointerDown={(e) => e.preventDefault()} onMouseDown={(e) => e.preventDefault()} onClick={() => list(k)}
              className="w-8 border-l border-misty py-1.5 font-semibold hover:bg-sunken disabled:opacity-40">{ch}</button>
          ))}
        </span>
        <span className="ml-auto flex items-center gap-2">
          <span className={`text-xs ${status === "error" ? "font-semibold text-bad" : "muted"}`} role="status">
            {status === "saving" ? "Saving…" : status === "error" ? "Couldn't save. Check your connection." : dirty ? <b className="text-charcoal">Unsaved changes</b> : <>Saved ✓ · only you can see this<span className="hidden xl:inline"> · ⌘-click or drag a box to pick several</span></>}
          </span>
          {dirty && <button type="button" className="btn" onClick={cancel} disabled={status === "saving"}>Cancel</button>}
          <button type="button" className="btn btn-primary" onClick={save} disabled={!dirty || status === "saving"} title="Save (⌘S)">Save</button>
        </span>
      </div>
      <div ref={scroller} className="relative min-h-0 flex-1 overflow-hidden rounded-2xl border border-misty bg-white shadow-[inset_0_0_0_10px_#f6f4f1]">
        <div ref={layer} className={`absolute left-0 top-0 origin-top-left touch-none ${hand.className}`} onPointerDown={boxStart}
          style={{ width: area.w ? area.w / scale : "100%", height: area.h ? area.h / scale : "100%", transform: scale < 1 ? `scale(${scale})` : undefined, backgroundImage: "radial-gradient(#e7e2da 1px, transparent 1px)", backgroundSize: "22px 22px" }}>
          {items.length === 0 && <p className="absolute left-10 top-10 font-sans text-sm muted">Empty board. Add a sticky note, some text or a person with the buttons above.</p>}
          {items.map((i) => {
            if (i.kind === "note") return (
              <div key={i.id} data-item onPointerDown={grab(i.id)} className={`absolute flex flex-col rounded shadow-[0_6px_14px_rgba(56,50,50,.15)] ${ring(i.id)}`}
                style={{ left: i.x, top: i.y, width: i.w, height: i.h, background: i.color }}>
                <div onPointerDown={drag(i.id, "move")} title="Drag to move" className="flex h-5 flex-none cursor-move touch-none items-center justify-end px-1">{x(i.id, "font-sans")}</div>
                {typingIn(i.id)
                  ? <textarea aria-label="Sticky note" {...field(i.id)} value={i.text} placeholder="Type…" onChange={(e) => patch(i.id, { text: e.target.value })}
                      style={{ textAlign: i.align ?? "left" }} className="min-h-0 flex-1 resize-none bg-transparent px-3 pb-3 text-[24px] leading-tight text-charcoal outline-none placeholder:text-black/30" />
                  : <div role="textbox" aria-label="Sticky note" tabIndex={0} onClick={(e) => { if (!(e.metaKey || e.ctrlKey || e.shiftKey)) setEditing(i.id); }} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); setEditing(i.id); } }}
                      style={{ textAlign: i.align ?? "left" }} className="min-h-0 flex-1 cursor-text overflow-hidden whitespace-pre-wrap break-words px-3 pb-3 text-[24px] leading-tight text-charcoal">
                      {i.text ? <RichText text={i.text} /> : <span className="text-black/30">Type…</span>}</div>}
                <span onPointerDown={drag(i.id, "size")} aria-hidden="true" className="absolute -bottom-1.5 -right-1.5 size-3.5 cursor-nwse-resize touch-none rounded-sm border-2 border-coral bg-white" />
              </div>
            );
            const size = i.size ?? 36;
            if (i.kind === "person") return (
              <div key={i.id} data-item onPointerDown={grab(i.id)} className={`group absolute flex items-center gap-1 ${ring(i.id)}`} style={{ left: i.x, top: i.y }}>
                {grip(i.id)}
                <Link href={`/people/${i.personId}`} draggable={false} onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey) e.preventDefault(); }} className="cursor-pointer select-none whitespace-nowrap text-[#2f5d8a] underline decoration-1 underline-offset-4" style={{ fontSize: size }}>{i.text}</Link>
                <span className="hidden font-sans group-hover:inline">{x(i.id)}</span>
              </div>
            );
            const lines = (plainText(i.text) || "Type here").split("\n"), shaped = !!(i.w && i.h);
            const look = { fontSize: size, textAlign: i.align ?? "left", ...(shaped ? { width: i.w, height: i.h } : { width: `${Math.max(4, ...lines.map((l) => l.length)) * 0.55 + 1}em` }) } as const;
            return (
              <div key={i.id} data-item onPointerDown={grab(i.id)} className={`group absolute ${ring(i.id)}`} style={{ left: i.x, top: i.y }}>
                {grip(i.id)}
                {typingIn(i.id)
                  ? <textarea aria-label="Text" {...field(i.id)} value={i.text} placeholder="Type here" rows={Math.max(lines.length, i.text.split("\n").length)} onChange={(e) => patch(i.id, { text: e.target.value })}
                      className={`block resize-none bg-transparent font-bold leading-tight text-[#2f5d8a] outline-none placeholder:text-[#2f5d8a]/40 ${shaped ? "overflow-y-auto" : "overflow-hidden"}`}
                      style={{ ...look, ...(shaped ? {} : { width: `${Math.max(4, ...i.text.split("\n").map((l) => l.length)) * 0.55 + 1}em` }) }} />
                  : <div role="textbox" aria-label="Text" tabIndex={0} onClick={(e) => { if (!(e.metaKey || e.ctrlKey || e.shiftKey)) setEditing(i.id); }} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); setEditing(i.id); } }}
                      className={`cursor-text whitespace-pre-wrap break-words font-bold leading-tight text-[#2f5d8a] ${shaped ? "overflow-hidden" : ""}`} style={look}>
                      {i.text ? <RichText text={i.text} heavy /> : <span className="text-[#2f5d8a]/40">Type here</span>}</div>}
                <span className="absolute -right-6 top-0 hidden font-sans group-hover:block">{x(i.id)}</span>
                {/* Drag the corner to reshape the box; the words wrap to fit (owner request 2026-11-02). */}
                <span onPointerDown={drag(i.id, "size")} aria-hidden="true" title="Drag to reshape"
                  className={`absolute -bottom-1.5 -right-1.5 size-3.5 cursor-nwse-resize touch-none rounded-sm border-2 border-coral bg-white group-hover:block ${picked.includes(i.id) ? "block" : "hidden"}`} />
              </div>
            );
          })}
          {box && <div aria-hidden="true" className="pointer-events-none absolute border border-dashed border-coral bg-coral/10" style={{ left: Math.min(box.x0, box.x1), top: Math.min(box.y0, box.y1), width: Math.abs(box.x1 - box.x0), height: Math.abs(box.y1 - box.y0) }} />}
        </div>
        {/* Floats over the board so picking doesn't push the board down mid-click. */}
        {picked.length > 1 && (
          <span className="absolute left-1/2 top-3 z-20 flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full border border-misty bg-white px-3 py-1 font-sans text-sm shadow-md">
            <b>{picked.length} picked</b>
            {pickedGroup
              ? <button type="button" className="rounded-md px-2 py-1 font-semibold hover:bg-sunken" onClick={ungroup} title="They'll move on their own again">Ungroup</button>
              : <button type="button" className="rounded-md border border-misty bg-white px-2 py-1 font-semibold hover:bg-sunken" onClick={group} title="Keep these together: clicking or dragging one grabs them all">Group</button>}
            <button type="button" className={`rounded-md px-2 py-1 font-semibold ${confirm === "many" ? "bg-bad text-white" : "text-bad hover:bg-sunken"}`} onClick={() => (confirm === "many" ? removeIds(picked) : setConfirm("many"))}>{confirm === "many" ? `Click again to remove ${picked.length}` : "Remove"}</button>
            <button type="button" className="muted hover:underline" onClick={() => { setPicked([]); setConfirm(null); }}>Unpick</button>
          </span>
        )}
      </div>
    </div>
  );
}

/** Words with their bold / italic / underline. Marker text (already bold) gets a heavier stroke for bold. */
function RichText({ text, heavy = false }: { text: string; heavy?: boolean }) {
  const words = (t: string) => richSegments(t).map((s, n) => (
    <span key={n} className={`${s.b ? (heavy ? "[-webkit-text-stroke:0.035em_currentColor]" : "font-bold") : ""} ${s.i ? "italic" : ""} ${s.u ? "underline decoration-2 underline-offset-4" : ""}`}>{s.t}</span>
  ));
  // List lines ("• " or "1. ") hang so wrapped words line up under the first word.
  return <>{text.split("\n").map((line, n) => {
    const mark = listMark(line);
    return mark
      ? <span key={n} className="flex"><span className="flex-none pr-[0.3em]">{mark.trim()}</span><span className="min-w-0">{words(line.slice(mark.length))}</span></span>
      : <span key={n} className="block min-h-[1.25em]">{words(line)}</span>;
  })}</>;
}

function AlignIcon({ a }: { a: "left" | "center" | "right" }) {
  const rows = [14, 9, 12];
  return (
    <svg width="16" height="14" viewBox="0 0 16 14" aria-hidden="true" className="inline-block">
      {rows.map((w, n) => <rect key={n} x={a === "left" ? 1 : a === "right" ? 15 - w : (16 - w) / 2} y={1 + n * 5} width={w} height="2" rx="1" fill="currentColor" />)}
    </svg>
  );
}

/** How much to shrink the board so every item fits the space (never bigger than life, down to a sixth). */
function fitScale(extent: { w: number; h: number }, area: { w: number; h: number }) {
  if (!area.w || !area.h || !extent.w) return 1;
  return Math.max(0.16, Math.min(1, area.w / (extent.w + 24), area.h / (extent.h + 24)));
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
