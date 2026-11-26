"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "@/components/Modal";
import { renderPost } from "@/components/postRender";
import { dealValues, POST_FIELDS, type PostField, type PostTemplate } from "@/lib/postTemplates";
import type { FileView } from "@/lib/files";
import { personFilesForEmail } from "../emailActions";

/** "Make post" on a deal (owner request 2026-11-26): pick a template and a photo, check the words, download the post. */
export function PostMaker({ file, templates, onClose }: { file: FileView; templates: PostTemplate[]; onClose: () => void }) {
  const [tid, setTid] = useState(templates[0]?.id ?? "");
  const t = templates.find((x) => x.id === tid) ?? null;
  const [values, setValues] = useState(() => dealValues({ address: file.address, price: file.price, info: file.info as Record<string, unknown>, personName: file.personName }));
  const [photo, setPhoto] = useState<string | null>(null);
  const [theirs, setTheirs] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState("");
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => { void personFilesForEmail(file.personId).then((r) => { if (r.ok) setTheirs(r.data!.filter((d) => /\.(jpe?g|png|webp|gif)$/i.test(d.name))); }); }, [file.personId]);
  useEffect(() => {
    if (!t || !canvas.current) return;
    const h = setTimeout(() => { setError(""); void renderPost(canvas.current!, t, photo, values).catch((e) => setError(e instanceof Error ? e.message : "The post couldn't be drawn.")); }, 150);
    return () => clearTimeout(h);
  }, [t, photo, values]);
  // The words this template uses (its title and your-own-text boxes are fixed in the template).
  const fields = useMemo(() => [...new Set((t?.boxes ?? []).map((b) => b.field).filter((f) => f !== "title" && f !== "custom"))] as PostField[], [t]);
  const download = () => canvas.current?.toBlob((b) => {
    if (!b) { setError("The post couldn't be saved."); return; }
    const a = document.createElement("a"); a.href = URL.createObjectURL(b);
    a.download = `${(file.address ?? file.personName).split(",")[0]} - ${t?.name ?? "post"}.png`.replace(/[\\/:*?"<>|]+/g, " ");
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }, "image/png");

  return (
    <Modal title="Make an Instagram post" onClose={onClose} wide>
      {!templates.length ? (
        <p className="text-sm">No post templates yet. Add your Canva designs in <Link href="/admin/post-templates" className="link">Admin → Features → Post templates</Link>.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-3 text-sm">
            <label className="label">Template<select className="input" value={tid} onChange={(e) => setTid(e.target.value)}>{templates.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
            {t?.photo && (
              <div>
                <span className="label">House photo</span>
                <div className="flex flex-wrap gap-1.5">
                  {theirs.map((d) => <button key={d.id} type="button" className={`chip ${photo === `/api/documents/${d.id}/raw` ? "bg-accent text-white" : "hover:bg-misty"}`} onClick={() => setPhoto(`/api/documents/${d.id}/raw`)} title={d.name}>📷 {d.name.length > 28 ? `${d.name.slice(0, 26)}…` : d.name}</button>)}
                  <label className="chip cursor-pointer hover:bg-misty">⬆ Upload a photo<input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) setPhoto(URL.createObjectURL(f)); }} /></label>
                </div>
                {!theirs.length && <p className="mt-1 text-xs muted">No photos on their Files card; upload one.</p>}
              </div>
            )}
            {fields.map((f) => (
              <label key={f} className="label">{POST_FIELDS[f]}
                {f === "review" ? <textarea className="input min-h-28 font-normal" value={values[f] ?? ""} onChange={(e) => setValues({ ...values, [f]: e.target.value })} placeholder="Paste the review" />
                  : <input className="input" value={values[f] ?? ""} onChange={(e) => setValues({ ...values, [f]: e.target.value })} />}
              </label>
            ))}
          </div>
          <div className="flex flex-col gap-2">
            <canvas ref={canvas} className="w-full border border-misty" />
            {error && <p role="alert" className="text-sm text-bad">{error}</p>}
            <div className="flex justify-end gap-2"><button type="button" className="btn" onClick={onClose}>Close</button><button type="button" className="btn btn-primary" disabled={!t} onClick={download}>Download post</button></div>
          </div>
        </div>
      )}
    </Modal>
  );
}
