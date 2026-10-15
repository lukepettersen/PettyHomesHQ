"use client";

import { useEffect, useId, useState, type KeyboardEvent, type RefObject } from "react";
import { matchTemplates, slashQuery, type TemplateOption } from "@/lib/templateSearch";

const itemCls = (on: boolean) => `block w-full truncate px-3 py-1.5 text-left text-sm ${on ? "bg-accent-soft" : "hover:bg-paper"}`;

/** Template picker you can type in: shows the chosen template, filters as you type, arrows + Enter to pick. */
export function TemplateSearch({ templates, value, onPick, disabled, emptyLabel = "None (write your own)", noneLabel }: {
  templates: TemplateOption[]; value: string; onPick: (id: string) => void; disabled?: boolean; emptyLabel?: string; noneLabel?: string;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const chosen = templates.find((t) => t.id === value);
  const matches = matchTemplates(templates, q, 50);
  const pick = (id: string) => { onPick(id); setOpen(false); setQ(""); };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, matches.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter" && open && matches[active]) { e.preventDefault(); pick(matches[active].id); }
    else if (e.key === "Escape") { setOpen(false); setQ(""); }
  };
  if (!templates.length) return <input className="input" disabled value={noneLabel ?? "No templates yet"} readOnly />;
  return (
    <div className="relative">
      <input role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list" className="input w-full" disabled={disabled}
        placeholder={chosen ? chosen.name : `${emptyLabel} · type to search`} value={open ? q : chosen?.name ?? ""}
        onFocus={() => { setOpen(true); setQ(""); setActive(0); }} onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(0); }} onKeyDown={onKey} />
      {open && (
        <ul id={listId} role="listbox" className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-md border border-misty bg-white py-1 shadow-lg">
          {value && !q && <li role="option" aria-selected={false}><button type="button" className={itemCls(false)} onMouseDown={(e) => e.preventDefault()} onClick={() => pick("")}><i className="muted">{emptyLabel}</i></button></li>}
          {matches.map((t, i) => (
            <li key={t.id} role="option" aria-selected={i === active}>
              <button type="button" className={itemCls(i === active)} onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setActive(i)} onClick={() => pick(t.id)}>{t.name}</button>
            </li>
          ))}
          {!matches.length && <li className="px-3 py-1.5 text-sm muted">No template matches &ldquo;{q}&rdquo;</li>}
        </ul>
      )}
    </div>
  );
}

/**
 * Typing "/" in a message box opens a list of templates; keep typing to narrow it, Enter or click to put
 * the template in (replacing the "/words"). Returns the key handler, a caret tracker and the menu to render.
 */
export function useSlashTemplates({ box, value, templates, onChoose }: {
  box: RefObject<HTMLTextAreaElement | null>; value: string; templates: TemplateOption[];
  onChoose: (id: string, from: number, to: number) => void;
}) {
  const [caret, setCaret] = useState<number | null>(null);
  const [active, setActive] = useState(0);
  const [closedAt, setClosedAt] = useState<number | null>(null);
  const hit = caret == null ? null : slashQuery(value.slice(0, caret));
  const matches = hit && templates.length ? matchTemplates(templates, hit.query) : [];
  const open = !!hit && closedAt !== hit.from && (matches.length > 0 || hit.query.length < 3);
  useEffect(() => { const t = setTimeout(() => setActive(0), 0); return () => clearTimeout(t); }, [hit?.query]);

  const track = () => setCaret(box.current ? box.current.selectionStart : null);
  const choose = (id: string) => { if (!hit || caret == null) return; onChoose(id, hit.from, caret); setCaret(null); };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!open || !matches.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, matches.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); choose(matches[active].id); }
    else if (e.key === "Escape") { e.preventDefault(); setClosedAt(hit!.from); }
  };
  const menu = open ? (
    <div className="relative">
      <ul role="listbox" aria-label="Templates" className="absolute z-30 mt-1 max-h-72 w-full max-w-md overflow-auto rounded-md border border-misty bg-white py-1 shadow-lg">
        <li className="px-3 pb-1 text-xs muted">Templates{hit!.query ? ` matching “${hit!.query}”` : ""} · ↑↓ then Enter</li>
        {matches.map((t, i) => (
          <li key={t.id} role="option" aria-selected={i === active}>
            <button type="button" className={itemCls(i === active)} onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setActive(i)} onClick={() => choose(t.id)}>{t.name}</button>
          </li>
        ))}
        {!matches.length && <li className="px-3 py-1.5 text-sm muted">{templates.length ? "Keep typing a template name…" : "No templates yet"}</li>}
      </ul>
    </div>
  ) : null;
  return { onKeyDown, track, menu };
}
