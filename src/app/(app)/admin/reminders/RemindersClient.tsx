"use client";

import { SaveBar } from "@/components/SaveBar";
import { saveDateReminders } from "../actions";
import { useRows } from "../useRows";

type Row = { id?: string; dateKind: string; title: string; days: number; direction: string; assignee: string; kind: string; appliesTo: string };

export function RemindersClient({ reminders, stages, team }: { reminders: Row[]; stages: string[]; team: string[] }) {
  const t = useRows(reminders, (rows) => saveDateReminders(rows as never));
  const sel = "input w-auto";
  return (
    <section className="card overflow-x-auto">
      <table className="w-full min-w-[820px] text-sm">
        <thead><tr className="border-b border-misty text-left text-xs muted">
          {["Date", "Task", "When", "Assigned to", "Kind", "Applies to", ""].map((h) => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}
        </tr></thead>
        <tbody>
          {t.rows.map((r, i) => (
            <tr key={r.id ?? `new${i}`} className="border-b border-misty/60 last:border-0">
              <td className="px-3 py-2"><select aria-label="Date" className={sel} value={r.dateKind} onChange={(e) => t.patch(i, { dateKind: e.target.value })}><option value="birthday">Birthday</option><option value="homeiversary">Homeiversary</option></select></td>
              <td className="px-3 py-2"><input aria-label="Task" className="input" value={r.title} onChange={(e) => t.patch(i, { title: e.target.value })} /></td>
              <td className="px-3 py-2 whitespace-nowrap">
                {r.direction !== "on" && <input aria-label="Days" type="number" min={0} max={365} className="input mr-1 w-16" value={r.days} onChange={(e) => t.patch(i, { days: Number(e.target.value) })} />}
                <select aria-label="Before, on or after" className={sel} value={r.direction} onChange={(e) => t.patch(i, { direction: e.target.value, days: e.target.value === "on" ? 0 : r.days || 7 })}>
                  <option value="before">days before</option><option value="on">on the day</option><option value="after">days after</option>
                </select>
              </td>
              <td className="px-3 py-2"><select aria-label="Assigned to" className={sel} value={r.assignee} onChange={(e) => t.patch(i, { assignee: e.target.value })}>
                <option value="">Person&apos;s assignee</option>{team.map((n) => <option key={n}>{n}</option>)}
              </select></td>
              <td className="px-3 py-2"><select aria-label="Kind" className={sel} value={r.kind} onChange={(e) => t.patch(i, { kind: e.target.value })}><option value="task">Task</option><option value="text">Text</option><option value="email">Email</option></select></td>
              <td className="px-3 py-2"><select aria-label="Applies to" className={sel} value={r.appliesTo} onChange={(e) => t.patch(i, { appliesTo: e.target.value })}>
                <option value="Everyone">Everyone</option>{stages.map((s) => <option key={s} value={s}>{s}</option>)}
              </select></td>
              <td className="px-3 py-2 whitespace-nowrap">
                <button type="button" className="btn px-2" aria-label="Move up" disabled={i === 0} onClick={() => t.move(i, -1)}>↑</button>{" "}
                <button type="button" className="btn px-2" aria-label="Move down" disabled={i === t.rows.length - 1} onClick={() => t.move(i, 1)}>↓</button>{" "}
                <button type="button" className="btn px-2 text-bad" aria-label={`Remove ${r.title}`} onClick={() => t.remove(i)}>×</button>
              </td>
            </tr>
          ))}
          {t.rows.length === 0 && <tr><td colSpan={7} className="px-3 py-6 text-center muted">No reminders. Birthdays and homeiversaries won&apos;t create tasks.</td></tr>}
        </tbody>
      </table>
      <div className="border-t border-misty px-3 py-3">
        <button type="button" className="btn" onClick={() => t.add({ dateKind: "birthday", title: "New reminder", days: 7, direction: "before", assignee: "", kind: "task", appliesTo: "Everyone" })}>+ Add reminder</button>
      </div>
      <SaveBar dirty={t.dirty} pending={t.pending} error={t.error} onDiscard={t.discard} onSave={t.save} />
    </section>
  );
}
