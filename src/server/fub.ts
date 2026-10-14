import "server-only";
import { db } from "@/server/db";
import type { FubPerson } from "@/lib/fubImport";

// Follow Up Boss API (SPEC.md §15): reads people with the key stored in Railway (FUB_API_KEY). Read-only:
// nothing in Follow Up Boss is ever changed.

export const fubKeySet = () => !!process.env.FUB_API_KEY?.trim();
// FUB_API_BASE only points tests at a stand-in server.
const BASE = process.env.FUB_API_BASE || "https://api.followupboss.com/v1/";

async function fubGet(pathOrUrl: string): Promise<Record<string, unknown>> {
  const url = pathOrUrl.startsWith("http") ? pathOrUrl : BASE + pathOrUrl;
  if (!url.startsWith(BASE)) throw new Error("Unexpected Follow Up Boss address.");
  for (let attempt = 0; attempt < 5; attempt++) {
    const r = await fetch(url, { headers: { Authorization: `Basic ${Buffer.from(`${process.env.FUB_API_KEY!.trim()}:`).toString("base64")}`, "X-System": "PettyHomesHQ", Accept: "application/json" }, cache: "no-store" });
    if (r.status === 429) { await new Promise((ok) => setTimeout(ok, 2000 * (attempt + 1))); continue; }
    if (r.status === 401 || r.status === 403) throw new Error("Follow Up Boss didn't accept the key. Check FUB_API_KEY in Railway (Follow Up Boss → Admin → API).");
    if (!r.ok) throw new Error(`Follow Up Boss answered ${r.status}. Try again in a minute.`);
    return (await r.json()) as Record<string, unknown>;
  }
  throw new Error("Follow Up Boss is busy. Try again in a minute.");
}

type RawPerson = Record<string, unknown> & {
  id: number; firstName?: string; lastName?: string; name?: string; stage?: string; source?: string; assignedTo?: string; tags?: string[];
  emails?: { value?: string; type?: string }[]; phones?: { value?: string; type?: string }[]; addresses?: { street?: string; city?: string; state?: string; code?: string }[];
};
const str = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");

/** Pulls everyone from Follow Up Boss and keeps the copy in HQ for the import screens. */
export async function loadFromFub(): Promise<number> {
  // Custom field API names → labels ("customBirthday2" → "Birthday 2"); the matching screen picks which fills what.
  const cf = await fubGet("customFields?limit=100");
  const fields = ((cf.customfields ?? cf.customFields ?? []) as { name: string; label: string }[]).map((f) => ({ name: f.name, label: f.label || f.name }));

  const people: FubPerson[] = [];
  let next: string | null = "people?limit=100&fields=allFields&sort=id";
  for (let page = 0; next && page < 1000; page++) {
    const j = await fubGet(next);
    for (const p of (j.people ?? []) as RawPerson[]) {
      const a = p.addresses?.[0];
      people.push({
        id: p.id, firstName: str(p.firstName), lastName: str(p.lastName), stage: str(p.stage), source: str(p.source), assignedTo: str(p.assignedTo),
        tags: Array.isArray(p.tags) ? p.tags.map(str).filter(Boolean) : [],
        emails: (p.emails ?? []).map((e) => ({ value: str(e.value), type: str(e.type) })),
        phones: (p.phones ?? []).map((e) => ({ value: str(e.value), type: str(e.type) })),
        address: a ? [a.street, [a.city, [a.state, a.code].filter(Boolean).join(" ")].filter(Boolean).join(", ")].filter(Boolean).join(", ") : "",
        custom: Object.fromEntries(fields.map((f) => [f.label, str(p[f.name]).trim()]).filter(([, v]) => v)),
      });
    }
    const meta = (j._metadata ?? {}) as { nextLink?: string; next?: string };
    next = meta.nextLink || (meta.next ? `people?limit=100&fields=allFields&sort=id&next=${encodeURIComponent(meta.next)}` : null);
  }
  await db.appSetting.upsert({ where: { key: "fub.people" }, update: { value: people }, create: { key: "fub.people", value: people } });
  await db.appSetting.upsert({ where: { key: "fub.loadedAt" }, update: { value: new Date().toISOString() }, create: { key: "fub.loadedAt", value: new Date().toISOString() } });
  return people.length;
}

export async function cachedFubPeople(): Promise<{ people: FubPerson[]; loadedAt: string | null }> {
  const [p, at] = await Promise.all([db.appSetting.findUnique({ where: { key: "fub.people" } }), db.appSetting.findUnique({ where: { key: "fub.loadedAt" } })]);
  return { people: Array.isArray(p?.value) ? (p.value as unknown as FubPerson[]) : [], loadedAt: typeof at?.value === "string" ? at.value : null };
}
