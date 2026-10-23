"use client";

import { useRef, useState } from "react";
import { MAX_TEXT_PHOTOS, TEXT_PHOTO_TYPES } from "@/lib/textMedia";

/**
 * 📷 on the text boxes: picks photos, uploads them to the file storage (the same public image addresses email
 * images use, so Twilio can fetch them) and shows small previews to remove before sending.
 */
export function TextPhotoButton({ photos, onChange, disabled }: { photos: string[]; onChange: (p: string[]) => void; disabled?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pick = async (files: FileList | null) => {
    if (!files?.length) return;
    setError(""); setBusy(true);
    const added: string[] = [];
    try {
      for (const f of Array.from(files).slice(0, MAX_TEXT_PHOTOS - photos.length)) {
        if (!TEXT_PHOTO_TYPES.includes(f.type)) { setError("Use JPG, PNG or GIF photos."); continue; }
        const form = new FormData(); form.append("file", f);
        const r = await fetch("/api/email-images", { method: "POST", body: form });
        const d = (await r.json().catch(() => ({}))) as { url?: string; error?: string };
        if (!r.ok || !d.url) { setError(d.error ?? "The photo didn't upload. Try again."); continue; }
        added.push(d.url);
      }
    } finally {
      setBusy(false); if (input.current) input.current.value = "";
      if (added.length) onChange([...photos, ...added]);
    }
  };
  return (
    <>
      <button type="button" className="btn px-2" aria-label="Add a photo" disabled={disabled || busy || photos.length >= MAX_TEXT_PHOTOS} onClick={() => input.current?.click()}>{busy ? "…" : "📷"}</button>
      <input ref={input} type="file" accept={TEXT_PHOTO_TYPES.join(",")} multiple className="hidden" aria-label="Photos to send" onChange={(e) => void pick(e.target.files)} />
      {error && <span role="alert" className="text-xs text-bad">{error}</span>}
    </>
  );
}

export function TextPhotoPreviews({ photos, onChange }: { photos: string[]; onChange: (p: string[]) => void }) {
  if (!photos.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {photos.map((u) => (
        <span key={u} className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={u} alt="Photo to send" className="h-16 w-16 rounded-md border border-misty object-cover" />
          <button type="button" aria-label="Remove photo" className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-charcoal text-xs text-white" onClick={() => onChange(photos.filter((x) => x !== u))}>×</button>
        </span>
      ))}
    </div>
  );
}
