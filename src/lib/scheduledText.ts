// Scheduled texts (owner request 2026-10-28): rules for the date and time picked. Pure, tested.

/** "2026-10-30" + "09:15" in Central time → the moment it happens (handles daylight saving). */
export function centralToUtc(date: string, time: string): Date {
  const [y, mo, d] = date.split("-").map(Number), [h, mi] = time.split(":").map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  // Central's offset at that moment: format the guess in Chicago time and compare.
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
    .formatToParts(new Date(guess)).map((x) => [x.type, x.value]));
  const shown = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
  return new Date(guess + (guess - shown));
}

export const SEND_FROM = "08:00", SEND_UNTIL = "20:00";
/** Times on the half hour from 8:00am to 8:00pm (owner: 30-minute steps). */
export const SCHEDULE_TIMES = Array.from({ length: 25 }, (_, i) => `${String(8 + Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`);

/** Why this date and time can't be used, or null: at least 5 minutes ahead, within a year, 8am–8pm Central (quiet hours). */
export function scheduleProblem(date: string, time: string, now: Date = new Date()): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return "Pick a date and a time.";
  if (!time.endsWith(":00") && !time.endsWith(":30")) return "Pick a time on the hour or half hour.";
  if (time < SEND_FROM || time > SEND_UNTIL) return "Texts go out between 8:00am and 8:00pm Central (quiet hours).";
  const at = centralToUtc(date, time).getTime();
  if (at < now.getTime() + 5 * 60000) return "Pick a time at least 5 minutes from now.";
  if (at > now.getTime() + 366 * 86400000) return "Pick a date within the next year.";
  return null;
}

/** "Thu Oct 30 at 9:15am" */
export function scheduleLabel(at: Date): string {
  const day = at.toLocaleDateString("en-US", { timeZone: "America/Chicago", weekday: "short", month: "short", day: "numeric" }).replace(",", "");
  const t = at.toLocaleTimeString("en-US", { timeZone: "America/Chicago", hour: "numeric", minute: "2-digit" }).replace(" ", "").toLowerCase();
  return `${day} at ${t}`;
}
