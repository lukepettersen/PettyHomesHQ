"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import type { ListRow, TaskRow, TeamMember, TouchRow } from "@/server/tasks";
import { diffDays, formatTime, longIso, parseQuickAdd, PRIORITIES, repeatLabel, WHO_COOKIE } from "@/lib/tasks";
import { completeDateTask, completeTask, createList, deleteList, logTouch, quickAddTask, spreadTouches, unspreadTouches, renameList, reopenTask, setListOnToday } from "./actions";
import { ArrangeLists } from "./ArrangeLists";
import { TaskDetail } from "./TaskDetail";
import { PersonLink, TaskLine, Toast } from "./parts";
import { saveTrail } from "@/components/TaskTrail";

type Props = { today: string; team: TeamMember[]; lists: ListRow[]; tasks: TaskRow[]; touches: TouchRow[]; waiting: number; meId: string; initialView: string; initialWho: string; initialTask: string | null };
type Done = { row: TaskRow; realId: string; nextId: string | null };

const keyOf = (l: ListRow) => l.builtin ?? `list:${l.id}`;
const SUBTITLE: Record<string, string> = {
  clients: "Grouped by client · click a name to open their page",
  touch: "People past their follow-up frequency · Spread out shows only a few a day",
  recurring: "Each one shows up in Today when it's due, then schedules the next",
  dates: "Birthday and homeiversary cards and texts for the next 60 days · rules in Admin → Date reminders",
  misc: "Tasks that aren't linked to a client",
  upcoming: "Everything due after today, from every list, by day",
};
const PLACEHOLDER: Record<string, string> = {
  clients: 'Add a client task, e.g. "call lender re Ortiz Fri 9am"',
  recurring: 'Add a recurring task, e.g. "rent check every month"',
  dates: 'Add a task, e.g. "call Sam re birthday Fri"',
  misc: 'Add a task, e.g. "renew license Fri"',
};
const EMPTY: Record<string, string> = {
  clients: 'No client tasks. Add one with "re" and a name, e.g. "call lender re Ortiz Fri", or add one from their page.',
  recurring: 'Nothing recurring yet. Try "rent check every month".',
  dates: "Nothing coming up. Birthdays and homeiversaries from people's Important Dates show here, using the rules in Admin → Date reminders.",
  misc: "Nothing here. Tasks with no client land in Misc.",
  upcoming: "Nothing scheduled after today.",
};
const sortTasks = (a: TaskRow, b: TaskRow) =>
  (a.due ?? "9999").localeCompare(b.due ?? "9999") || b.priority - a.priority || (a.time ?? "99").localeCompare(b.time ?? "99");

