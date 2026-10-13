// Files card rules (SPEC.md §6.3). Pure, unit tested in documents.test.ts.

export const MAX_BYTES = 25 * 1024 * 1024; // 25 MB
const BLOCKED = ["exe", "bat", "cmd", "com", "msi", "sh", "ps1", "js", "vbs", "scr", "jar", "app", "dmg"];

/** A file name that's safe to store and show: no folders, odd characters or very long names. */
export function safeName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";
  const cleaned = base.replace(/[^\w.\- ()&,#']/g, "_").replace(/\s+/g, " ").trim().slice(-120);
  return cleaned && cleaned !== "." && cleaned !== ".." ? cleaned : "file";
}

/** "Purchase Agreement.PDF" → "PDF" (shown as the file-type badge). */
export const extLabel = (name: string) => { const e = name.includes(".") ? name.split(".").pop()! : ""; return (e || "FILE").toUpperCase().slice(0, 4); };

/** Why a file can't be uploaded, or null when it's fine. */
export function uploadProblem(name: string, size: number): string | null {
  if (!size) return `"${name}" is empty.`;
  if (size > MAX_BYTES) return `"${name}" is larger than 25 MB.`;
  const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
  if (BLOCKED.includes(ext)) return `"${name}" is a program file, which can't be uploaded.`;
  return null;
}

export const sizeLabel = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
