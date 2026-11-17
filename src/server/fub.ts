import "server-only";
import { db } from "@/server/db";
import type { FubPerson, FubRelation } from "@/lib/fubImport";

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
        lastActivity: str(p.lastActivity) || str(p.lastCommunication) || "",
        custom: Object.fromEntries(fields.map((f) => [f.label, str(p[f.name]).trim()]).filter(([, v]) => v)),
      });
    }
    const meta = (j._metadata ?? {}) as { nextLink?: string; next?: string };
    next = meta.nextLink || (meta.next ? `people?limit=100&fields=allFields&sort=id&next=${encodeURIComponent(meta.next)}` : null);
  }
  // Relationships (spouse, partner, children…) live separately in FUB; attach them to their person.
  const rels = new Map<number, FubRelation[]>();
  let rnext: string | null = "peopleRelationships?limit=100";
  for (let page = 0; rnext && page < 1000; page++) {
    const j = await fubGet(rnext);
    const list = (Object.entries(j).find(([k, v]) => k !== "_metadata" && Array.isArray(v))?.[1] ?? []) as (Record<string, unknown> & { personId?: number; emails?: { value?: string; type?: string }[]; phones?: { value?: string; type?: string }[] })[];
    for (const r of list) {
      if (!r.personId) continue;
      const rel: FubRelation = {
        type: str(r.type), firstName: str(r.firstName), lastName: str(r.lastName),
        emails: (r.emails ?? []).map((e) => ({ value: str(e.value), type: str(e.type) })), phones: (r.phones ?? []).map((e) => ({ value: str(e.value), type: str(e.type) })),
      };
      if (!rel.firstName && str(r.name)) { const [f, ...l] = str(r.name).trim().split(/\s+/); rel.firstName = f; rel.lastName = l.join(" "); }
      rels.set(r.personId, [...(rels.get(r.personId) ?? []), rel]);
    }
    const meta = (j._metadata ?? {}) as { nextLink?: string; next?: string };
    rnext = meta.nextLink || (meta.next ? `peopleRelationships?limit=100&next=${encodeURIComponent(meta.next)}` : null);
  }
  for (const p of people) { const r = rels.get(p.id); if (r) p.relationships = r; }

  // Last text with each person ("Due for a touch" counts from texts). FUB may list every text at once; if it
  // only lists one person's texts at a time, ask per person for clients and sphere (not the agent database).
  const lastText = new Map<number, number>();
  const note = (list: Record<string, unknown>[]) => {
    for (const t of list) {
      const pid = Number(t.personId), at = Date.parse(str(t.created) || str(t.sent) || str(t.updated));
      if (pid && Number.isFinite(at) && at > (lastText.get(pid) ?? 0)) lastText.set(pid, at);
    }
  };
  const arrayOf = (j: Record<string, unknown>) => (Object.entries(j).find(([k, v]) => k !== "_metadata" && Array.isArray(v))?.[1] ?? null) as Record<string, unknown>[] | null;
  let all = true;
  try {
    let tnext: string | null = "textMessages?limit=100";
    for (let page = 0; tnext && page < 2000; page++) {
      const j = await fubGet(tnext);
      const list = arrayOf(j);
      if (!list) { all = false; break; }
      note(list);
      const meta = (j._metadata ?? {}) as { nextLink?: string; next?: string };
      tnext = meta.nextLink || (meta.next ? `textMessages?limit=100&next=${encodeURIComponent(meta.next)}` : null);
    }
  } catch { all = false; }
  if (!all) {
    const candidates = people.filter((p) => !/industry|realtor|real estate agent|trash|petty homes admin/i.test(p.stage)).map((p) => p.id);
    for (let i = 0; i < candidates.length; i += 5) {
      await Promise.all(candidates.slice(i, i + 5).map(async (id) => {
        try { const list = arrayOf(await fubGet(`textMessages?personId=${id}&limit=100`)); if (list) note(list.map((t) => ({ ...t, personId: t.personId ?? id }))); } catch { /* skip this person */ }
      }));
    }
  }
  for (const p of people) { const at = lastText.get(p.id); if (at) p.lastText = new Date(at).toISOString(); }

  await db.appSetting.upsert({ where: { key: "fub.people" }, update: { value: people }, create: { key: "fub.people", value: people } });
  await db.appSetting.upsert({ where: { key: "fub.loadedAt" }, update: { value: new Date().toISOString() }, create: { key: "fub.loadedAt", value: new Date().toISOString() } });
  return people.length;
}

export async function cachedFubPeople(): Promise<{ people: FubPerson[]; loadedAt: string | null }> {
  const [p, at] = await Promise.all([db.appSetting.findUnique({ where: { key: "fub.people" } }), db.appSetting.findUnique({ where: { key: "fub.loadedAt" } })]);
  return { people: Array.isArray(p?.value) ? (p.value as unknown as FubPerson[]) : [], loadedAt: typeof at?.value === "string" ? at.value : null };
}

const arrayIn = (j: Record<string, unknown>) => (Object.entries(j).find(([k, v]) => k !== "_metadata" && Array.isArray(v))?.[1] ?? []) as Record<string, unknown>[];
/** Every row of a FUB list (follows FUB's "next" pages). */
export async function fubList(path: string, maxPages = 200): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  const sep = path.includes("?") ? "&" : "?";
  let next: string | null = `${path}${sep}limit=100`;
  for (let page = 0; next && page < maxPages; page++) {
    const j = await fubGet(next);
    out.push(...arrayIn(j));
    const meta = (j._metadata ?? {}) as { nextLink?: string; next?: string };
    next = meta.nextLink || (meta.next ? `${path}${sep}limit=100&next=${encodeURIComponent(meta.next)}` : null);
  }
  return out;
}

/** FUB email and text templates (read only). */
export async function fubTemplates() {
  const [emails, texts] = await Promise.all([fubList("templates"), fubList("textMessageTemplates")]);
  return {
    emails: emails.map((t) => ({ id: str(t.id), name: str(t.name).trim(), subject: str(t.subject), body: str(t.body) })),
    texts: texts.map((t) => ({ id: str(t.id), name: str(t.name).trim(), body: str(t.message) || str(t.body) })),
  };
}

/** One FUB person's notes, calls and texts (read only). A list FUB won't give is skipped. */
export async function fubHistoryFor(personId: number) {
  const get = (path: string) => fubList(`${path}?personId=${personId}`, 20).catch(() => [] as Record<string, unknown>[]);
  const [notes, calls, texts] = await Promise.all([get("notes"), get("calls"), get("textMessages")]);
  return { notes, calls, texts };
}
