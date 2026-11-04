"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { SaveBar } from "@/components/SaveBar";
import { TimeSelect } from "@/components/TimeSelect";
import { toHtml } from "@/lib/email";
import type { DigestSettings, ReportKind } from "@/lib/deadlineDigest";
import { saveDeadlineEmail, testDeadlineEmail } from "./actions";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function DeadlineEmailClient({ kind, initial, team, preview }: { kind: ReportKind; initial: DigestSettings; team: { first: string; name: string }[]; preview: { subject: string; body: string } }) {
  const [s, setS] = useState(initial);
  const [toText, setToText] = useState(initial.to.join(", "));
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const to = toText.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);
  const now = { ...s, to };
  const dirty = JSON.stringify(now) !== JSON.stringify(initial);
  return (
    <div className="flex flex-col gap-4">
      <section className="card">
        <div className="flex flex-col gap-3 px-4 py-3">
          <label className="flex items-center gap-2 font-semibold"><input type="checkbox" checked={s.on} onChange={(e) => setS({ ...s, on: e.target.checked })} /> Send it every week</label>
          <div className="flex flex-wrap items-end gap-3">
            <label className="label">Day<select className="input w-auto" value={s.day} onChange={(e) => setS({ ...s, day: Number(e.target.value) })}>{DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}</select></label>
            <label className="label">Time<TimeSelect label="Time" value={s.time} onChange={(v) => setS({ ...s, time: v })} className="input w-auto" /></label>
            <label className="label">From<select className="input w-auto" value={s.from} onChange={(e) => setS({ ...s, from: e.target.value })}>
              <option value="">HQ&apos;s connected Gmail</option>{team.map((u) => <option key={u.first} value={u.first}>{u.name}&apos;s Gmail</option>)}</select></label>
          </div>
          <label className="label">To (emails, separated by commas)<input className="input" value={toText} onChange={(e) => setToText(e.target.value)} placeholder="luke@pettyhomes.com" /></label>
          <p className="text-xs muted">Sent from a teammate&apos;s own Gmail when they&apos;ve connected it in Admin → Integrations; otherwise from HQ&apos;s connected Gmail.</p>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn" disabled={pending} onClick={() => start(async () => { setMsg(""); setError(""); const r = await testDeadlineEmail(kind, now); if (!r.ok) setError(r.error); else setMsg(`Sent a test to ${r.data!.to}.`); })}>Send me a test</button>
            {msg && <span className="text-sm text-accent" role="status">{msg}</span>}
          </div>
        </div>
        <SaveBar dirty={dirty} pending={pending} error={error} onDiscard={() => { setS(initial); setToText(initial.to.join(", ")); setError(""); }}
          onSave={() => start(async () => { setError(""); const r = await saveDeadlineEmail(kind, now); if (!r.ok) setError(r.error); else { setMsg(s.on ? `Saved. It goes out every ${DAYS[s.day]}.` : "Saved. It's off."); router.refresh(); } })} />
      </section>
      <details className="card px-4 py-3">
        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider muted">Preview (as it would go out today)</summary>
        <p className="mt-1 font-semibold">{preview.subject}</p>
        {/* toHtml escapes everything and adds only HQ's own tags (bold, links). */}
        <div className="mt-2 text-sm [&_a]:text-accent [&_a]:underline" dangerouslySetInnerHTML={{ __html: toHtml(preview.body) }} />
      </details>
    </div>
  );
}
