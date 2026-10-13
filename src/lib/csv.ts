/** CSV with quoting, plus protection against spreadsheet formula injection (cells starting with = + - @). */
export function toCsv(rows: string[][]): string {
  const cell = (v: string) => {
    let s = v ?? "";
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}
