// Timeline grouping (SPEC.md §6.3). Pure, tested in timelineThreads.test.ts.
// Texts back and forth close together become one thread (owner request 2026-10-23). Emails in one conversation (the
// same subject, ignoring "Re:" / "Fwd:", within 60 days) become one thread too, shown where its newest email is, so a
// client's reply sits with the email it answers (owner request 2026-11-04).

type E = { kind: string; body: string; at: string };
const TEXT_GAP = 12 * 3600 * 1000, EMAIL_SPAN = 60 * 86400000;

/** "Re: Fwd: RE: 2001 Westwood – inspection" → "2001 westwood – inspection". "" when an email has no subject line. */
export function emailTopic(body: string): string {
  const head = body.split("\n\n")[0];
  const i = head.indexOf(" · ");
  if (i < 0) return "";
  return head.slice(i + 3).replace(/^\s*((re|fwd?|aw)\s*(\[\d+\])?\s*:\s*)+/i, "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** Groups entries listed newest first: each group is newest first too. */
export function threads<T extends E>(list: T[]): T[][] {
  const out: T[][] = [];
  const byTopic = new Map<string, T[]>();
  for (const e of list) {
    if (e.kind === "email") {
      const topic = emailTopic(e.body);
      const g = topic && topic !== "(no subject)" ? byTopic.get(topic) : undefined;
      if (g && Math.abs(new Date(g[0].at).getTime() - new Date(e.at).getTime()) <= EMAIL_SPAN) { g.push(e); continue; }
      const fresh = [e];
      out.push(fresh);
      if (topic && topic !== "(no subject)") byTopic.set(topic, fresh);
      continue;
    }
    const last = out[out.length - 1];
    const prev = last?.[last.length - 1];
    if (e.kind === "text" && prev?.kind === "text" && Math.abs(new Date(prev.at).getTime() - new Date(e.at).getTime()) <= TEXT_GAP) last.push(e);
    else out.push([e]);
  }
  return out;
}
