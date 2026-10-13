// Custom fields on people (SPEC.md §6.1, Admin → Custom fields).
export const FIELD_TYPES = ["text", "number", "date", "dropdown", "checkbox"] as const;
export type FieldType = (typeof FIELD_TYPES)[number];
export const FIELD_TYPE_LABEL: Record<FieldType, string> = { text: "Text", number: "Number", date: "Date", dropdown: "Dropdown", checkbox: "Checkbox" };

/** Cleans a value for its field type; "" means "not set". */
export function cleanFieldValue(type: string, options: string[], raw: string): string {
  const v = raw.trim();
  if (!v) return "";
  switch (type) {
    case "number": { const n = Number(v.replace(/[$,\s]/g, "")); if (!Number.isFinite(n)) throw new Error("Use a number"); return String(n); }
    case "date": if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error("Pick a date"); return v;
    case "dropdown": if (!options.includes(v)) throw new Error("Pick one of the choices"); return v;
    case "checkbox": return v === "yes" ? "yes" : "";
    default: return v.slice(0, 500);
  }
}
