// The text assistant (owner request 2026-10-30): pure helpers, unit tested in textAgent.test.ts.

/** "undo", "undo that", "oops undo" → true. */
export const isUndo = (body: string) => /^\s*(oops,?\s*)?undo( that| it| last)?\s*[.!]?\s*$/i.test(body);

/** Texts back stay short: whole lines, about three text messages at most. */
export function clip(text: string, max = 460): string {
  const t = text.replace(/\*\*?|__|`/g, "").replace(/\n{3,}/g, "\n\n").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const end = Math.max(cut.lastIndexOf("\n"), cut.lastIndexOf(". "));
  return `${(end > max * 0.5 ? cut.slice(0, end + 1) : cut).trim()}…`;
}

/** A checked date and time from the assistant: YYYY-MM-DD and HH:MM (or "" for none). */
export function cleanWhen(date: unknown, time: unknown): { date: string; time: string | null } | null {
  const d = typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
  if (!d) return null;
  const t = typeof time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? time : null;
  return { date: d, time: t };
}
