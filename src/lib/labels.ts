// Mailing labels for card tasks (owner request 2026-11-24): Avery 5160 / 8160 size (1" × 2⅝", 30 a sheet: 3 across,
// 10 down), the same layout as the owner's label file, without the logo. Pure, unit tested in labels.test.ts.

export type LabelRow = { name: string; address: string | null };
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** "5533 Emerson Ave S, Minneapolis, MN 55419" → ["5533 Emerson Ave S", "Minneapolis, MN 55419"]; a unit stays on
 *  the street line ("250 6th St E, Apt 219, St. Paul, MN 55101" → "250 6th St E Apt 219"). */
export function addressLines(address: string): string[] {
  const parts = address.split(",").map((x) => x.trim()).filter(Boolean);
  if (parts.length <= 1) return parts;
  const cityAt = Math.max(1, parts.length - 2); // the last two parts are city and "ST 55419"
  return [parts.slice(0, cityAt).join(" "), parts.slice(cityAt).join(", ")];
}

/** The printable page: blank labels first when a sheet is partly used (`start` = the first free label, 1–30). */
export function labelsHtml(rows: LabelRow[], start = 1): string {
  const list = rows.filter((r) => r.address?.trim());
  const blanks = Math.min(29, Math.max(0, Math.floor(start) - 1));
  const cells = [...Array.from({ length: blanks }, () => ""), ...list.map((r) => {
    const lines = [r.name, ...addressLines(r.address!)];
    const long = Math.max(...lines.map((l) => l.length));
    // Long names shrink to fit rather than being cut off (e.g. "Caitlin Van Kooten & Andrew Dahlen").
    return `<div class="t${long > 40 ? " xs" : long > 28 ? " s" : ""}">${lines.map((l) => `<div>${esc(l)}</div>`).join("")}</div>`;
  })];
  const pages: string[] = [];
  for (let i = 0; i < cells.length; i += 30) pages.push(`<section class="sheet">${cells.slice(i, i + 30).map((c) => `<div class="label">${c}</div>`).join("")}</section>`);
  return `<!doctype html><html><head><meta charset="utf-8"><title>Mailing labels</title><style>
@page { size: letter; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: Helvetica, Arial, sans-serif; color: #000; }
.sheet { width: 8.5in; height: 11in; padding: 0.5in 0 0 0.1875in; display: grid; grid-template-columns: repeat(3, 2.625in); grid-auto-rows: 1in; column-gap: 0.125in; page-break-after: always; }
.sheet:last-child { page-break-after: auto; }
.label { width: 2.625in; height: 1in; padding: 0.12in 0.15in 0.08in 0.2in; overflow: hidden; display: flex; align-items: center; }
.t { font-size: 10.5pt; line-height: 1.22; }
.t.s { font-size: 8.5pt; }
.t.xs { font-size: 7pt; }
.t div { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 2.3in; }
@media screen { body { background: #ddd; } .sheet { background: #fff; margin: 0.25in auto; box-shadow: 0 1px 4px rgba(0,0,0,.25); } .label { outline: 1px dashed #ccc; } }
</style></head><body>${pages.join("")}<script>window.onload = () => setTimeout(() => window.print(), 300);</script></body></html>`;
}
