// Website leads (owner request 2026-11-01): the WordPress site's Elementor Pro form sends each submission to HQ by its
// "Webhook" action. Elementor sends the fields by their labels ("Name", "Email", …), or with "Advanced data" on as
// fields[<id>][title] / fields[<id>][value]; both are read here. Pure, so it's unit tested.

export type Lead = { name: string; email: string; phone: string; message: string; page: string; extras: [string, string][] };

// Elementor's own extras that aren't about the person.
const META = /^(date|time|user agent|remote ip|powered by|form[_ ]?(id|name)|referer title|credit|form_fields)$/i;

/** The form fields by label: Elementor's simple format as is, or the advanced one (fields[id][title|value], meta[..]). */
export function flattenFields(raw: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  const adv = new Map<string, { title?: string; value?: string }>();
  for (const [k, v] of Object.entries(raw)) {
    const m = k.match(/^(fields|meta)\[([^\]]+)\]\[(title|value)\]$/);
    if (m) { const key = `${m[1]}:${m[2]}`; const e = adv.get(key) ?? {}; e[m[3] as "title" | "value"] = v; adv.set(key, e); continue; }
    if (/^(fields|meta|form)\[/.test(k)) continue; // ids, types, raw values
    out[k] = v;
  }
  for (const [key, e] of adv) out[e.title || key.split(":")[1]] = e.value ?? "";
  return out;
}

/** The first filled-in field whose label matches; its label is remembered so it isn't repeated in the extras. */
function picker(f: Record<string, string>) {
  const used = new Set<string>();
  const pick = (re: RegExp) => { const hit = Object.entries(f).find(([k, v]) => !used.has(k) && re.test(k.trim()) && v.trim()); if (!hit) return ""; used.add(hit[0]); return hit[1].trim(); };
  return { pick, used };
}

/** Who filled in the form and what they said. Unknown fields are kept as "Label: value" lines. */
export function readLead(raw: Record<string, string>): Lead {
  const f = flattenFields(raw);
  const { pick, used } = picker(f);
  const first = pick(/^first/i), last = pick(/^last|surname/i);
  const name = (pick(/^(your |full )?name$/i) || [first, last].filter(Boolean).join(" ")).replace(/\s+/g, " ").slice(0, 120);
  const email = pick(/e-?mail/i).toLowerCase().slice(0, 200);
  const phone = pick(/phone|cell|mobile|tel/i).slice(0, 40);
  const page = pick(/page.?url|page_url|referr?er|^url$/i).slice(0, 500);
  const message = pick(/message|comment|question|notes?$|how can|help|details/i).slice(0, 4000);
  // Fields with no label arrive by their code ("field_3f2a"): fall back to what the value looks like.
  const byValue = (ok: (v: string) => boolean) => { const hit = Object.entries(f).find(([k, v]) => !used.has(k) && !META.test(k.trim()) && ok(v.trim())); if (!hit) return ""; used.add(hit[0]); return hit[1].trim(); };
  const email2 = email || byValue((v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)).toLowerCase();
  const phone2 = phone || byValue((v) => /^[\d\s().+-]{10,20}$/.test(v) && /^1?\d{10}$/.test(v.replace(/\D/g, "")));
  const extras = Object.entries(f)
    .filter(([k, v]) => v.trim() && !used.has(k) && !META.test(k.trim()))
    .slice(0, 20).map(([k, v]) => [k.slice(0, 60), v.trim().slice(0, 500)] as [string, string]);
  return { name, email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email2) ? email2 : "", phone: phone2, message, page, extras };
}

/** The note on their timeline: what they wrote, any other answers, and the page they were on. */
export function leadNote(l: Lead): string {
  return ["Website lead form", l.message && `"${l.message}"`, ...l.extras.map(([k, v]) => `${k}: ${v}`), l.page && `Page: ${l.page}`].filter(Boolean).join("\n");
}
