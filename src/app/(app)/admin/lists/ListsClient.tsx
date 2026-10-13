"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ListEditor, type Item } from "../ListEditor";
import { SaveBar } from "@/components/SaveBar";
import { saveFollowUp, saveNamedList } from "../actions";

const strip = (items: Item[]) => items.map(({ id, name }) => ({ id, name }));

export function ListsClient({ stages, sources, follow }: { stages: Item[]; sources: Item[]; follow: number[] }) {
  return (
    <>
      <ListEditor title="Lead stages" help="Where someone sits in your database." items={stages} addLabel="New stage" countLabel="people" onSave={(r) => saveNamedList("stage", strip(r))} />
      <ListEditor title="Sources" help="How someone found you." items={sources} addLabel="New source" countLabel="people" onSave={(r) => saveNamedList("source", strip(r))} />
      <FollowUpEditor initial={follow} />
    </>
  );
}

function FollowUpEditor({ initial }: { initial: number[] }) {
  const [days, setDays] = useState(initial);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const dirty = days.join() !== initial.join();
  return (
    <section className="card mb-4">
      <div className="border-b border-misty px-4 py-3"><h2 className="font-bold">Follow-up frequency</h2><p className="text-sm muted">How often to stay in touch. People past their frequency show in Due for a touch.</p></div>
      <div className="flex flex-wrap gap-2 px-4 py-3">
        {days.map((d) => <span key={d} className="chip">Every {d} days<button type="button" aria-label={`Remove ${d} days`} className="muted hover:text-bad" onClick={() => setDays(days.filter((x) => x !== d))}>×</button></span>)}
      </div>
      <form className="flex gap-2 border-t border-misty px-4 py-3" onSubmit={(e) => { e.preventDefault(); const n = parseInt(draft, 10); if (n > 0 && !days.includes(n)) setDays([...days, n].sort((a, b) => a - b)); setDraft(""); }}>
        <input className="input max-w-[140px]" type="number" min={1} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Days" aria-label="New follow-up days" />
        <button className="btn">+ Add</button>
      </form>
      <SaveBar dirty={dirty} pending={pending} error={error} onDiscard={() => { setDays(initial); setError(""); }}
        onSave={() => start(async () => { const r = await saveFollowUp(days); if (!r.ok) setError(r.error); else { setError(""); router.refresh(); } })} />
    </section>
  );
}
