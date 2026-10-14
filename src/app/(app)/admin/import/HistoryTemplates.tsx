"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { importHistory, importTemplates, previewTemplates, removeImportedHistory, removeImportedTemplates } from "./historyActions";

type Row = { key: string; kind: "email" | "text"; name: string; folder: string; subject: string; preview: string; unknown: string[]; skip: string | null };

/** Steps 5 and 6: copy FUB email/text templates, and contacts' notes, calls and texts (SPEC.md §15). */
export function HistoryTemplates({ people, copied, copiedTemplates }: { people: number; copied: number; copiedTemplates: number }) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [confirm, setConfirm] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ next: number; total: number; added: number } | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<void>) => start(async () => { setError(""); setNote(""); try { await fn(); } catch (e) { setError((e as Error).message); } });
  const twoStep = (id: string, fn: () => Promise<void>) => { if (confirm !== id) { setConfirm(id); return; } setConfirm(null); run(fn); };

  const toAdd = rows?.filter((r) => !r.skip) ?? [];
  const unknown = [...new Set(toAdd.flatMap((r) => r.unknown))];
  const cell = "px-2 py-1.5 align-top";
  return (
    <div className="mt-4 flex flex-col gap-4">
      <section className="card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-bold">5 · Email and text templates</h2>
          <span className="text-sm muted">{copiedTemplates ? `${copiedTemplates} copied so far.` : "Your FUB templates, with merge fields converted."}</span>
          <button type="button" className="btn ml-auto" disabled={pending} onClick={() => run(async () => { const r = await previewTemplates(); if (!r.ok) throw new Error(r.error); setRows(r.data!.rows); })}>Preview templates</button>
        </div>
        {rows && (
          <div className="mt-3 flex flex-col gap-2">
            <p className="text-sm"><b>{toAdd.filter((r) => r.kind === "email").length}</b> email and <b>{toAdd.filter((r) => r.kind === "text").length}</b> text templates will be added · {rows.length - toAdd.length} skipped (already in HQ).</p>
            {unknown.length > 0 && <p className="rounded-md bg-sunken px-3 py-2 text-sm">These FUB merge fields have no HQ match and stay as typed, so edit them after copying: <b>{unknown.join(", ")}</b></p>}
            <div className="max-h-96 overflow-auto"><table className="w-full text-sm">
              <thead className="sticky top-0 bg-white"><tr className="text-left text-xs muted"><th className={cell}>Type</th><th className={cell}>Folder</th><th className={cell}>Name</th><th className={cell}>Starts with</th><th className={cell}></th></tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={r.key} className={`border-t border-misty ${r.skip ? "opacity-50" : ""}`}>
                  <td className={cell}>{r.kind === "email" ? "Email" : "Text"}</td><td className={cell}>{r.folder || "—"}</td>
                  <td className={`${cell} font-semibold`}>{r.name}{r.subject && <span className="block text-xs font-normal muted">Subject: {r.subject}</span>}</td>
                  <td className={`${cell} text-xs muted`}>{r.preview}{r.preview.length >= 160 ? "…" : ""}</td>
                  <td className={`${cell} text-xs`}>{r.skip ?? ""}</td>
                </tr>
              ))}</tbody>
            </table></div>
            <div className="flex justify-end">
              <button type="button" className="btn btn-primary" disabled={pending || !toAdd.length} onBlur={() => setConfirm(null)}
                onClick={() => twoStep("tpl", async () => { const r = await importTemplates(); if (!r.ok) throw new Error(r.error); setNote(`Copied ${r.data!.added} templates. They're in Admin → Text & email templates.`); setRows(null); router.refresh(); })}>
                {confirm === "tpl" ? `Click again to copy ${toAdd.length}` : `Copy ${toAdd.length} templates`}
              </button>
            </div>
          </div>
        )}
        {copiedTemplates > 0 && (
          <button type="button" className="mt-2 text-xs font-semibold text-bad hover:underline" disabled={pending} onBlur={() => setConfirm(null)}
            onClick={() => twoStep("rmtpl", async () => { const r = await removeImportedTemplates(); if (!r.ok) throw new Error(r.error); setNote(`Removed ${r.data!.removed} copied templates.`); router.refresh(); })}>
            {confirm === "rmtpl" ? "Click again: removes every template copied from FUB, including edits made since" : "Remove copied templates"}
          </button>
        )}
      </section>

      <section className="card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-bold">6 · Notes, calls and texts</h2>
          <span className="text-sm muted">For your {people.toLocaleString()} imported contacts (not the realtor database).{copied ? ` ${copied.toLocaleString()} copied so far.` : ""}</span>
          <button type="button" className="btn btn-primary ml-auto" disabled={pending || !people} onBlur={() => setConfirm(null)}
            onClick={() => twoStep("hist", async () => {
              let offset = 0, added = 0;
              for (;;) {
                const r = await importHistory({ offset });
                if (!r.ok) throw new Error(`${r.error} (${added.toLocaleString()} copied before this; click again to continue.)`);
                offset = r.data!.next; added += r.data!.added;
                setProgress({ next: offset, total: r.data!.total, added });
                if (r.data!.done) break;
              }
              setNote(`Done: copied ${added.toLocaleString()} notes, calls and texts onto timelines.`); router.refresh();
            })}>
            {confirm === "hist" ? "Click again to start (keep this tab open)" : copied ? "Copy again (adds only what's new)" : "Copy history"}
          </button>
        </div>
        <p className="mt-1 text-xs muted">Copies each contact&apos;s FUB notes, calls and texts with their original dates; last text and last contact update too. Takes a few minutes; keep this tab open. Running it again never adds anything twice.</p>
        {progress && (
          <div className="mt-3">
            <div className="h-2 overflow-hidden rounded bg-sunken"><div className="h-full bg-accent" style={{ width: `${Math.round((progress.next / Math.max(1, progress.total)) * 100)}%` }} /></div>
            <p className="mt-1 text-xs muted">{progress.next.toLocaleString()} of {progress.total.toLocaleString()} contacts · {progress.added.toLocaleString()} entries copied</p>
          </div>
        )}
        {copied > 0 && (
          <button type="button" className="mt-2 text-xs font-semibold text-bad hover:underline" disabled={pending} onBlur={() => setConfirm(null)}
            onClick={() => twoStep("rmhist", async () => { const r = await removeImportedHistory(); if (!r.ok) throw new Error(r.error); setNote(`Removed ${r.data!.removed.toLocaleString()} copied entries.`); router.refresh(); })}>
            {confirm === "rmhist" ? "Click again to remove all copied history" : "Remove copied history"}
          </button>
        )}
      </section>
      {error && <p role="alert" className="text-sm text-bad">{error}</p>}
      {note && <p role="status" className="text-sm text-accent">{note}</p>}
    </div>
  );
}
