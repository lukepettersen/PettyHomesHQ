// ShowingTime emails (owner request 2026-11-01). "SHOWING CONFIRMED | <address> <day>, <m/d> <time>" means someone is
// showing one of our listings; "YOUR SHOWING CONFIRMED" is one we booked for a buyer (ignored), as are walk-throughs,
// agent previews and appraisals. "SHOWING CANCELLED" turns a showing's texts off; "SHOWING RESCHEDULED" is a request,
// so the old time's texts are turned off and the next "SHOWING CONFIRMED" starts fresh. Pure, so it's unit tested.

export type ShowingKind = "confirmed" | "cancelled" | "rescheduled";
export type ShowingEmail = {
  kind: ShowingKind; address: string; mlsId: string | null; date: string; start: string; end: string | null;
  was: { date: string; start: string } | null; // a reschedule's old time
  presentedBy: string; key: string; total: number | null;
  agent: { name: string; company: string; mobile: string; office: string; email: string };
  seller: { name: string; phone: string; email: string } | null;
};

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const PHONE = /\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

/** "12:30 PM" → "12:30". */
export function to24(t: string): string {
  const m = t.trim().match(/^(\d{1,2}):(\d{2})\s*([AP])M$/i);
  if (!m) return "";
  let h = Number(m[1]) % 12;
  if (m[3].toUpperCase() === "P") h += 12;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

/** The email as one line: table bars, empty link brackets and extra spaces removed. */
export function flat(text: string): string {
  return text.replace(/\[\]\([^)]*\)/g, " ").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/\([^)\s]*https?:\/\/[^)]*\)/g, " ").replace(/\((?:tel|mailto|sms):[^)]*\)/gi, " ")
    .replace(/https?:\/\/\S+/g, " ").replace(/[|*]/g, " ").replace(/\s+/g, " ").trim();
}

