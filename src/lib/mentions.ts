// @mentions in notes, logged calls and logged texts (SPEC.md §6.3). Unit tested in mentions.test.ts.

export type Member = { id: string; name: string };
const first = (name: string) => name.trim().split(/\s+/)[0] ?? name;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Team members mentioned as "@First" (any case), each once. */
export function findMentions(body: string, team: Member[]): Member[] {
  return team.filter((m) => new RegExp(`(^|[^\\w@])@${esc(first(m.name))}(?![\\w])`, "i").test(body));
}

/** Splits text into plain and mention parts so mentions can be highlighted. */
export function splitMentions(body: string, team: Member[]): { text: string; mention: boolean }[] {
  const names = team.map((m) => esc(first(m.name))).filter(Boolean);
  if (!names.length) return [{ text: body, mention: false }];
  const re = new RegExp(`(^|[^\\w@])(@(?:${names.join("|")}))(?![\\w])`, "gi");
  const out: { text: string; mention: boolean }[] = [];
  let last = 0;
  for (const m of body.matchAll(re)) {
    const start = m.index! + m[1].length;
    if (start > last) out.push({ text: body.slice(last, start), mention: false });
    out.push({ text: m[2], mention: true });
    last = start + m[2].length;
  }
  if (last < body.length) out.push({ text: body.slice(last), mention: false });
  return out;
}

/** The "@partial" being typed just before the caret, if any. */
export function mentionQuery(textBeforeCaret: string): string | null {
  const m = textBeforeCaret.match(/(?:^|\s)@(\w{0,20})$/);
  return m ? m[1] : null;
}

export const mentionLabel = (m: Member) => `@${first(m.name)}`;
