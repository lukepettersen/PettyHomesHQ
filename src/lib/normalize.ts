// Small pure helpers shared by server and UI. Unit tested in normalize.test.ts.

/** Digits only, US numbers trimmed to 10 digits, so "(612) 555-0101" and "+1 612 555 0101" match. */
export function normalizePhone(raw: string): string {
  const d = raw.replace(/\D/g, "");
  return d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
}

export function formatPhone(raw: string): string {
  const d = normalizePhone(raw);
  // Owner's format (2026-10-14): 952-250-4114.
  return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : raw.trim();
}

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** "Sam Ortiz & Lena Brooks" → "Sam" ; used for greetings and labels. */
export function firstName(name: string): string {
  return name.split("&")[0].trim().split(/\s+/)[0] ?? name;
}

export function initials(name: string): string {
  const words = name.split("&")[0].trim().split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] ?? "") + (words.length > 1 ? words[words.length - 1][0] : "")).toUpperCase();
}

/** Couple display name: same last name → "Sam & Lena Ortiz", different → "Sam Ortiz & Lena Brooks". */
export function coupleName(a: { first: string; last: string }, b?: { first: string; last: string }): string {
  const one = [a.first, a.last].filter(Boolean).join(" ").trim();
  if (!b || !b.first.trim()) return one;
  const bLast = b.last.trim() || a.last.trim();
  return bLast === a.last.trim() ? `${a.first.trim()} & ${b.first.trim()} ${bLast}`.trim() : `${one} & ${b.first.trim()} ${bLast}`.trim();
}

/** Store calendar dates at UTC midnight; read them back the same way so time zones never shift a birthday. */
export function dateFromIso(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}
export function isoFromDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function shortDate(d: Date, withYear = false): string {
  return `${MON[d.getUTCMonth()]} ${d.getUTCDate()}${withYear ? `, ${d.getUTCFullYear()}` : ""}`;
}

/** Days from today (Central time) until the next yearly occurrence of a date. */
export function daysUntilNext(d: Date, today: Date = todayCentral()): number {
  const t = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  let next = Date.UTC(today.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  if (next < t) next = Date.UTC(today.getUTCFullYear() + 1, d.getUTCMonth(), d.getUTCDate());
  return Math.round((next - t) / 86400000);
}

/** Today's calendar date in America/Chicago, as a UTC-midnight Date. */
export function todayCentral(now: Date = new Date()): Date {
  const iso = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  return dateFromIso(iso);
}

export function daysAgo(d: Date | null | undefined, now: Date = new Date()): number | null {
  if (!d) return null;
  return Math.floor((now.getTime() - d.getTime()) / 86400000);
}
