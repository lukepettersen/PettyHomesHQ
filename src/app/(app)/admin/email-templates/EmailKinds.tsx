"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { SaveBar } from "@/components/SaveBar";
import { saveEmailKinds } from "../actions";

/** Admin → Email templates: the kinds of mass email people can unsubscribe from one at a time (owner request 2026-11-02). */
export function EmailKinds({ initial }: { initial: string[] }) {
  const [kinds, setKinds] = useState(initial);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const dirty = kinds.join("|") !== initial.join("|");
  return (
    <section className="card mb-4">
      <div className="border-b border-misty px-4 py-3">
        <h2 className="font-bold">Kinds of mass email</h2>
        <p className="text-sm muted">Each mass email picks one. The unsubscribe link lets people turn off just the kinds they don&apos;t want (or everything); they get tagged &quot;Unsubscribed: kind&quot;. Renaming a kind starts it fresh, so keep names steady.</p>
      </div>
      <div className="flex flex-wrap gap-2 px-4 py-3">
        {kinds.map((k) => <span key={k} className="chip">{k}<button type="button" aria-label={`Remove ${k}`} className="muted hover:text-bad" onClick={() => setKinds(kinds.filter((x) => x !== k))}>×</button></span>)}
      </div>
      <form className="flex gap-2 border-t border-misty px-4 py-3" onSubmit={(e) => { e.preventDefault(); const k = draft.trim(); if (k && !kinds.some((x) => x.toLowerCase() === k.toLowerCase())) setKinds([...kinds, k]); setDraft(""); }}>
        <input className="input max-w-xs" value={draft} maxLength={40} onChange={(e) => setDraft(e.target.value)} placeholder="e.g. Pie Day & events" aria-label="New kind of email" />
        <button className="btn">+ Add</button>
      </form>
      <SaveBar dirty={dirty} pending={pending} error={error} onDiscard={() => { setKinds(initial); setError(""); }}
        onSave={() => start(async () => { const r = await saveEmailKinds(kinds); if (!r.ok) setError(r.error); else { setError(""); router.refresh(); } })} />
    </section>
  );
}
