"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { shortDay } from "@/lib/files";
import { SOCIAL_SLOTS, starterPost, type SocialPost, type SocialPosts as Posts, type SocialSlot } from "@/lib/social";
import { saveSocialPost } from "../../pipeline/actions";

/** Social post descriptions on a deal (owner request 2026-10-29): "Needs your edit" until marked ready, then Copy for posting. */
export function SocialPosts({ fileId, kind, posts, address, price }: { fileId: string; kind: "buyer" | "listing"; posts: Posts; address: string | null; price: number | null }) {
  return (
    <div className="mt-3 flex flex-col gap-2">
      {SOCIAL_SLOTS[kind].map(({ slot, label }) => <SocialBox key={slot + (posts[slot]?.at ?? "")} fileId={fileId} slot={slot} label={label} post={posts[slot]} starter={starterPost(slot, kind, { address, price })} />)}
    </div>
  );
}

function SocialBox({ fileId, slot, label, post: saved, starter }: { fileId: string; slot: SocialSlot; label: string; post?: SocialPost; starter: string }) {
  // An empty slot with a starter caption shows it, unsaved, as needing your edit (owner 2026-10-29).
  const post = saved ?? (starter ? { text: starter, ready: false, at: null, by: null } : undefined);
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(post?.text ?? "");
  const [ready, setReady] = useState(post?.ready ?? false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const save = (r: boolean, t = text) => start(async () => {
    const res = await saveSocialPost({ id: fileId, slot, text: t, ready: r });
    if (!res.ok) { setError(res.error); return; }
    setError(""); setEditing(false); router.refresh();
  });
  const cancel = () => { setText(post?.text ?? ""); setReady(post?.ready ?? false); setError(""); setEditing(false); };
  const copy = async () => { try { await navigator.clipboard.writeText(post?.text ?? ""); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { setError("Couldn't copy. Select the text and copy it instead."); } };

  if (editing) return (
    <div className="rounded-lg border border-misty bg-white p-3">
      <label className="label">{label} description
        <textarea className="input min-h-28 font-normal" autoFocus value={text} placeholder="The caption for the post, e.g. Congrats to the Larsons on going under contract on this Edina rambler!"
          onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") cancel(); }} />
      </label>
      <label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={ready} onChange={(e) => setReady(e.target.checked)} /> Wording is right: ready to post</label>
      {error && <p role="alert" className="mt-1 text-sm text-bad">{error}</p>}
      <div className="mt-2 flex justify-end gap-2">
        <button type="button" className="btn" onClick={cancel} disabled={pending}>Cancel</button>
        <button type="button" className="btn btn-primary" onClick={() => save(ready)} disabled={pending || (!!saved && text.trim() === saved.text && ready === saved.ready)}>{pending ? "Saving…" : "Save"}</button>
      </div>
    </div>
  );
  if (!post) return <button type="button" className="self-start text-sm font-semibold text-accent hover:underline" onClick={() => setEditing(true)}>+ Add {label} description</button>;
  const when = post.at ? `${shortDay(post.at.slice(0, 10))}${post.by ? ` by ${post.by.split(" ")[0]}` : ""}` : "Starter caption, not saved yet";
  return (
    <div className={`rounded-lg border px-3 py-2 ${post.ready ? "border-misty bg-white" : "border-[#ecc9b6] bg-[#fbf0ea]"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide muted">{label}
          <span className={`rounded-full px-2 py-px text-[11px] normal-case tracking-normal ${post.ready ? "bg-accent-soft text-accent" : "bg-[#f6e3d9] text-[#9a4f2e]"}`}>{post.ready ? "Ready to post" : "Needs your edit"}</span>
        </span>
        <span className="flex items-center gap-2 text-xs">
          <span className="muted">{when}</span>
          {!post.ready && <button type="button" className="font-semibold text-accent hover:underline" disabled={pending} onClick={() => save(true, post.text)}>Mark ready</button>}
          <button type="button" className="font-semibold text-accent hover:underline" onClick={copy}>{copied ? "Copied" : "Copy"}</button>
          <button type="button" className="font-semibold text-accent hover:underline" onClick={() => setEditing(true)}>Edit</button>
        </span>
      </div>
      <p className="mt-1 whitespace-pre-wrap text-sm">{post.text}</p>
      {error && <p role="alert" className="mt-1 text-sm text-bad">{error}</p>}
    </div>
  );
}
