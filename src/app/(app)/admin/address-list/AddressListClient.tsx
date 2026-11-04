"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { hasAddress, type Group, type Match, type ListRow } from "@/lib/addressList";
import type { PreviewRow } from "@/server/addressList";
import { previewList, saveList, undoList } from "./actions";

type Choice = { action: "match" | "new" | "skip"; personId: string | null; group: Group; useAddress: boolean };
type Filter = "all" | "matched" | "check" | "new";
const HOW: Record<Match["how"], string> = { name: "Same name", address: "Same address", maybe: "Check: same last name" };

/** Matched by name or address → that contact; a "maybe" with a shared first name → that contact; anything else → new. */
function firstChoice(p: PreviewRow): Choice {
  const m = p.matches[0];
  const household = !p.row.last && /^the\s|\bfamily$/i.test(p.row.first);
  const sure = m && (m.how !== "maybe" || (p.row.first && !household && p.matches.length === 1));
  return { action: sure ? "match" : "new", personId: sure ? m.personId : null, group: "", useAddress: true };
}

export function AddressListClient({ stages, imports }: { stages: string[]; imports: { id: string; at: string; added: number; matched: number; undone: boolean }[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<PreviewRow[] | null>(null);
  const [choices, setChoices] = useState<Choice[]>([]);
  const [tags, setTags] = useState({ card: "Holiday card", family: "Family", friend: "Friend", wife: "Wife's friend" });
  const [stage, setStage] = useState(stages.find((s) => /personal/i.test(s)) ?? "Personal");
  const [filter, setFilter] = useState<Filter>("all");
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [confirmUndo, setConfirmUndo] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const read = (file: File | undefined) => {
    if (!file) return;
    start(async () => {
      setError(""); setMsg("");
      const text = await file.text();
      const r = await previewList(text);
      if (!r.ok) { setError(r.error); return; }
      setRows(r.data!); setChoices(r.data!.map(firstChoice)); setFilter("all");
    });
  };
  const kindOf = (p: PreviewRow, c: Choice): Exclude<Filter, "all"> => (c.action === "new" ? (p.matches.length ? "check" : "new") : c.action === "skip" ? "check" : p.matches.find((m) => m.personId === c.personId)?.how === "maybe" ? "check" : "matched");
  const counts = useMemo(() => {
    const c = { all: 0, matched: 0, check: 0, new: 0 };
    rows?.forEach((p, i) => { c.all++; c[kindOf(p, choices[i])]++; });
    return c;
  }, [rows, choices]);
  const shown = (rows ?? []).map((p, i) => ({ p, i })).filter(({ p, i }) => filter === "all" || kindOf(p, choices[i]) === filter);
  const set = (i: number, c: Partial<Choice>) => setChoices((x) => x.map((v, j) => (j === i ? { ...v, ...c } : v)));
  const groupShown = (g: Group) => setChoices((x) => x.map((v, j) => (shown.some((s) => s.i === j) ? { ...v, group: g } : v)));
  const saving = choices.filter((c) => c.action !== "skip").length;

  const save = () => start(async () => {
    setError("");
    const r = await saveList({ rows: rows!.map((p, i) => ({ row: p.row, ...choices[i] })), tags, stage });
    if (!r.ok) { setError(r.error); return; }
    setMsg(`Saved. ${r.data!.added} new contact${r.data!.added === 1 ? "" : "s"} added and ${r.data!.matched} already in HQ, all tagged "${tags.card}". For the cards: on People, filter by that tag, then click Mailing list at the bottom.`);
    setRows(null); setChoices([]); router.refresh();
  });

  return (
    <div className="space-y-4">
      {!rows && (
        <section className="card p-5">
          <h2 className="font-bold">1. Pick the file</h2>
          <p className="mt-1 text-sm muted">A CSV file with a heading row: First Name, Last Name, Display/Household Name, Address Line 1, Address Line 2, City, State, Postal. From Google Sheets: File → Download → Comma-separated values (.csv).</p>
          <label className="btn btn-primary mt-3 inline-flex cursor-pointer">
            {pending ? "Reading…" : "Choose CSV file"}
            <input type="file" accept=".csv,text/csv" className="sr-only" disabled={pending} onChange={(e) => { read(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
        </section>
      )}

      {rows && (
        <>
          <section className="card p-5">
            <h2 className="font-bold">2. Tags and stage</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <label className="label">Tag for everyone on the list<input className="input mt-1" value={tags.card} onChange={(e) => setTags({ ...tags, card: e.target.value })} /></label>
              <label className="label">Stage for new people<select className="input mt-1" value={stage} onChange={(e) => setStage(e.target.value)}>
                {!stages.includes(stage) && <option value={stage}>{stage} (new)</option>}
                {stages.map((s) => <option key={s} value={s}>{s}</option>)}
              </select></label>
              <span className="hidden lg:block" />
              <label className="label">Family tag<input className="input mt-1" value={tags.family} onChange={(e) => setTags({ ...tags, family: e.target.value })} /></label>
              <label className="label">Friend tag<input className="input mt-1" value={tags.friend} onChange={(e) => setTags({ ...tags, friend: e.target.value })} /></label>
              <label className="label">Wife&apos;s friends tag<input className="input mt-1" value={tags.wife} onChange={(e) => setTags({ ...tags, wife: e.target.value })} /></label>
            </div>
            <p className="mt-2 text-xs muted">New people have no follow-up, so they never show as Due for a touch.</p>
          </section>

          <section className="card p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-bold">3. Check the list</h2>
              <div className="flex flex-wrap gap-1" role="tablist" aria-label="Show">
                {([["all", "All"], ["matched", "Already in HQ"], ["check", "Check these"], ["new", "New"]] as [Filter, string][]).map(([k, l]) => (
                  <button key={k} type="button" role="tab" aria-selected={filter === k} onClick={() => setFilter(k)}
                    className={`rounded-full border px-3 py-0.5 text-sm font-semibold ${filter === k ? "border-accent bg-accent text-white" : "border-misty bg-white hover:bg-sunken"}`}>{l} {counts[k]}</button>
                ))}
              </div>
            </div>
            <p className="mt-1 text-sm muted">&quot;Check these&quot; are possible matches HQ wasn&apos;t sure about. Pick the right contact, or Add as new.</p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <span className="muted">Set the group for these {shown.length}:</span>
              {([["family", tags.family], ["friend", tags.friend], ["wife", tags.wife], ["", "None"]] as [Group, string][]).map(([g, l]) => (
                <button key={g || "none"} type="button" className="btn py-0.5 text-xs" onClick={() => groupShown(g)}>{l}</button>
              ))}
            </div>
            <ul className="mt-3 divide-y divide-misty/70">
              {shown.map(({ p, i }) => <Row key={i} p={p} c={choices[i]} tags={tags} onChange={(c) => set(i, c)} kind={kindOf(p, choices[i])} />)}
              {!shown.length && <li className="py-4 text-sm muted">Nobody here.</li>}
            </ul>
          </section>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <button type="button" className="btn" onClick={() => { setRows(null); setChoices([]); }}>Cancel</button>
            <button type="button" className="btn btn-primary" disabled={pending || !saving} onClick={save}>{pending ? "Saving…" : `Save ${saving} to HQ`}</button>
          </div>
        </>
      )}
      {error && <p role="alert" className="text-sm text-bad">{error}</p>}
      {msg && <p role="status" className="text-sm text-accent">{msg}</p>}

      {imports.length > 0 && (
        <section className="card p-5">
          <h2 className="font-bold">Earlier imports</h2>
          <ul className="mt-2 divide-y divide-misty/70 text-sm">
            {imports.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>{new Date(b.at).toLocaleString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).replace(" AM", "am").replace(" PM", "pm")} · {b.added} added, {b.matched} already in HQ</span>
                {b.undone ? <span className="muted">Undone</span> : (
                  <button type="button" className="btn py-0.5 text-xs text-bad" disabled={pending} onBlur={() => setConfirmUndo(null)}
                    onClick={() => confirmUndo === b.id ? start(async () => { const r = await undoList(b.id); setConfirmUndo(null); if (!r.ok) setError(r.error); else { setMsg(`Undone: removed ${r.data!.removed} people it added, and took its tags and addresses back off the others.`); router.refresh(); } }) : setConfirmUndo(b.id)}>
                    {confirmUndo === b.id ? "Click again to undo" : "Undo"}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Row({ p, c, tags, kind, onChange }: { p: PreviewRow; c: Choice; tags: Record<"family" | "friend" | "wife", string>; kind: string; onChange: (c: Partial<Choice>) => void }) {
  const m = p.matches.find((x) => x.personId === c.personId);
  const differs = c.action === "match" && m && m.addresses.length > 0 && !hasAddress(m.addresses, p.row as ListRow);
  return (
    <li className={`grid gap-2 py-2.5 md:grid-cols-[1.3fr_1.4fr_1.3fr_0.8fr] md:items-start ${c.action === "skip" ? "opacity-50" : ""}`}>
      <div className="min-w-0">
        <b className="block">{p.name}</b>
        {p.row.household && p.row.household !== p.name && <span className="block text-xs muted">Mail to: {p.row.household}</span>}
      </div>
      <div className="text-sm">{p.address}</div>
      <div>
        <select aria-label={`In HQ: ${p.name}`} className={`input w-full text-sm ${kind === "check" ? "border-[#c9822b]" : ""}`} value={c.action === "match" ? c.personId ?? "" : c.action}
          onChange={(e) => { const v = e.target.value; onChange(v === "new" || v === "skip" ? { action: v, personId: null } : { action: "match", personId: v }); }}>
          {p.matches.map((x) => <option key={x.personId} value={x.personId}>{x.name} ({HOW[x.how]})</option>)}
          <option value="new">Add as new contact</option>
          <option value="skip">Skip</option>
        </select>
        {c.action === "match" && m && <span className={`mt-0.5 block text-xs ${m.how === "maybe" ? "text-[#9a5a14]" : "muted"}`}>{m.how === "maybe" ? "Same last name. Is this them?" : `Already in HQ (${HOW[m.how].toLowerCase()})`}</span>}
        {differs && (
          <label className="mt-1 flex items-start gap-1.5 text-xs">
            <input type="checkbox" checked={c.useAddress} onChange={(e) => onChange({ useAddress: e.target.checked })} />
            <span>HQ has {m!.addresses[0]}. Use the list&apos;s address for mail</span>
          </label>
        )}
      </div>
      <select aria-label={`Group: ${p.name}`} className="input w-full text-sm" value={c.group} disabled={c.action === "skip"} onChange={(e) => onChange({ group: e.target.value as Group })}>
        <option value="">No group</option>
        <option value="family">{tags.family}</option>
        <option value="friend">{tags.friend}</option>
        <option value="wife">{tags.wife}</option>
      </select>
    </li>
  );
}
