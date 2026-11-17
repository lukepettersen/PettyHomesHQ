// Mass text from People (owner request 2026-11-06), for events. Pure rules, tested in bulkText.test.ts.
// One text per contact from the sender's HQ number; a contact with two or more numbers (a couple) gets ONE group
// text with all of them. Sent slowly in the background so it reads like a person texting, inside daytime hours,
// and never past the number's daily cap (it picks up again the next morning).

import { centralToUtc } from "@/lib/scheduledText";

export const BULK_TEXT_MAX = 2000;
export const OPT_OUT = "Reply STOP to opt out.";
/** Mass texts go out 9am–7pm Central (narrower than the 8am–8pm quiet-hours rule for one-off texts). */
export const BULK_FROM = "09:00", BULK_UNTIL = "19:00";
/** A random 60–120 second gap between texts. */
export const GAP_MIN_S = 60, GAP_MAX_S = 120;

export type TextRecipient = { personId: string; name: string; numbers: string[] };

/** Who can get it: contacts with a phone who haven't replied STOP. Numbers are deduped (digits only). */
export function pickTextRecipients(people: { id: string; name: string; phones: string[]; tags: string[] }[], stopTag: string) {
  const send: TextRecipient[] = [];
  let noPhone = 0, optedOut = 0;
  for (const p of people) {
    if (p.tags.some((t) => t.toLowerCase() === stopTag.toLowerCase())) { optedOut++; continue; }
    const numbers = [...new Set(p.phones.map((n) => n.replace(/\D/g, "").replace(/^1(\d{10})$/, "$1")).filter((n) => n.length === 10))];
    if (!numbers.length) { noPhone++; continue; }
    send.push({ personId: p.id, name: p.name, numbers });
  }
  return { send, skipped: { noPhone, optedOut } };
}

/** The text as sent: their words, then the opt-out line (carriers expect it on marketing texts). */
export function withOptOut(body: string): string {
  const t = body.trim();
  return /reply stop/i.test(t) ? t : `${t}\n\n${OPT_OUT}`;
}

const centralDate = (now: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
const addDays = (iso: string, n: number) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

/** Inside today's sending hours? */
export function inBulkHours(now: Date = new Date()): boolean {
  const day = centralDate(now);
  return now >= centralToUtc(day, BULK_FROM) && now < centralToUtc(day, BULK_UNTIL);
}

/** The next time sending may start: now if inside hours, else 9am today (before hours) or 9am tomorrow. */
export function nextBulkStart(now: Date = new Date()): Date {
  const day = centralDate(now);
  if (now < centralToUtc(day, BULK_FROM)) return centralToUtc(day, BULK_FROM);
  if (now < centralToUtc(day, BULK_UNTIL)) return now;
  return centralToUtc(addDays(day, 1), BULK_FROM);
}

/** 9am tomorrow, Central (after the daily cap is reached). */
export const tomorrowStart = (now: Date = new Date()) => centralToUtc(addDays(centralDate(now), 1), BULK_FROM);

/** When the next text may go: a random 60–120 seconds after this one, moved to 9am when that's outside hours. */
export function nextAfterSend(now: Date = new Date(), rand: number = Math.random()): Date {
  const gap = (GAP_MIN_S + Math.floor(rand * (GAP_MAX_S - GAP_MIN_S + 1))) * 1000;
  return nextBulkStart(new Date(now.getTime() + gap));
}

/** Roughly when it finishes: one every ~90 seconds, 10 hours a day, at most `cap` texts a day. */
export function bulkDays(count: number, cap: number): number {
  const perDay = Math.max(1, Math.min(cap, Math.floor((10 * 3600) / 90)));
  return Math.max(1, Math.ceil(count / perDay));
}
