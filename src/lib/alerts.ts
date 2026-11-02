// The title on an alert pop-up (and the desktop notification). Pure, tested in alerts.test.ts.
// Owner report 2026-11-02: a website lead popped up as "New offer submitted"; every alert now gets its own title.
export function alertHeading(n: { text: string; link: string | null }): string {
  const t = n.text;
  if (n.link?.startsWith("/messages")) return t.startsWith("Missed call") ? "Missed call" : t.startsWith("Group text") ? "New group text" : "New text";
  if (/^New website lead|^Website form from/.test(t)) return "New website lead";
  if (/ submitted an offer for /.test(t)) return "New offer submitted";
  if (/ gave you a task/.test(t)) return "New task for you";
  if (/wasn't sent|couldn't text you|couldn't send/i.test(t)) return "Didn't send";
  if (/^Showing|ShowingTime/i.test(t)) return "Showing";
  return "HQ alert";
}
