// Bringing contacts over from Follow Up Boss (SPEC.md §15). Pure, unit tested in fubImport.test.ts:
// what's in the FUB data (summary), the suggested matching (defaultPlan), and one FUB person → HQ (applyPlan).

/** A FUB person, as pulled from the FUB API and stored for the import. */
export type FubPerson = {
  id: number; firstName: string; lastName: string; stage: string; source: string; assignedTo: string; tags: string[];
  emails: { value: string; type: string }[]; phones: { value: string; type: string }[];
  address: string;
  custom: Record<string, string>; // FUB custom fields that have a value, by label ("Birthday 1", "Mailing Name"…)
};

export type StageRule = { action: "import" | "skip"; stage: string; followUp: number | null; type: string | null };
export type TagRule = "keep" | "skip" | `type:${string}`;
export type SourceRule = { source: string; type: string | null }; // source "" = leave blank
/** Which FUB custom field fills each HQ field (by label; "" = none). */
export type FieldMap = { mailingName: string; homeiversary: string; referredBy: string; birthdays: string[] };
export type Plan = {
  fields: FieldMap;
  stages: Record<string, StageRule>; tags: Record<string, TagRule>; sources: Record<string, SourceRule>;
  agents: Record<string, string | null>; // FUB agent name → HQ user id
};

