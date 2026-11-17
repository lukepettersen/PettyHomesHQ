// Mass email from People (SPEC.md §6.2): who gets it, the unsubscribe link and the footer. Pure, unit tested
// in bulkEmail.test.ts. Uses Node crypto, so server only.
import { createHmac, timingSafeEqual } from "node:crypto";

/** Tags that mean "don't email": opted out of email, texted STOP, or the address bounced. */
// "Unsubscribed" (from Follow Up Boss) was merged into "Email Unsubscribed" on 2026-10-24; still honored if re-added.
export const NO_EMAIL_TAGS = ["Email Unsubscribed", "Unsubscribed", "Bounced"];
export const EMAIL_UNSUB_TAG = "Email Unsubscribed";
export const BULK_MAX = 1000; // Google Workspace allows about 2,000 a day; keep room for normal email

/** Kinds of mass email people can unsubscribe from one at a time (owner request 2026-11-02); edited in Admin → Email templates. */
export const DEFAULT_EMAIL_KINDS = ["Monthly newsletter", "Events & invites", "Market updates"];
/** The tag for "unsubscribed from this kind only"; "Email Unsubscribed" still means every kind. */
export const kindTag = (kind: string) => `Unsubscribed: ${kind}`;
/** Saved kinds: trimmed, no repeats or blanks, at most 12. */
export function cleanKinds(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : [];
  const seen = new Set<string>();
  return list.map((k) => k.trim().replace(/\s+/g, " ").slice(0, 40)).filter((k) => k && !seen.has(k.toLowerCase()) && seen.add(k.toLowerCase())).slice(0, 12);
}

type P = { id: string; name: string; emails: string[]; tags: string[] };
/** Who gets the email (their first address) and why the rest are skipped. With a kind, people unsubscribed from just
 *  that kind are skipped too; people unsubscribed from other kinds still get it. */
export function pickRecipients(people: P[], kind?: string) {
  const send: { personId: string; name: string; email: string }[] = [];
  const skipped = { noEmail: 0, optedOut: 0 };
  const seen = new Set<string>();
  for (const p of people) {
    if (p.tags.some((t) => NO_EMAIL_TAGS.includes(t) || (!!kind && t === kindTag(kind)))) { skipped.optedOut++; continue; }
    const email = p.emails.map((e) => e.trim().toLowerCase()).find((e) => e && !seen.has(e));
    if (!email) { skipped.noEmail++; continue; }
    seen.add(email);
    send.push({ personId: p.id, name: p.name, email });
  }
  return { send, skipped };
}

/** A token that proves an unsubscribe link came from HQ for this person (no sign-in needed to use it). */
export const unsubToken = (personId: string, secret: string) => createHmac("sha256", secret).update(`unsub:${personId}`).digest("base64url").slice(0, 24);
export function validUnsub(personId: string, token: string, secret: string) {
  const a = Buffer.from(unsubToken(personId, secret)), b = Buffer.from(token ?? "");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** The required footer for marketing email: who it's from, a mailing address, and how to stop. */
export const bulkFooter = (address: string, unsubUrl: string) =>
  `\n\n---\nPetty Homes LLC · ${address.trim()}\nDon't want these emails? [Unsubscribe](${unsubUrl})`;
