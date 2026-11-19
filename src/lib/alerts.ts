// Bell alerts: the title on each pop-up, which kind it is, and which kinds each person wants to pop up with a chime
// (owner request 2026-11-19: "options for which things to allow notifications for"). Pure, tested in alerts.test.ts.
// Owner report 2026-11-02: a website lead popped up as "New offer submitted"; every alert now gets its own title.

export type AlertKind = "text" | "group" | "missed" | "offer" | "lead" | "paperwork" | "showing" | "problem" | "task" | "mention" | "newShowing" | "email" | "bulk" | "other";
export type AlertPrefs = Record<AlertKind, boolean>;
type Item = { text: string; link: string | null };

/** Every kind, in the order My settings lists them. "other" isn't listed: anything new HQ adds always pops up. */
export const ALERT_KINDS: { key: Exclude<AlertKind, "other">; label: string; hint: string; on: boolean; optIn?: boolean }[] = [
  { key: "text", label: "New texts", hint: "A text to your HQ number", on: true },
  { key: "group", label: "Group texts", hint: "A new message in a group text", on: true },
  { key: "missed", label: "Missed calls", hint: "A call to your HQ number nobody answered", on: true },
  { key: "offer", label: "Offers submitted", hint: "A teammate submitted an offer", on: true },
  { key: "lead", label: "Website leads", hint: "Someone filled out a form on the website", on: true },
  { key: "paperwork", label: "Paperwork", hint: "A paperwork request for you, or yours is ready to sign", on: true },
  { key: "showing", label: "Showing emails", hint: "A ShowingTime email HQ couldn't read", on: true },
  { key: "problem", label: "Didn't send", hint: "A scheduled or automatic text or email that couldn't go out", on: true },
  { key: "task", label: "Tasks given to you", hint: "A teammate gave you a task", on: false },
  { key: "mention", label: "@mentions", hint: "A teammate mentioned you in a note", on: false },
  { key: "newShowing", optIn: true, label: "New showings", hint: "A showing booked through ShowingTime, on our listing or one we're showing", on: false },
  { key: "email", optIn: true, label: "Client emails", hint: "An email from a contact in HQ to your Gmail", on: false },
  { key: "bulk", optIn: true, label: "Mass text or email finished", hint: "A mass text or email you started has gone to everyone", on: false },
]
export const ALERT_DEFAULTS = Object.fromEntries([...ALERT_KINDS.map((k) => [k.key, k.on]), ["other", true]]) as AlertPrefs;

/** A test alert from My settings: "Test (offer): …" pops up like that kind would. */
export const testText = (kind: AlertKind, from: string) => `Test (${kind}): ${from} sent this to check how this alert looks and sounds.`;

export function alertKind(n: Item): AlertKind {
  const t = n.text;
  const test = t.match(/^Test \(([a-zA-Z]+)\): /)?.[1];
  if (test) return ALERT_KINDS.some((k) => k.key === test) ? (test as AlertKind) : "other";
  if (n.link?.startsWith("/messages")) return t.startsWith("Missed call") ? "missed" : t.startsWith("Group text") ? "group" : "text";
  if (/^New website lead|^Website form from/.test(t)) return "lead";
  if (/ submitted an offer for /.test(t)) return "offer";
  if (/^New showing|^Showing booked/.test(t)) return "newShowing";
  if (/^Email from /.test(t)) return "email";
  if (/^Mass (text|email) finished/.test(t)) return "bulk";
  if (/ gave you a task/.test(t)) return "task";
  if (/ mentioned you on /.test(t)) return "mention";
  if (/wasn't sent|couldn't text you|couldn't send/i.test(t)) return "problem";
  if (/ in ClickContracts| ready to sign in ClickContracts/.test(t)) return "paperwork";
  if (/^Showing|ShowingTime/i.test(t)) return "showing";
  return "other";
}

export function alertHeading(n: Item): string {
  const t = n.text;
  switch (alertKind(n)) {
    case "missed": return "Missed call";
    case "text": return "New text";
    case "group": return "New group text";
    case "lead": return "New website lead";
    case "offer": return "New offer submitted";
    case "task": return "New task for you";
    case "mention": return "You were mentioned";
    case "problem": return "Didn't send";
    case "paperwork": return /ready to sign/.test(t) ? "Paperwork ready" : "Paperwork request";
    case "showing": return "Showing";
    case "newShowing": return "New showing";
    case "email": return "New email";
    case "bulk": return "Mass send finished";
    default: return "HQ alert";
  }
}

export function cleanAlertPrefs(v: unknown): AlertPrefs {
  const src = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  const out = { ...ALERT_DEFAULTS };
  for (const { key } of ALERT_KINDS) if (typeof src[key] === "boolean") out[key] = src[key] as boolean;
  return out;
}

/** Whether a bell item pops up with a chime for this person. */
export const popsUp = (n: Item, prefs: AlertPrefs) => prefs[alertKind(n)] ?? true;

export const alertKey = (userId: string) => `alerts.${userId}`;