export type Summary = { total: number; stages: [string, number][]; tags: [string, number][]; sources: [string, number][]; agents: [string, number][]; custom: [string, number][] };
const count = (values: string[]) => {
  const m = new Map<string, number>();
  for (const v of values) m.set(v, (m.get(v) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
};
export function summarize(people: FubPerson[]): Summary {
  return {
    total: people.length, stages: count(people.map((p) => p.stage || "(no stage)")), tags: count(people.flatMap((p) => p.tags)),
    sources: count(people.map((p) => p.source).filter(Boolean)), agents: count(people.map((p) => p.assignedTo).filter(Boolean)),
    custom: count(people.flatMap((p) => Object.keys(p.custom ?? {}))),
  };
}

/** A partner type a source or tag name points to: "Bell Bank Mortgage" → lender, "Edina Title" → title. */
export function typeFromName(name: string): string | null {
  const n = name.toLowerCase();
  if (/lend|mortgage|loan|bank/.test(n)) return "lender";
  if (/title|closing co|escrow/.test(n)) return "title";
  if (/inspect/.test(n)) return "inspector";
  if (/attorney|law\b|lawyer/.test(n)) return "attorney";
  return null;
}

// FUB tags that were import leftovers or automation switches, not real lists (owner decision 2026-10-14).
const SKIP_TAGS = [/^import$/i, /^imported stage:/i, /^gavyn schacher$/i, /^offer$/i, /^under contract$/i, /^new construction$/i];

/** The suggested matching, from the owner's decisions (SPEC.md §15). Every line can be changed on the import screen. */
export function defaultPlan(s: Summary, hq: { stages: string[]; sources: string[]; users: { id: string; name: string }[] }): Plan {
  const has = (name: string) => hq.stages.find((x) => x.toLowerCase() === name.toLowerCase());
  const stages: Record<string, StageRule> = {};
  for (const [st] of s.stages) {
    const sphere = /^(\d+)\s*day\s*sphere$/i.exec(st);
    stages[st] =
      sphere ? { action: "import", stage: has("Sphere") ?? "Sphere", followUp: Number(sphere[1]), type: null }
      : /^(industry partners?|realtors?|real estate agents?)$/i.test(st) ? { action: "import", stage: has("Industry Partners") ?? "Industry Partners", followUp: null, type: "realtor" }
      : /^archive/i.test(st) ? { action: "import", stage: has("Archive") ?? "Archive", followUp: null, type: null }
      : /petty homes admin|^trash$|^\(no stage\)$/i.test(st) ? { action: "skip", stage: "", followUp: null, type: null }
      : { action: "import", stage: has(st) ?? st, followUp: null, type: null }; // Lead, Passive Marketing, Past Client… (a new stage if HQ lacks it)
  }
  const tags: Record<string, TagRule> = {};
  for (const [t] of s.tags) tags[t] = SKIP_TAGS.some((r) => r.test(t)) ? "skip" : /^realtors?$/i.test(t) ? "type:realtor" : typeFromName(t) ? `type:${typeFromName(t)}` : "keep";
  const sources: Record<string, SourceRule> = {};
  for (const [src] of s.sources) sources[src] = { source: hq.sources.find((x) => x.toLowerCase() === src.toLowerCase()) ?? src, type: typeFromName(src) };
  const agents: Record<string, string | null> = {};
  for (const [a] of s.agents) {
    const first = a.split(/\s+/)[0].toLowerCase();
    agents[a] = hq.users.find((u) => u.name.toLowerCase() === a.toLowerCase())?.id ?? hq.users.find((u) => u.name.split(/\s+/)[0].toLowerCase() === first)?.id ?? null;
  }
  const labels = s.custom.map(([l]) => l);
  const find = (re: RegExp) => labels.find((l) => re.test(l)) ?? "";
  const birthdayNo = (l: string) => Number(/\d+/.exec(l)?.[0] ?? 1);
  const fields: FieldMap = {
    mailingName: find(/mailing\s*name/i), homeiversary: find(/homeiversary|home\s*anniversary/i), referredBy: find(/referred\s*by/i),
    birthdays: labels.filter((l) => /birthday|bday/i.test(l) && !/no bday/i.test(l)).sort((a, b) => birthdayNo(a) - birthdayNo(b)),
  };
  return { fields, stages, tags, sources, agents };
}

export type HqPerson = {
  fubId: number; name: string; first: string; last: string; stage: string; followUpDays: number | null; partnerType: string | null; source: string;
  tags: string[]; emails: { address: string; label: string }[]; phones: { number: string; label: string }[]; address: string;
  birthdays: { whose: string; date: string }[]; homeiversary: string | null; mailingName: string; referredBy: string; assignedToId: string | null;
};

/** "1985-04-12", "04/12/1985", "4/12/85" → "1985-04-12"; anything else → null. */
export function fubDate(v: string): string | null {
  const s = (v ?? "").trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(s);
  if (m) return iso(m[3].length === 2 ? (+m[3] > 30 ? 1900 : 2000) + +m[3] : +m[3], +m[1], +m[2]);
  return null;
}
const iso = (y: number, mo: number, d: number) => (mo >= 1 && mo <= 12 && d >= 1 && d <= 31 && y > 1900 ? `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}` : null);

/** One FUB person → what HQ will save, or null when their stage is skipped. */
export function applyPlan(p: FubPerson, plan: Plan): HqPerson | null {
  const rule = plan.stages[p.stage || "(no stage)"];
  if (!rule || rule.action === "skip") return null;
  const tagRules = p.tags.map((t) => [t, plan.tags[t] ?? "keep"] as const);
  // The FUB "Past Client" tag makes them a Past Client, keeping their old stage's follow-up (owner decision 2026-10-14).
  const pastClient = p.tags.some((t) => /^past client$/i.test(t)) && !rule.type;
  // Partners: the stage says Realtor unless their source or a tag says lender, title… (owner decision 2026-10-14).
  const src = p.source ? plan.sources[p.source] : undefined;
  const tagType = tagRules.map(([, r]) => (r.startsWith("type:") ? r.slice(5) : null)).find((x) => x && x !== "realtor") ?? null;
  const partnerType = rule.type ? (src?.type && src.type !== "realtor" ? src.type : tagType ?? rule.type) : null;
  const first = p.firstName.trim(), last = p.lastName.trim();
  const name = [first, last].filter(Boolean).join(" ") || p.emails[0]?.value || "Unnamed";
  const c = (label: string) => (label ? (p.custom?.[label] ?? "").trim() : "");
  return {
    fubId: p.id, name, first, last, stage: pastClient ? "Past Client" : rule.stage, followUpDays: rule.followUp, partnerType,
    source: src?.source ?? "", tags: tagRules.filter(([, r]) => r === "keep").map(([t]) => t),
    emails: p.emails.filter((e) => e.value?.includes("@")).map((e) => ({ address: e.value.trim(), label: e.type || "" })),
    phones: p.phones.filter((x) => x.value?.replace(/\D/g, "").length >= 7).map((x) => ({ number: x.value.trim(), label: x.type || "Mobile" })),
    address: p.address.trim(),
    birthdays: plan.fields.birthdays.map((l) => fubDate(c(l))).flatMap((d, i) => (d ? [{ whose: i === 0 ? first : "", date: d }] : [])),
    homeiversary: fubDate(c(plan.fields.homeiversary)), mailingName: c(plan.fields.mailingName), referredBy: c(plan.fields.referredBy),
    assignedToId: plan.agents[p.assignedTo] ?? null,
  };
}
