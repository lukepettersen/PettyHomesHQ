// Business texting rules (SPEC.md §11), kept pure so they can be unit tested (texting.test.ts).
import { normalizePhone } from "@/lib/normalize";

/** "952-243-7646" → "+19522437646"; null when it isn't a 10-digit US number. */
export function toE164(raw: string): string | null {
  const d = normalizePhone(raw ?? "");
  return /^[2-9]\d{9}$/.test(d) ? `+1${d}` : null;
}

// Twilio's standard opt-out / opt-in words. Twilio stops texts on its side too; HQ mirrors it with the
// Unsubscribed tag so nobody on the team texts them by mistake.
const STOP_WORDS = ["STOP", "STOPALL", "STOP ALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "OPTOUT", "OPT OUT", "REVOKE"];
const START_WORDS = ["START", "UNSTOP", "YES"];
const word = (body: string) => body.trim().replace(/[.!]+$/, "").replace(/\s+/g, " ").toUpperCase();
export const isStopWord = (body: string) => STOP_WORDS.includes(word(body));
export const isStartWord = (body: string) => START_WORDS.includes(word(body));

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** What Twilio does with a call: ring a cell (then `action` hears how it went), or say a message and hang up. */
export function voiceTwiml(o: { forwardTo?: string | null; callerId?: string; action?: string; say?: string }): string {
  const inner = o.forwardTo
    ? `<Dial timeout="20" answerOnBridge="true"${o.callerId ? ` callerId="${esc(o.callerId)}"` : ""}${o.action ? ` action="${esc(o.action)}"` : ""}>${esc(o.forwardTo)}</Dial>`
    : `<Say voice="Polly.Joanna">${esc(o.say ?? MISSED_SAY)}</Say><Hangup/>`;
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`;
}
export const EMPTY_TWIML = `<?xml version="1.0" encoding="UTF-8"?><Response/>`;
export const MISSED_SAY = "Sorry we missed your call. Please send a text to this number and we'll get right back to you.";
/** Dial outcomes that mean nobody picked up. */
export const missedDial = (status: string | null | undefined) => ["no-answer", "busy", "failed", "canceled"].includes(status ?? "");

/** Twilio error codes the team might see, in plain words. */
export function sendProblem(code: number | string | null | undefined, fallback = ""): string {
  switch (Number(code)) {
    case 21610: return "They've replied STOP, so texts to them are blocked. They can text START to opt back in.";
    case 21211: case 21614: return "That isn't a mobile number that can get texts.";
    case 21408: case 21612: return "Twilio can't text that number.";
    case 30034: case 30007: return "The carrier blocked it. Usually this means the business-texting registration (A2P 10DLC) isn't approved yet.";
    case 30003: case 30005: return "Their phone is off or the number no longer works.";
    case 30006: return "That's a landline or can't receive texts.";
    case 20003: return "The Twilio keys in Railway aren't working (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN).";
    default: return fallback || "Twilio didn't send it. Try again.";
  }
}

/** The moment today began in Central time, for the daily send limit. */
export function centralDayStart(now: Date = new Date()): Date {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
    .formatToParts(now).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  const offset = asUtc - Math.floor(now.getTime() / 1000) * 1000; // Central minus UTC
  return new Date(Date.UTC(+p.year, +p.month - 1, +p.day) - offset);
}

export const DEFAULT_DAILY_CAP = 200;
export const MAX_TEXT = 1600;