export function TasksApp(p: Props) {
  const router = useRouter();
  const [view, setView] = useState(p.initialView);
  const [who, setWho] = useState(p.initialWho);
  const [selId, setSelId] = useState<string | null>(p.initialTask);
  const [dirty, setDirty] = useState(false);
  const [arranging, setArranging] = useState(false);
  const [justDone, setJustDone] = useState<Record<string, Done>>({});
  const [touched, setTouched] = useState<string[]>([]);
  const [toast, setToast] = useState("");
  const [qa, setQa] = useState("");
  const [newList, setNewList] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [confirmDelList, setConfirmDelList] = useState(false);
  const [perDay, setPerDay] = useState("5");
  const [confirmSpread, setConfirmSpread] = useState(false);
  const [confirmUnspread, setConfirmUnspread] = useState(false);
  const [pending, start] = useTransition();
  const clearToast = useCallback(() => setToast(""), []);
  const refresh = () => router.refresh();

  useEffect(() => {
    const q = new URLSearchParams({ view, who });
    if (selId) q.set("task", selId);
    window.history.replaceState(null, "", `/tasks?${q}`);
  }, [view, who, selId]);
  // Remember the Everyone / Me / teammate choice on this device for a year.
  useEffect(() => { document.cookie = `${WHO_COOKIE}=${encodeURIComponent(who)}; path=/; max-age=31536000; samesite=lax`; }, [who]);

  const listByKey = useMemo(() => new Map(p.lists.map((l) => [keyOf(l), l])), [p.lists]);
  // Checked-off tasks stay visible (struck through) until you switch lists, so a mis-click is easy to undo.
  const rows = useMemo(() => [...p.tasks.filter((t) => !justDone[t.id]), ...Object.values(justDone).map((d) => ({ ...d.row, done: true }))], [p.tasks, justDone]);
  const touches = p.touches.filter((t) => !touched.includes(t.personId));
  const onToday = (k: string) => listByKey.get(k)?.showOnToday !== false;
  const whoOk = (t: TaskRow) => who === "everyone" || t.assigneeId === (who === "me" ? p.meId : who);
  const inView = (t: TaskRow, v: string) => (v === "today" ? !!t.due && diffDays(t.due, p.today) <= 0 && onToday(t.cat) : v === "upcoming" ? !!t.due && diffDays(t.due, p.today) > 0 : t.cat === v);
  const visible = (v: string) => rows.filter(whoOk).filter((t) => inView(t, v)).sort(sortTasks);
  const openCount = (v: string) => (v === "touch" ? touches.length : visible(v).filter((t) => !t.done).length + (v === "today" && onToday("touch") ? touches.length : 0));
  const lateCount = (v: string) => (v === "touch" ? 0 : visible(v).filter((t) => !t.done && t.due && diffDays(t.due, p.today) < 0).length);
  const title = (v: string) => (v === "today" ? "Today" : v === "upcoming" ? "Upcoming" : listByKey.get(v)?.name ?? "Tasks");
  // Quick add while looking at a teammate's tasks makes the task theirs (an @name in the text still wins).
  const viewing = who !== "everyone" && who !== "me" && who !== p.meId ? p.team.find((m) => m.id === who) ?? null : null;
  // The people in this list, top to bottom, so a contact opened from here can step to the next one.
  useEffect(() => {
    const ids: string[] = [];
    const add = (pid: string | null | undefined) => { if (pid && !ids.includes(pid)) ids.push(pid); };
    if (view === "touch") touches.forEach((t) => add(t.personId));
    else if (view === "today") {
      const due = visible("today");
      for (const l of p.lists.filter((x) => x.showOnToday)) {
        const k = keyOf(l);
        if (k === "touch") touches.forEach((t) => add(t.personId)); else due.filter((t) => t.cat === k).forEach((t) => add(t.personId));
      }
    } else visible(view).forEach((t) => add(t.personId));
    saveTrail({ list: title(view), ids });
  }); // runs after every render: the list on screen is what Next follows
  const selected = rows.find((t) => t.id === selId) ?? null;
  const currentList = view.startsWith("list:") ? listByKey.get(view) : undefined;

  const guard = () => { if (dirty) { setToast("Save or cancel your changes first."); return false; } return true; };
  const go = (v: string) => { if (!guard()) return; setView(v); setSelId(null); setJustDone({}); setRenaming(null); setConfirmDelList(false); };
  const open = (id: string) => { if (id !== selId && !guard()) return; setSelId(id); };

  const toggle = (t: TaskRow) => start(async () => {
    const d = justDone[t.id];
    if (d) {
      const r = await reopenTask({ id: d.realId, nextId: d.nextId });
      if (!r.ok) { setToast(r.error); return; }
      setJustDone((j) => { const n = { ...j }; delete n[t.id]; return n; });
      refresh(); return;
    }
    setJustDone((j) => ({ ...j, [t.id]: { row: t, realId: t.id, nextId: null } }));
    const r = t.virtual ? await completeDateTask(t.id) : await completeTask(t.id);
    if (!r.ok) { setJustDone((j) => { const n = { ...j }; delete n[t.id]; return n; }); setToast(r.error); return; }
    const realId = t.virtual ? (r.data as { id: string }).id : t.id;
    const nextId = t.virtual ? null : (r.data as { nextId: string | null }).nextId;
    setJustDone((j) => ({ ...j, [t.id]: { row: t, realId, nextId } }));
    const movedTo = t.virtual ? null : (r.data as { movedTo?: string | null }).movedTo;
    if (nextId && t.repeat) setToast(`Done. Next one created (${repeatLabel(t.repeat).toLowerCase()}).`);
    else if (movedTo) setToast(`Done. ${t.personName ?? "Their file"} moved to ${movedTo}.`);
    refresh();
  });

  const touch = (row: TouchRow) => start(async () => {
    const r = await logTouch(row.personId);
    if (!r.ok) { setToast(r.error); return; }
    setTouched((x) => [...x, row.personId]);
    setToast(`Text logged for ${row.name}. Next one due in ${row.followUpDays} days.`);
    refresh();
  });

  const submitQuick = (e: React.FormEvent) => {
    e.preventDefault();
    const text = qa.trim();
    if (!text) return;
    start(async () => {
      const r = await quickAddTask({ text, view, assigneeId: viewing?.id ?? null });
      if (!r.ok) { setToast(r.error); return; }
      setQa(""); setToast(r.data!.message); refresh();
    });
  };

  const saveNewList = () => {
    const name = (newList ?? "").trim();
    setNewList(null);
    if (!name) return;
    start(async () => {
      const r = await createList(name);
      if (!r.ok) { setToast(r.error); return; }
      setToast(`Created "${r.data!.name}". Add tasks here or type #${r.data!.name.replace(/\s+/g, "")} in quick add.`);
      setView(`list:${r.data!.id}`); setSelId(null); refresh();
    });
  };

  // ---------- Pieces ----------
  const line = (t: TaskRow, showPerson = true) => (
    <TaskLine key={t.id} task={t} today={p.today} team={p.team} selected={t.id === selId} showPerson={showPerson} onToggle={() => toggle(t)} onOpen={() => open(t.id)} />
  );
  const touchLine = (t: TouchRow) => (
    <div key={t.personId} className="grid grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-2.5 border-t border-misty px-3 py-2 first:border-t-0">
      <span />
      <span className="flex min-w-0 flex-col gap-0.5">
        <PersonLink id={t.personId} name={t.name} />
        <span className="flex flex-wrap gap-x-2.5 text-xs muted"><span>Every {t.followUpDays} days</span><span>Last text {t.lastContact ? longIso(t.lastContact.slice(0, 10)) : "never"}</span></span>
      </span>
      <button type="button" className="btn px-2 py-0.5 text-xs" disabled={pending} onClick={() => touch(t)}>Log text</button>
    </div>
  );
  const box = (children: React.ReactNode) => <div className="overflow-hidden rounded-xl border border-misty bg-white">{children}</div>;
  const group = (key: string, head: React.ReactNode, items: TaskRow[], bad: boolean, showPerson = true) => (
    <section key={key} className="flex flex-col">
      <h3 className={`mb-1.5 flex gap-2 text-xs font-semibold tracking-wider uppercase ${bad ? "text-bad" : "muted"}`}>{head}<span className="font-medium">{items.filter((t) => !t.done).length}</span></h3>
      {box(items.map((t) => line(t, showPerson)))}
    </section>
  );
  const empty = (text: string) => <div className="rounded-xl border border-dashed border-misty bg-white px-4 py-5 text-center muted">{text}</div>;

  function body() {
    if (view === "today") {
      const cols = p.lists.filter((l) => l.showOnToday);
      const due = visible("today");
      return (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] items-start gap-3">
          {cols.map((l) => {
            const k = keyOf(l);
            const head = <button type="button" className="text-left uppercase hover:underline" onClick={() => go(k)}>{l.name} ›</button>;
            if (k === "touch") return (
              <section key={k} className="flex flex-col">
                <h3 className="mb-1.5 flex gap-2 text-xs font-semibold tracking-wider muted">{head}<span className="font-medium">{touches.length || ""}</span></h3>
                {box(touches.length ? touches.map(touchLine) : <div className="px-3 py-3 text-sm muted">No one due</div>)}
              </section>
            );
            const items = due.filter((t) => t.cat === k);
            const late = items.some((t) => !t.done && t.due! < p.today);
            return (
              <section key={k} className="flex flex-col">
                <h3 className={`mb-1.5 flex gap-2 text-xs font-semibold tracking-wider ${late ? "text-bad" : "muted"}`}>{head}<span className="font-medium">{items.filter((t) => !t.done).length || ""}</span></h3>
                {box(items.length ? items.map((t) => line(t)) : <div className="px-3 py-3 text-sm muted">Nothing due</div>)}
              </section>
            );
          })}
        </div>
      );
    }
    if (view === "touch") return touches.length ? box(touches.map(touchLine)) : empty("Everyone is up to date. Set a follow-up frequency on a person and they'll show up here when they're due.");
    const list = visible(view);
    if (!list.length) return empty(EMPTY[view] ?? "No tasks in this list yet. Type one above, or use #listname in quick add.");
    if (view === "clients") {
      const people = [...new Set(list.map((t) => t.personId!))];
      return people.map((pid) => {
        const items = list.filter((t) => t.personId === pid);
        return group(pid, <PersonLink id={pid} name={`${items[0].personName ?? "Unknown"} ›`} />, items, items.some((t) => !t.done && !!t.due && t.due < p.today), false);
      });
    }
    if (view === "recurring") return box(list.map((t) => line(t)));
    if (view === "upcoming") {
      const days = [...new Set(list.map((t) => t.due!))];
      return days.map((d) => group(d, <span>{diffDays(d, p.today) === 1 ? `Tomorrow · ${longIso(d)}` : longIso(d)}</span>, list.filter((t) => t.due === d), false));
    }
    const when = (t: TaskRow) => (!t.due ? 4 : diffDays(t.due, p.today) < 0 ? 0 : t.due === p.today ? 1 : diffDays(t.due, p.today) === 1 ? 2 : 3);
    return ["Overdue", "Today", "Tomorrow", "Later", "No date"].map((h, i) => {
      const items = list.filter((t) => when(t) === i);
      return items.length ? group(h, <span>{h}</span>, items, i === 0) : null;
    });
  }

  const parsed = qa.trim() ? parseQuickAdd(qa, p.today) : null;
  const chips = parsed ? [
    parsed.due && longIso(parsed.due), parsed.time && formatTime(parsed.time), parsed.personWord && `Person: ${parsed.personWord}`,
    parsed.assignee ? `Assignee: @${parsed.assignee}` : viewing && `For ${viewing.name.split(/\s+/)[0]}`, parsed.list && `List: ${parsed.list}`, parsed.priority && `${PRIORITIES[parsed.priority]} priority`,
    parsed.repeat && `↻ ${repeatLabel(parsed.repeat)}`,
  ].filter(Boolean) as string[] : [];

  const navItem = (k: string, label: string) => {
    const late = lateCount(k), n = openCount(k);
    return (
      <li key={k}>
        <button type="button" aria-current={view === k ? "true" : undefined} onClick={() => go(k)}
          className={`flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left whitespace-nowrap max-lg:rounded-full max-lg:border max-lg:border-misty max-lg:bg-white ${view === k ? "bg-accent-soft font-semibold text-accent max-lg:bg-accent-soft" : "hover:bg-sunken"}`}>
          <span>{label}</span>
          <span className={`text-xs tabular-nums ${late ? "font-semibold text-bad" : "muted"}`} title={late ? `${late} overdue` : undefined}>{n || ""}</span>
        </button>
      </li>
    );
  };

  return (
    <div className={`mx-auto grid max-w-[1400px] grid-cols-1 items-start gap-5 px-4 py-4 lg:grid-cols-[210px_minmax(0,1fr)] ${selected ? "xl:grid-cols-[210px_minmax(0,1fr)_340px]" : ""}`}>
      <nav aria-label="Task lists" className="flex flex-col gap-3.5 lg:sticky lg:top-3 max-lg:flex-row max-lg:overflow-x-auto">
        <ul className="flex flex-col gap-px max-lg:flex-row max-lg:gap-1.5">{navItem("today", "Today")}{navItem("upcoming", "Upcoming")}</ul>
        <div>
          <h2 className="mb-1 flex items-center justify-between px-2.5 text-[11px] font-semibold tracking-wider uppercase muted max-lg:hidden">
            Lists <button type="button" className="link text-[11px] normal-case" onClick={() => { if (guard()) { setArranging(true); setView("today"); setSelId(null); } }}>Edit</button>
          </h2>
          <ul className="flex flex-col gap-px max-lg:flex-row max-lg:gap-1.5">
            {p.lists.map((l) => navItem(keyOf(l), l.name))}
            <li>
              {newList !== null ? (
                <span className="flex gap-1.5 py-1">
                  <input autoFocus aria-label="New list name" placeholder="List name" className="input min-w-0 flex-1" value={newList}
                    onChange={(e) => setNewList(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); saveNewList(); } if (e.key === "Escape") setNewList(null); }} />
                  <button type="button" className="btn btn-primary" onClick={saveNewList}>Add</button>
                </span>
              ) : (
                <button type="button" className="w-full rounded-md px-2.5 py-1.5 text-left font-semibold whitespace-nowrap text-accent hover:bg-sunken" onClick={() => setNewList("")}>+ New list</button>
              )}
            </li>
          </ul>
        </div>
      </nav>

      <main className="flex min-w-0 flex-col gap-3.5">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div>
            {currentList && renaming !== null ? (
              <span className="flex gap-1.5">
                <input autoFocus aria-label="List name" className="input" value={renaming} onChange={(e) => setRenaming(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Escape") setRenaming(null); }} />
                <button type="button" className="btn" onClick={() => setRenaming(null)}>Cancel</button>
                <button type="button" className="btn btn-primary" disabled={pending} onClick={() => start(async () => {
                  const r = await renameList({ id: currentList.id, name: renaming });
                  if (!r.ok) { setToast(r.error); return; }
                  setRenaming(null); setToast("List renamed."); refresh();
                })}>Save</button>
              </span>
            ) : <h1 className="text-2xl font-extrabold sm:text-[28px]">{title(view)}</h1>}
            <p className="text-sm muted">{view === "today" ? `${longIso(p.today)} · overdue items are marked in red` : SUBTITLE[view] ?? "Your list"}</p>
            {currentList && renaming === null && (
              <span className="mt-0.5 flex flex-wrap items-center gap-3 text-sm">
                <button type="button" className="link" onClick={() => setRenaming(currentList.name)}>Rename</button>
                <button type="button" className="font-semibold text-bad hover:underline" onBlur={() => setConfirmDelList(false)} onClick={() => {
                  if (!confirmDelList) { setConfirmDelList(true); return; }
                  start(async () => {
                    const r = await deleteList(currentList.id);
                    if (!r.ok) { setToast(r.error); return; }
                    setToast(`Deleted "${currentList.name}". Its tasks are kept in Clients or Misc.`); setView("today"); setConfirmDelList(false); refresh();
                  });
                }}>{confirmDelList ? "Click again to delete" : "Delete list"}</button>
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={currentList.showOnToday} onChange={(e) => start(async () => {
                    const r = await setListOnToday({ id: currentList.id, on: e.target.checked });
                    if (!r.ok) setToast(r.error); else refresh();
                  })} /> On Today
                </label>
              </span>
            )}
          </div>
          {view !== "touch" && (
            <span className="flex flex-wrap items-center gap-2">
              {view === "today" && <button type="button" className="btn" onClick={() => { if (guard()) { setArranging(true); setSelId(null); } }}>Edit columns</button>}
              <label className="flex items-center gap-1.5 text-sm font-semibold">
                <span className="sr-only">Assigned to</span>
                <select className="input w-auto font-semibold" value={who} onChange={(e) => setWho(e.target.value)}>
                  <option value="everyone">Everyone</option>
                  <option value="me">Me</option>
                  {p.team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </label>
            </span>
          )}
          {view === "touch" && (touches.length > 1 || p.waiting > 0) && (
            <span className="flex flex-wrap items-center gap-2 text-sm">
              {p.waiting > 0 && (
                <button type="button" className="btn" disabled={pending} onBlur={() => setConfirmUnspread(false)} onClick={() => {
                  if (!confirmUnspread) { setConfirmUnspread(true); return; }
                  setConfirmUnspread(false);
                  start(async () => {
                    const r = await unspreadTouches();
                    if (!r.ok) { setToast(r.error); return; }
                    setToast("Undone. Everyone due shows up again."); refresh();
                  });
                }}>{confirmUnspread ? `Click again to show all ${p.waiting} now` : `Undo spread out (${p.waiting} waiting)`}</button>
              )}
              <label className="flex items-center gap-1.5">Show
                <input type="number" min={1} max={100} className="input w-16" value={perDay} onChange={(e) => { setPerDay(e.target.value); setConfirmSpread(false); }} aria-label="People a day" />
                a day</label>
              <button type="button" className="btn" disabled={pending || !(+perDay >= 1)} onBlur={() => setConfirmSpread(false)} onClick={() => {
                if (!confirmSpread) { setConfirmSpread(true); return; }
                setConfirmSpread(false);
                start(async () => {
                  const r = await spreadTouches({ perDay: +perDay });
                  if (!r.ok) { setToast(r.error); return; }
                  setToast(`Spread out ${r.data!.people} people: ${perDay} a day through ${longIso(r.data!.lastDay)}.`); refresh();
                });
              }}>{confirmSpread ? `Click again to spread ${touches.length} over ${Math.ceil(touches.length / Math.max(1, +perDay || 1))} days` : "Spread out"}</button>
            </span>
          )}
        </div>

        {view !== "touch" && (
          <div className="rounded-xl border border-misty bg-white py-1 pr-1.5 pl-3 focus-within:border-accent">
            <form onSubmit={submitQuick} autoComplete="off" className="flex items-center gap-2">
              <input aria-label="Quick add task" className="min-w-0 flex-1 bg-transparent py-2 outline-none" placeholder={PLACEHOLDER[view] ?? 'Add a task, e.g. "call lender re Ortiz Fri 9am" or "rent check every month"'}
                value={qa} onChange={(e) => setQa(e.target.value)} />
              <button type="submit" className="btn btn-primary" disabled={pending || !qa.trim()}>Add</button>
            </form>
            {chips.length > 0 && <div className="flex flex-wrap gap-1.5 pb-2">{chips.map((c) => <span key={c} className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent">{c}</span>)}</div>}
          </div>
        )}

        {arranging && <ArrangeLists lists={p.lists} notify={setToast} onClose={(saved) => { setArranging(false); if (saved) refresh(); }} />}
        {body()}
        {view === "today" && rows.length === 0 && touches.length === 0 && empty("No tasks yet. Type one in the box above, or add one from a person's page.")}
        <p className="text-xs muted">Quick add understands <code>today</code>, <code>tomorrow</code>, a weekday, <code>next week</code>, <code>9am</code>, <code>every month</code>, <code>#list</code>, <code>@alyssa</code> and <code>re Name</code>. See <Link className="link" href="/people">People</Link> to add tasks for a person.</p>
      </main>

      {selected && (
        <TaskDetail key={selected.id} task={selected} lists={p.lists} team={p.team} notify={setToast}
          onClose={(discarded) => { if (discarded) { setDirty(false); setSelId(null); } else if (guard()) setSelId(null); }} onToggle={() => toggle(selected)} onDirty={setDirty}
          onSaved={(id) => { setSelId(id); refresh(); }} onDeleted={() => { setSelId(null); refresh(); }} />
      )}
      <Toast message={toast} onDone={clearToast} />
    </div>
  );
}
