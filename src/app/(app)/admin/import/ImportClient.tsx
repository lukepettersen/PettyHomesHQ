"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { PARTNER_TYPES, partnerLabel } from "@/lib/partners";
import type { HqPerson, Plan, Summary, TagRule } from "@/lib/fubImport";
import { addPartnersToImported, loadFub, previewImport, runImport, savePlan, undoImport } from "./actions";

type Hq = { stages: string[]; sources: string[]; users: { id: string; name: string }[] };
type Batch = { id: string; at: string; added: number; duplicates: number; undone: boolean };
type Preview = { total: number; willAdd: number; skipped: number; duplicates: number; byStage: Record<string, number>; byType: Record<string, number>; samples: HqPerson[] };
const FOLLOW = [7, 14, 30, 60, 90, 180, 365];
const when = (iso: string) => new Date(iso).toLocaleString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** Admin → Import from Follow Up Boss: load, match, preview, import, undo (SPEC.md §15). */
export function ImportClient({ keySet, loadedAt, summary, plan: initial, planSaved, hq, batches }: {
  keySet: boolean; loadedAt: string | null; summary: Summary; plan: Plan; planSaved: boolean; hq: Hq; batches: Batch[];
}) {
  const router = useRouter();
  const [plan, setPlan] = useState(initial);
  const [dirty, setDirty] = useState(!planSaved);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [progress, setProgress] = useState<{ next: number; total: number; added: number; dupes: number } | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const edit = (p: Plan) => { setPlan(p); setDirty(true); setPreview(null); };
  const run = (fn: () => Promise<void>) => start(async () => { setError(""); setNote(""); try { await fn(); } catch (e) { setError((e as Error).message); } });

  const load = () => run(async () => { const r = await loadFub(); if (!r.ok) throw new Error(r.error); setNote(`Loaded ${r.data!.count.toLocaleString()} people from Follow Up Boss.`); router.refresh(); });
  const save = () => run(async () => { const r = await savePlan(plan); if (!r.ok) throw new Error(r.error); setDirty(false); setNote("Matching saved."); });
  const showPreview = () => run(async () => { const r = await previewImport(); if (!r.ok) throw new Error(r.error); setPreview(r.data!); });
  const doImport = () => {
    if (confirm !== "import") { setConfirm("import"); return; }
    setConfirm(null);
    run(async () => {
      let batchId: string | null = null, offset = 0, added = 0, dupes = 0;
      for (;;) {
        const r = await runImport({ batchId, offset });
        if (!r.ok) throw new Error(`${r.error} (${added} added before this; Undo removes them.)`);
        batchId = r.data!.batchId; offset = r.data!.next; added += r.data!.added; dupes += r.data!.dupes;
        setProgress({ next: offset, total: r.data!.total, added, dupes });
        if (r.data!.done) break;
      }
      setNote(`Done: added ${added.toLocaleString()} people. ${dupes.toLocaleString()} were already in HQ and were left alone.`);
      setPreview(null); router.refresh();
    });
  };
  const addPartners = () => run(async () => {
    const r = await addPartnersToImported(); if (!r.ok) throw new Error(r.error);
    setNote(`Added a spouse/partner to ${r.data!.updated.toLocaleString()} contacts.${r.data!.kept ? ` ${r.data!.kept.toLocaleString()} were left as is (already a couple, or renamed in HQ).` : ""}`); router.refresh();
  });
  const undo = (id: string) => {
    if (confirm !== id) { setConfirm(id); return; }
    setConfirm(null);
    run(async () => { const r = await undoImport(id); if (!r.ok) throw new Error(r.error); setNote(`Undone: removed ${r.data!.removed.toLocaleString()} people.`); router.refresh(); });
  };

  const stageOptions = [...new Set([...hq.stages, ...Object.values(plan.stages).map((r) => r.stage).filter(Boolean)])];
  const cell = "px-2 py-1.5 align-middle";
  return (
    <div className="flex flex-col gap-4">
      {/* Step 1 */}
      <section className="card p-4">
        <h2 className="font-bold">1 · Load from Follow Up Boss</h2>
        {!keySet ? <p className="mt-1 text-sm text-bad">Add <code>FUB_API_KEY</code> in Railway → your HQ app → Variables, then reload this page.</p> : (
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <span className="text-sm">{loadedAt ? <>Loaded <b>{summary.total.toLocaleString()}</b> people · {when(loadedAt)}</> : "Not loaded yet."}</span>
            <button type="button" className="btn btn-primary ml-auto" disabled={pending} onClick={load}>{pending && !progress ? "Loading… (up to a few minutes)" : loadedAt ? "Load again" : "Load my contacts"}</button>
          </div>
        )}
      </section>

      {summary.total > 0 && (<>
        {/* Step 2 */}
        <section className="card p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-bold">2 · Match</h2>
            <span className="text-sm muted">Suggestions come from your decisions; change anything, then Save.</span>
            <button type="button" className="btn btn-primary ml-auto" disabled={pending || !dirty} onClick={save}>{dirty ? "Save matching" : "Saved"}</button>
          </div>
          <p className="mt-2 rounded-md bg-sunken px-3 py-2 text-sm">Anyone with the FUB tag <b>Past Client</b> becomes stage <b>Past Client</b>, keeping the follow-up from their stage below. Partners become the type set on their stage, unless their source or a tag below says Lender, Title, etc.</p>

          <h3 className="mt-4 text-sm font-bold">Custom fields</h3>
          {summary.custom.length === 0 ? <p className="text-sm muted">No custom fields have values in Follow Up Boss.</p> : (() => {
            const f = plan.fields;
            const pick = (label: string, value: string, set: (v: string) => void) => (
              <label className="flex items-center gap-2 border-t border-misty py-1.5 text-sm">
                <span className="w-36 font-semibold">{label}</span>
                <select aria-label={`${label} comes from`} className="input" value={value} onChange={(e) => set(e.target.value)}>
                  <option value="">Nothing (leave blank)</option>
                  {summary.custom.map(([l, n]) => <option key={l} value={l}>FUB “{l}” · {n.toLocaleString()} filled in</option>)}
                </select>
              </label>
            );
            return (
              <div className="flex flex-col">
                {pick("Mailing name", f.mailingName, (v) => edit({ ...plan, fields: { ...f, mailingName: v } }))}
                {pick("Homeiversary", f.homeiversary, (v) => edit({ ...plan, fields: { ...f, homeiversary: v } }))}
                {pick("Referred by", f.referredBy, (v) => edit({ ...plan, fields: { ...f, referredBy: v } }))}
                <div className="flex items-start gap-2 border-t border-misty py-1.5 text-sm">
                  <span className="w-36 pt-1 font-semibold">Birthdays</span>
                  <div className="flex flex-1 flex-wrap gap-x-4 gap-y-1">
                    {summary.custom.map(([l, n]) => (
                      <label key={l} className="flex items-center gap-1.5"><input type="checkbox" checked={f.birthdays.includes(l)}
                        onChange={(e) => edit({ ...plan, fields: { ...f, birthdays: e.target.checked ? [...f.birthdays, l] : f.birthdays.filter((x) => x !== l) } })} /> {l} <span className="muted">{n.toLocaleString()}</span></label>
                    ))}
                  </div>
                </div>
                <p className="border-t border-misty pt-1.5 text-xs muted">Addresses come from each person&apos;s address in Follow Up Boss. The first birthday is labeled with their first name; the others can be named on the contact page.</p>
              </div>
            );
          })()}

          <h3 className="mt-4 text-sm font-bold">Relationships (spouse, partner…)</h3>
          {summary.relTypes.length === 0 ? (
            <p className="text-sm muted">No relationships in the loaded copy.{loadedAt ? " If your contacts have spouses or partners in Follow Up Boss, click Load again above to bring them in." : ""}</p>
          ) : (
            <div className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
              {summary.relTypes.map(([t, n]) => (
                <label key={t} className="flex items-center gap-2 border-t border-misty py-1.5 text-sm">
                  <span className="flex-1"><b>{t}</b> <span className="muted">{n.toLocaleString()}</span></span>
                  <select aria-label={`Relationship ${t}`} className="input w-56" value={plan.relationships?.[t] ?? "skip"} onChange={(e) => edit({ ...plan, relationships: { ...plan.relationships, [t]: e.target.value as "merge" | "skip" } })}>
                    <option value="merge">Join their contact (Sam &amp; Lena)</option><option value="skip">Leave out</option>
                  </select>
                </label>
              ))}
            </div>
          )}

          <h3 className="mt-4 text-sm font-bold">Stages</h3>
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead><tr className="text-left text-xs muted"><th className={cell}>FUB stage</th><th className={cell}>People</th><th className={cell}>Becomes HQ stage</th><th className={cell}>Follow-up</th><th className={cell}>Partner type</th></tr></thead>
            <tbody>{summary.stages.map(([st, n]) => {
              const r = plan.stages[st];
              const set = (p: Partial<typeof r>) => edit({ ...plan, stages: { ...plan.stages, [st]: { ...r, ...p } } });
              return (
                <tr key={st} className="border-t border-misty">
                  <td className={`${cell} font-semibold`}>{st}</td><td className={cell}>{n.toLocaleString()}</td>
                  <td className={cell}>
                    <select aria-label={`${st} becomes`} className="input" value={r.action === "skip" ? "" : r.stage} onChange={(e) => set(e.target.value ? { action: "import", stage: e.target.value } : { action: "skip" })}>
                      <option value="">Skip (don&apos;t import)</option>
                      {stageOptions.map((s) => <option key={s} value={s}>{hq.stages.includes(s) ? s : `${s} (new stage)`}</option>)}
                    </select>
                  </td>
                  <td className={cell}>
                    <select aria-label={`${st} follow-up`} className="input" disabled={r.action === "skip"} value={r.followUp ?? ""} onChange={(e) => set({ followUp: e.target.value ? Number(e.target.value) : null })}>
                      <option value="">None</option>{[...new Set([...FOLLOW, ...(r.followUp ? [r.followUp] : [])])].sort((a, b) => a - b).map((d) => <option key={d} value={d}>Every {d} days</option>)}
                    </select>
                  </td>
                  <td className={cell}>
                    <select aria-label={`${st} partner type`} className="input" disabled={r.action === "skip"} value={r.type ?? ""} onChange={(e) => set({ type: e.target.value || null })}>
                      <option value="">Not a partner</option>{PARTNER_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                    </select>
                  </td>
                </tr>
              );
            })}</tbody>
          </table></div>

          <h3 className="mt-4 text-sm font-bold">Tags</h3>
          <div className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
            {summary.tags.map(([t, n]) => (
              <label key={t} className="flex items-center gap-2 border-t border-misty py-1.5 text-sm">
                <span className="min-w-0 flex-1 truncate" title={t}><b>{t}</b> <span className="muted">{n.toLocaleString()}</span></span>
                <select aria-label={`Tag ${t}`} className="input w-44" value={plan.tags[t]} onChange={(e) => edit({ ...plan, tags: { ...plan.tags, [t]: e.target.value as TagRule } })}>
                  <option value="keep">Keep as tag</option><option value="skip">Skip</option>
                  {PARTNER_TYPES.map(([k, l]) => <option key={k} value={`type:${k}`}>Means type: {l}</option>)}
                </select>
              </label>
            ))}
          </div>

          {summary.sources.length > 0 && (<>
            <h3 className="mt-4 text-sm font-bold">Sources</h3>
            <datalist id="hq-sources">{hq.sources.map((s) => <option key={s} value={s} />)}</datalist>
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead><tr className="text-left text-xs muted"><th className={cell}>FUB source</th><th className={cell}>People</th><th className={cell}>HQ source</th><th className={cell}>Partner type (for partners)</th></tr></thead>
              <tbody>{summary.sources.map(([src, n]) => {
                const r = plan.sources[src];
                const set = (p: Partial<typeof r>) => edit({ ...plan, sources: { ...plan.sources, [src]: { ...r, ...p } } });
                return (
                  <tr key={src} className="border-t border-misty">
                    <td className={`${cell} font-semibold`}>{src}</td><td className={cell}>{n.toLocaleString()}</td>
                    <td className={cell}><input aria-label={`${src} becomes source`} list="hq-sources" className="input" value={r.source} placeholder="Leave blank" onChange={(e) => set({ source: e.target.value })} /></td>
                    <td className={cell}>
                      <select aria-label={`${src} partner type`} className="input" value={r.type ?? ""} onChange={(e) => set({ type: e.target.value || null })}>
                        <option value="">Use the stage&apos;s type</option>{PARTNER_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                      </select>
                    </td>
                  </tr>
                );
              })}</tbody>
            </table></div>
          </>)}

          {summary.agents.length > 0 && (<>
            <h3 className="mt-4 text-sm font-bold">Assigned agent</h3>
            <div className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
              {summary.agents.map(([a, n]) => (
                <label key={a} className="flex items-center gap-2 border-t border-misty py-1.5 text-sm">
                  <span className="flex-1"><b>{a}</b> <span className="muted">{n.toLocaleString()}</span></span>
                  <select aria-label={`Agent ${a}`} className="input w-48" value={plan.agents[a] ?? ""} onChange={(e) => edit({ ...plan, agents: { ...plan.agents, [a]: e.target.value || null } })}>
                    <option value="">Nobody</option>{hq.users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </label>
              ))}
            </div>
          </>)}
        </section>

        {/* Step 3 */}
        <section className="card p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-bold">3 · Preview</h2>
            <span className="text-sm muted">{dirty ? "Save the matching to preview." : "See exactly what will be added."}</span>
            <button type="button" className="btn ml-auto" disabled={pending || dirty} onClick={showPreview}>Preview</button>
          </div>
          {preview && (
            <div className="mt-3 flex flex-col gap-3">
              <p className="text-sm">
                <b>{preview.willAdd.toLocaleString()}</b> will be added · {preview.duplicates.toLocaleString()} already in HQ (left alone) · {preview.skipped.toLocaleString()} skipped by stage.
                {" "}{Object.entries(preview.byStage).map(([k, n]) => `${k} ${n.toLocaleString()}`).join(" · ")}
                {Object.keys(preview.byType).length > 0 && <> · Partners: {Object.entries(preview.byType).map(([k, n]) => `${partnerLabel(k)} ${n.toLocaleString()}`).join(", ")}</>}
              </p>
              <div className="overflow-x-auto"><table className="w-full text-sm">
                <thead><tr className="text-left text-xs muted"><th className={cell}>Name</th><th className={cell}>Stage</th><th className={cell}>Follow-up</th><th className={cell}>Type</th><th className={cell}>Tags</th><th className={cell}>Contact</th><th className={cell}>Address</th><th className={cell}>Mailing name</th><th className={cell}>Birthdays · homeiversary</th></tr></thead>
                <tbody>{preview.samples.map((p) => (
                  <tr key={p.fubId} className="border-t border-misty align-top">
                    <td className={`${cell} font-semibold`}>{p.name}</td><td className={cell}>{p.stage}</td><td className={cell}>{p.followUpDays ? `${p.followUpDays} days` : "—"}</td>
                    <td className={cell}>{partnerLabel(p.partnerType) ?? "—"}</td><td className={cell}>{p.tags.join(", ") || "—"}</td>
                    <td className={cell}>{[p.emails[0]?.address, p.phones[0]?.number].filter(Boolean).join(" · ") || "—"}</td>
                    <td className={cell}>{p.address || "—"}</td><td className={cell}>{p.mailingName || "—"}</td>
                    <td className={cell}>{[...p.birthdays.map((b) => b.date), ...(p.homeiversary ? [`home ${p.homeiversary}`] : [])].join(", ") || "—"}</td>
                  </tr>
                ))}</tbody>
              </table></div>
            </div>
          )}
        </section>

        {/* Step 4 */}
        <section className="card p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-bold">4 · Import</h2>
            <button type="button" className="btn btn-primary ml-auto" disabled={pending || dirty || !preview} onBlur={() => setConfirm(null)} onClick={doImport}>
              {confirm === "import" ? `Click again to add ${preview?.willAdd.toLocaleString()} people` : preview ? `Import ${preview.willAdd.toLocaleString()} people` : "Preview first"}
            </button>
          </div>
          {progress && (
            <div className="mt-3">
              <div className="h-2 overflow-hidden rounded bg-sunken"><div className="h-full bg-accent" style={{ width: `${Math.round((progress.next / Math.max(1, progress.total)) * 100)}%` }} /></div>
              <p className="mt-1 text-xs muted">{progress.next.toLocaleString()} of {progress.total.toLocaleString()} checked · {progress.added.toLocaleString()} added · {progress.dupes.toLocaleString()} already in HQ</p>
            </div>
          )}
          {batches.some((b) => !b.undone) && summary.relTypes.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md bg-sunken px-3 py-2 text-sm">
              <span className="flex-1">People imported before relationships came over: add their spouse/partner to the contact (name, phone and email).</span>
              <button type="button" className="btn" disabled={pending || dirty} onClick={addPartners}>Add spouses/partners</button>
            </div>
          )}
          {batches.length > 0 && (
            <ul className="mt-3 flex flex-col gap-1 text-sm">
              {batches.map((b) => (
                <li key={b.id} className="flex items-center gap-2 border-t border-misty py-1.5">
                  <span className="flex-1">{when(b.at)} · added {b.added.toLocaleString()}{b.duplicates ? ` · ${b.duplicates.toLocaleString()} already in HQ` : ""}{b.undone ? " · undone" : ""}</span>
                  {!b.undone && <button type="button" className="btn btn-danger" disabled={pending} onBlur={() => setConfirm(null)} onClick={() => undo(b.id)}>{confirm === b.id ? "Click again to remove them" : "Undo import"}</button>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </>)}
      {error && <p role="alert" className="text-sm text-bad">{error}</p>}
      {note && <p role="status" className="text-sm text-accent">{note}</p>}
    </div>
  );
}
