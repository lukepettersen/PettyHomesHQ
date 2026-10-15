// Finding a template by typing (SPEC.md §12): the Template search box and "/name" in a message.
// Unit tested in templateSearch.test.ts.

export type TemplateOption = { id: string; name: string };

/** Templates whose name contains every typed word (any order, any case). Names starting with the words come first. */
export function matchTemplates<T extends TemplateOption>(list: T[], query: string, limit = 8): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return list.slice(0, limit);
  const words = q.split(/\s+/);
  const plain = (n: string) => n.toLowerCase().replace(/^[^·]*·\s*/, ""); // without the "BPC · " folder
  return list
    .filter((t) => words.every((w) => t.name.toLowerCase().includes(w)))
    .sort((a, b) => Number(!plain(a.name).startsWith(q)) - Number(!plain(b.name).startsWith(q)) || a.name.localeCompare(b.name))
    .slice(0, limit);
}

/**
 * The "/words" being typed just before the caret, or null. The slash must start the message or follow a
 * space or new line (so "and/or" and web addresses don't open the menu).
 */
export function slashQuery(textBeforeCaret: string): { query: string; from: number } | null {
  const m = textBeforeCaret.match(/(^|\s)\/([^\s/][^\n/]{0,40})?$/);
  if (!m) return null;
  return { query: m[2] ?? "", from: textBeforeCaret.length - (m[2] ?? "").length - 1 };
}
