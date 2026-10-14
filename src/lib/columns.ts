// People table columns (SPEC.md §6.2): each smart list (and All people) picks which show, in what order.

export const COLUMNS: [string, string][] = [
  ["stage", "Stage"], ["type", "Type"], ["company", "Company"], ["phone", "Phone"], ["email", "Email"],
  ["lastContact", "Last contact"], ["lastCall", "Last call"], ["lastText", "Last text"], ["lastEmail", "Last email"],
  ["followUp", "Follow up"], ["tags", "Tags"], ["source", "Source"], ["assigned", "Assigned to"],
  ["address", "Address"], ["mailingName", "Mailing name"], ["kids", "Kids"], ["birthday", "Next birthday"], ["homeiversary", "Homeiversary"], ["created", "Added"],
];
export const DEFAULT_COLUMNS = ["stage", "lastContact", "followUp", "tags", "source"];
export const columnLabel = (k: string) => COLUMNS.find(([x]) => x === k)?.[1] ?? k;

/** Stored columns → only known ones, in order; the default set when nothing usable is stored. */
export function parseColumns(raw: unknown): string[] {
  const known = new Set(COLUMNS.map(([k]) => k));
  const list = Array.isArray(raw) ? [...new Set(raw.filter((x): x is string => typeof x === "string" && known.has(x)))] : [];
  return list.length ? list : DEFAULT_COLUMNS;
}
