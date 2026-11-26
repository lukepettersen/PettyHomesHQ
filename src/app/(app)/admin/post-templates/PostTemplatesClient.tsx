"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { POST_FIELDS, POST_FONTS, type PostField, type PostTemplate, type TextBox } from "@/lib/postTemplates";
import { renderPost } from "@/components/postRender";
import { savePostTemplatesAction } from "./actions";

const SAMPLE: Partial<Record<PostField, string>> = { beds: "3", baths: "2", garage: "1", city: "Edina MN", address: "5013 William Ave", price: "$457,500", reviewer: "Sarah",
  review: "\"Luke made us feel so comfortable throughout the process of purchasing our first home. He was extremely professional, knowledgeable, and insightful.\"", stars: "★★★★★" };
const rid = () => Math.random().toString(36).slice(2, 10);

/** The list of templates, and the editor for one (Save / Cancel; Remove is two-step). */
export function PostTemplatesClient({ initial }: { initial: PostTemplate[] }) {
  const router = useRouter();
  const [list, setList] = useState(initial);
  const [editing, setEditing] = useState<PostTemplate | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, start] = useTransition();
  const [sure, setSure] = useState("");
  const file = useRef<HTMLInputElement>(null);
  const persist = (next: PostTemplate[], done?: () => void) => start(async () => {
    setError(""); const r = await savePostTemplatesAction(next);
    if (!r.ok) { setError(r.error); return; }
    setList(r.data!); done?.(); router.refresh();
  });
  const upload = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true); setError("");
    try {
      const form = new FormData(); form.append("file", f);
      const r = await fetch("/api/email-images", { method: "POST", body: form });
      const d = (await r.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!r.ok || !d.url) { setError(d.error ?? "The image didn't upload."); return; }
      const overlay = new URL(d.url, location.href).pathname;
      const i = new Image(); i.src = overlay; await i.decode();
      setEditing({ id: rid(), name: f.name.replace(/\.[a-z]+$/i, "").slice(0, 60), overlay, width: i.naturalWidth, height: i.naturalHeight, photo: { x: 0, y: 0, w: i.naturalWidth, h: i.naturalHeight }, boxes: [] });
    } catch { setError("The image didn't upload."); } finally { setBusy(false); if (file.current) file.current.value = ""; }
  };

  if (editing) return <Editor t={editing} pending={pending} error={error} onCancel={() => { setEditing(null); setError(""); }}
    onSave={(t) => persist(list.some((x) => x.id === t.id) ? list.map((x) => (x.id === t.id ? t : x)) : [...list, t], () => setEditing(null))} />;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => file.current?.click()}>{busy ? "Uploading…" : "+ New template (upload PNG)"}</button>
        <input ref={file} type="file" accept="image/png,image/webp" className="hidden" aria-label="Template image" onChange={(e) => void upload(e.target.files?.[0])} />
        {error && <span role="alert" className="text-sm text-bad">{error}</span>}
      </div>
      {!list.length && <p className="card p-4 text-sm muted">No templates yet.</p>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((t) => (
          <div key={t.id} className="card overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={t.overlay} alt="" className="aspect-square w-full bg-[repeating-conic-gradient(#eee_0_25%,#fff_0_50%)] [background-size:16px_16px] object-contain" />
            <div className="flex items-center justify-between gap-2 p-2 text-sm">
              <b className="truncate">{t.name}</b>
              <span className="flex gap-1">
                <button type="button" className="btn px-2 py-0.5 text-xs" onClick={() => setEditing(t)}>Edit</button>
                <button type="button" className="btn px-2 py-0.5 text-xs text-bad" disabled={pending} onBlur={() => setSure("")} onClick={() => (sure === t.id ? persist(list.filter((x) => x.id !== t.id)) : setSure(t.id))}>{sure === t.id ? "Click again" : "Remove"}</button>
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Editor({ t: initial, pending, error, onSave, onCancel }: { t: PostTemplate; pending: boolean; error: string; onSave: (t: PostTemplate) => void; onCancel: () => void }) {
  const [t, setT] = useState(initial);
  const [sel, setSel] = useState<string | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const preview = useRef<HTMLCanvasElement>(null);
  const [samplePhoto, setSamplePhoto] = useState<string | null>(null);
  const W = 520, k = W / t.width;
  const set = (p: Partial<PostTemplate>) => setT({ ...t, ...p });
  const setBox = (id: string, p: Partial<TextBox>) => set({ boxes: t.boxes.map((b) => (b.id === id ? { ...b, ...p } : b)) });
  const addBox = (field: PostField) => {
    const b: TextBox = { id: rid(), field, text: field === "title" ? "Under Contract" : field === "custom" ? "Your text" : "", x: Math.round(t.width * 0.1), y: Math.round(t.height * (0.08 + ((t.boxes.length * 0.11) % 0.8))) /* each new box a step lower, so they don't stack */, w: Math.round(t.width * 0.5), h: Math.round(t.height * (field === "review" ? 0.3 : 0.08)),
      size: Math.round(t.width * (field === "title" ? 0.08 : field === "review" ? 0.03 : 0.04)), color: field === "stars" ? "#f5c518" : "#ffffff", align: "left", font: POST_FONTS[0], bold: field === "title" };
    set({ boxes: [...t.boxes, b] }); setSel(b.id);
  };
  // Drag a box (or its corner) on the picture; sizes are in the design's own pixels.
  const drag = (e: React.PointerEvent, id: string, mode: "move" | "size") => {
    e.preventDefault(); e.stopPropagation();
    const sx = e.clientX, sy = e.clientY;
    const isPhoto = id === "photo";
    const start = isPhoto ? { ...(t.photo ?? { x: 0, y: 0, w: t.width, h: t.height }) } : { ...t.boxes.find((b) => b.id === id)! };
    const move = (ev: PointerEvent) => {
      const dx = Math.round((ev.clientX - sx) / k), dy = Math.round((ev.clientY - sy) / k);
      const r = mode === "move" ? { x: Math.max(0, Math.min(t.width - start.w, start.x + dx)), y: Math.max(0, Math.min(t.height - start.h, start.y + dy)) }
        : { w: Math.max(20, Math.min(t.width - start.x, start.w + dx)), h: Math.max(20, Math.min(t.height - start.y, start.h + dy)) };
      if (isPhoto) setT((cur) => ({ ...cur, photo: { ...(cur.photo ?? start as { x: number; y: number; w: number; h: number }), ...r } }));
      else setT((cur) => ({ ...cur, boxes: cur.boxes.map((b) => (b.id === id ? { ...b, ...r } : b)) }));
    };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
    setSel(id);
  };
  useEffect(() => {
    const h = setTimeout(() => { if (preview.current) void renderPost(preview.current, t, samplePhoto, SAMPLE).catch(() => null); }, 250);
    return () => clearTimeout(h);
  }, [t, samplePhoto]);
  const box = t.boxes.find((b) => b.id === sel);
  const R = (r: { x: number; y: number; w: number; h: number }) => ({ left: r.x * k, top: r.y * k, width: r.w * k, height: r.h * k });
  return (
    <div className="grid gap-4 lg:grid-cols-[auto_minmax(0,1fr)]">
      <div>
        <div ref={stage} className="relative select-none border border-misty bg-[repeating-conic-gradient(#eee_0_25%,#fff_0_50%)] [background-size:16px_16px]" style={{ width: W, height: t.height * k }} onPointerDown={() => setSel(null)}>
          {t.photo && <div className={`absolute border-2 border-dashed ${sel === "photo" ? "border-[#24507a] bg-[#24507a]/20" : "border-[#24507a]/60 bg-[#24507a]/10"} cursor-move`} style={R(t.photo)} onPointerDown={(e) => drag(e, "photo", "move")}>
            <span className="absolute left-1 top-1 rounded bg-[#24507a] px-1 text-[10px] font-bold text-white">House photo</span>
            <span className="absolute bottom-0 right-0 h-3 w-3 cursor-se-resize bg-[#24507a]" onPointerDown={(e) => drag(e, "photo", "size")} />
          </div>}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={t.overlay} alt="" className="pointer-events-none absolute inset-0 h-full w-full" />
          {t.boxes.map((b) => (
            <div key={b.id} className={`absolute cursor-move border-2 border-dashed ${sel === b.id ? "border-coral bg-coral/20" : "border-coral/70"}`} style={R(b)} onPointerDown={(e) => drag(e, b.id, "move")}>
              <span className="absolute left-0 top-0 rounded-br bg-coral px-1 text-[10px] font-bold text-white">{b.field === "title" || b.field === "custom" ? b.text || POST_FIELDS[b.field] : POST_FIELDS[b.field]}</span>
              <span className="absolute bottom-0 right-0 h-3 w-3 cursor-se-resize bg-coral" onPointerDown={(e) => drag(e, b.id, "size")} />
            </div>
          ))}
        </div>
        <p className="mt-1 text-xs muted">Drag a box to move it; drag its corner to resize. Blue = the house photo (behind the design); orange = text.</p>
      </div>
      <div className="flex flex-col gap-3 text-sm">
        <label className="label">Name<input className="input" value={t.name} onChange={(e) => set({ name: e.target.value })} /></label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={!!t.photo} onChange={(e) => set({ photo: e.target.checked ? { x: 0, y: 0, w: t.width, h: t.height } : null })} /> Has a house photo behind the design</label>
        <div className="flex flex-wrap items-center gap-1.5"><span className="font-semibold">Add text:</span>
          {(Object.keys(POST_FIELDS) as PostField[]).map((f) => <button key={f} type="button" className="btn px-2 py-0.5 text-xs" onClick={() => addBox(f)}>{POST_FIELDS[f].replace(/ \(.*\)/, "")}</button>)}
        </div>
        {box ? (
          <div className="card flex flex-col gap-2 p-3">
            <div className="flex items-center justify-between"><b>{POST_FIELDS[box.field]}</b><button type="button" className="text-xs font-semibold text-bad hover:underline" onClick={() => { set({ boxes: t.boxes.filter((b) => b.id !== box.id) }); setSel(null); }}>Remove box</button></div>
            {(box.field === "title" || box.field === "custom") && <label className="label">Words<input className="input" value={box.text} onChange={(e) => setBox(box.id, { text: e.target.value })} /></label>}
            {box.field !== "title" && box.field !== "custom" && <p className="text-xs muted">Filled in from the deal on Make post (and can be changed there). Leave the words empty here.</p>}
            <div className="grid grid-cols-2 gap-2">
              <label className="label">Size<input type="number" className="input" value={box.size} onChange={(e) => setBox(box.id, { size: Math.max(8, Number(e.target.value) || 8) })} /></label>
              <label className="label">Color<input type="color" className="input h-9 p-1" value={box.color} onChange={(e) => setBox(box.id, { color: e.target.value })} /></label>
              <label className="label">Font<select className="input" value={box.font} onChange={(e) => setBox(box.id, { font: e.target.value })}>{POST_FONTS.map((f) => <option key={f}>{f}</option>)}</select></label>
              <label className="label">Line up<select className="input" value={box.align} onChange={(e) => setBox(box.id, { align: e.target.value as TextBox["align"] })}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label>
            </div>
            <label className="flex items-center gap-2"><input type="checkbox" checked={box.bold} onChange={(e) => setBox(box.id, { bold: e.target.checked })} /> Bold</label>
          </div>
        ) : <p className="text-xs muted">Click a box on the picture to change its words, size, color or font.</p>}
        <div>
          <div className="flex items-center justify-between"><b>Preview</b>
            <label className="cursor-pointer text-xs font-semibold text-accent hover:underline">Try a photo<input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) setSamplePhoto(URL.createObjectURL(f)); }} /></label></div>
          <canvas ref={preview} className="mt-1 w-full max-w-[420px] border border-misty" />
        </div>
        {error && <p role="alert" className="text-bad">{error}</p>}
        <div className="flex gap-2"><button type="button" className="btn btn-primary" disabled={pending} onClick={() => onSave(t)}>Save</button><button type="button" className="btn" disabled={pending} onClick={onCancel}>Cancel</button></div>
      </div>
    </div>
  );
}