const title = (s: string) => (s === s.toUpperCase() ? s.toLowerCase().replace(/(^|[\s'-])\p{L}/gu, (c) => c.toUpperCase()) : s);

/** Splits "BRUCE NELSON Bridge Realty, LLC" into name and company: the name is the words found in their email
 *  address ("brucenelsonrealestate@…"), else the first two words. */
export function splitAgent(text: string, email: string): { name: string; company: string } {
  const words = text.trim().split(/\s+/);
  const local = email.split("@")[0].toLowerCase().replace(/[^a-z]/g, "");
  let n = 0;
  for (let k = Math.min(4, words.length - 1); k >= 2; k--) {
    if (words.slice(0, k).every((w) => w.replace(/[^a-z]/gi, "").length > 1 && local.includes(w.toLowerCase().replace(/[^a-z]/g, "")))) { n = k; break; }
  }
  if (!n) n = Math.min(2, words.length);
  return { name: title(words.slice(0, n).join(" ")), company: words.slice(n).join(" ").trim() };
}

/** What a ShowingTime email says, or null when HQ should leave it alone. `received` dates the year. */
export function parseShowingEmail(subject: string, body: string, received: Date): ShowingEmail | null {
  const sub = subject.replace(/\s+/g, " ").trim();
  const head = sub.match(/^SHOWING (CONFIRMED|CANCELL?ED|RESCHEDULED) \| (.+?),? (?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*, (\d{1,2})\/(\d{1,2}) (\d{1,2}:\d{2} [AP]M)$/i);
  if (!head) return null; // includes "YOUR SHOWING …", walk-throughs, previews, appraisals, feedback
  const kind: ShowingKind = /^CONF/i.test(head[1]) ? "confirmed" : /^CANC/i.test(head[1]) ? "cancelled" : "rescheduled";
  const t = flat(body);
  // Dates in the body ("Sunday, November 1, 2026") give the year; the subject's month/day is the new time.
  const longDates = [...t.matchAll(/(?:Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day, ([A-Z][a-z]+) (\d{1,2}), (\d{4})/g)].map((m) => {
    const mo = MONTHS.indexOf(m[1].toLowerCase()) + 1;
    return mo ? `${m[3]}-${String(mo).padStart(2, "0")}-${String(m[2]).padStart(2, "0")}` : "";
  }).filter(Boolean);
  const ranges = [...t.matchAll(/(\d{1,2}:\d{2}\s*[AP]M)\s*-\s*(\d{1,2}:\d{2}\s*[AP]M)/gi)].map((m) => [to24(m[1]), to24(m[2])] as const);
  const month = Number(head[3]), day = Number(head[4]);
  const guessYear = received.getUTCFullYear() + (month < received.getUTCMonth() + 1 - 6 ? 1 : 0);
  const date = longDates[0] ?? `${guessYear}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const start = to24(head[5]);
  const end = ranges[0]?.[0] === start ? ranges[0][1] : ranges.find((r) => r[0] === start)?.[1] ?? null;
  const was = kind === "rescheduled" && longDates[1] && ranges[1] ? { date: longDates[1], start: ranges[1][0] } : null;

  const presentedBy = t.match(/Presented by: (.+?) (?:Additional Listing Details|Showings by|$)/)?.[1]?.trim() ?? "";
  const mlsId = t.match(/ID# (\d+)/)?.[1] ?? null;
  const total = Number(t.match(/Total # of Showings: (\d+)/)?.[1]) || null;
  const conf = t.match(/\bLA [A-Z]+ [A-Z]+ (\d{5,})\b/)?.[1];

  const block = t.match(/Buyer'?s Agent Details (.+?) Listing Contacts/)?.[1] ?? "";
  const email = (block.match(EMAIL)?.[0] ?? "").toLowerCase();
  const phones = [...block.matchAll(PHONE)].map((m) => ({ n: m[0], office: /^\s*\(Office/i.test(block.slice((m.index ?? 0) + m[0].length)) }));
  const firstPhoneAt = block.search(PHONE);
  const who = splitAgent((firstPhoneAt > 0 ? block.slice(0, firstPhoneAt) : block.replace(EMAIL, "")).trim(), email);
  const agent = { ...who, mobile: phones.find((p) => !p.office)?.n ?? "", office: phones.find((p) => p.office)?.n ?? "", email };

  const contacts = t.match(/Listing Contacts (.+?)(?: For questions| Free Downloadable|$)/)?.[1] ?? "";
  const sm = contacts.match(/^(.+?) \((?:Owner|Seller|Occupant|Tenant)[^)]*\)/i);
  const seller = sm ? { name: sm[1].trim(), phone: contacts.match(PHONE)?.[0] ?? "", email: (contacts.match(EMAIL)?.[0] ?? "").toLowerCase() } : null;

  const address = head[2].replace(/\s+Unit#\s*#?/i, " #").replace(/,?\s*MINNESOTA\b/i, ", MN").trim();
  const key = kind === "confirmed" && conf ? `st:${conf}` : `${address.toLowerCase()}|${date}|${start}`;
  if (!start || !agent.name) return null;
  return { kind, address, mlsId, date, start, end, was, presentedBy, key, total, agent, seller };
}

/** The house number and first street word ("4385 Trenton"), for finding that listing's own text template. */
export function streetKey(address: string): string | null {
  const m = address.match(/^(\d+[A-Za-z]?)\s+(?:(?:N|S|E|W|NE|NW|SE|SW|North|South|East|West)\.?\s+)?([A-Za-z0-9]+)/);
  return m ? `${m[1]} ${m[2]}` : null;
}

/** The template for this listing's pre-showing text: its name has the house number and street, and "showing"
 *  (not "feedback"). Others for the same listing (like "MLS Favorite") are skipped. */
export function pickListingTemplate<T extends { name: string }>(templates: T[], address: string): T | null {
  const k = streetKey(address);
  if (!k) return null;
  const [num, street] = k.toLowerCase().split(" ");
  const forListing = templates.filter((t) => { const n = ` ${t.name.toLowerCase().replace(/[^a-z0-9]+/g, " ")} `; return n.includes(` ${num} `) && n.includes(` ${street} `); });
  return forListing.find((t) => /showing/i.test(t.name) && !/feedback/i.test(t.name)) ?? null;
}
