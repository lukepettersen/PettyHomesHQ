import { parseQuickAdd } from "@/lib/tasks";
// Texting HQ commands from your own cell to your own HQ number (owner request 2026-10-24). Pure, tested.

export type NewContact = { name: string; phone: string; email: string };
export type TextCommand = { kind: "task"; words: string } | { kind: "contact"; contact: NewContact } | { kind: "help" };

/** "Jane Smith 612-555-1234 jane@x.com" (any order) → name, phone, email (owner request 2026-10-27). All-lowercase names get capitals. */
export function parseContact(words: string): NewContact {
  let rest = words;
  const email = /[^\s@<>,;"]+@[^\s@<>,;"]+\.[A-Za-z]{2,}/.exec(rest)?.[0] ?? "";
  if (email) rest = rest.replace(email, " ");
  const phoneMatch = /(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/.exec(rest);
  const phone = phoneMatch ? phoneMatch[0].replace(/\D/g, "").slice(-10) : "";
  if (phoneMatch) rest = rest.replace(phoneMatch[0], " ");
  let name = rest.replace(/[,;]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 160);
  if (name === name.toLowerCase()) name = name.replace(/(^|[\s&'-])([a-z])/g, (_, a: string, b: string) => a + b.toUpperCase());
  return { name, phone, email: email.toLowerCase() };
}

/** "task call lender re Ortiz Fri 9am" → a task; "help" → the list. Anything else is a normal text. */
export function parseTextCommand(body: string): TextCommand | null {
  const m = /^\s*(task|(?:new |add )?contact|help|commands)\b[\s:,-]*([\s\S]*)$/i.exec(body);
  if (!m) return null;
  const k = m[1].toLowerCase();
  return k === "task" ? { kind: "task", words: m[2].trim() } : k.endsWith("contact") ? { kind: "contact", contact: parseContact(m[2]) } : { kind: "help" };
}

export const COMMAND_HELP = 'HQ commands: "task" then the task, like the Tasks box: task call lender re Ortiz Fri 9am (also tomorrow, next week, every month, #list, @alyssa). "contact" then a name, number and email adds a person: contact Jane Smith 612-555-1234 jane@gmail.com. Text "help" for this list.';

/** A reply to an "Ask by text" question (owner request 2026-10-30): yes, no, or neither (then it's a normal text). */
export function parseYesNo(body: string): "yes" | "no" | null {
  const t = body.trim().toLowerCase().replace(/[.!\s]+$/g, "");
  if (/^(y|yes|yep|yeah|yup|done|completed?|it did|👍|✅)$/.test(t)) return "yes";
  if (/^(n|no|nope|not yet|nah|didn'?t happen|👎)$/.test(t)) return "no";
  return null;
}

/** The question HQ texts: 'HQ check-in for Hayley & Beau: "Consult done?" Reply YES if it's done (moves them to Consult complete), or NO.' */
export function askText(o: { title: string; person: string | null; movesTo: string | null }): string {
  return `HQ check-in${o.person ? ` for ${o.person}` : ""}: "${o.title}" Reply YES if it's done${o.movesTo ? ` (moves them to ${o.movesTo})` : ""}, or NO to leave it open.`;
}

export type ConsultReply = { kind: "no" } | { kind: "book"; type: "buyer" | "seller" | null; date: string | null; time: string | null };
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/**
 * A reply to "did you set a consult?" (owner request 2026-10-30): "buyer Wed 7pm", "seller tomorrow 10am", "11/6 6:30pm",
 * "Nov 6 at 3", or NO. Missing pieces come back null so HQ can ask for them. Null overall when it isn't an answer.
 */
export function parseConsultReply(body: string, today: string): ConsultReply | null {
  if (parseYesNo(body) === "no") return { kind: "no" };
  let s = ` ${body.toLowerCase().replace(/[,.!]/g, " ")} `;
  const type = /\b(seller|selling|listing)\b/.test(s) ? "seller" : /\b(buyer|buying)\b/.test(s) ? "buyer" : null;
  // "11/6" or "11/6/26", and "Nov 6": dates the quick-add parser doesn't know.
  let date: string | null = null;
  const year = +today.slice(0, 4);
  const pick = (m: number, d: number) => {
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    let iso = `${year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    if (iso < today) iso = `${year + 1}${iso.slice(4)}`; // a date already past means next year
    return iso;
  };
  let m = s.match(/\s(\d{1,2})\/(\d{1,2})(?:\/\d{2,4})?(?=\s)/);
  if (m) { date = pick(+m[1], +m[2]); s = s.replace(m[0], " "); }
  else if ((m = s.match(/\s(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+(\d{1,2})(?:st|nd|rd|th)?(?=\s)/))) {
    date = pick(MONTHS.indexOf(m[1].slice(0, 3)) + 1, +m[2]); s = s.replace(m[0], " ");
  }
  // "at 3" / "@ 7": a bare hour means afternoon or evening (8am–7pm is when consults happen), so 3 → 3pm, 9 → 9am.
  s = s.replace(/\s(?:at|@)\s*(\d{1,2})(?::(\d{2}))?(?=\s)(?!\s*(?:am|pm))/, (_, h, mm) => ` ${h}${mm ? `:${mm}` : ""}${+h >= 8 && +h <= 11 ? "am" : "pm"} `);
  const q = parseQuickAdd(s, today);
  if (!date && q.due) date = q.due;
  const time = q.time ?? null;
  if (!type && !date && !time) return null;
  // More than a few other words ("Jack swing by his house today 10:30") is something else, for the text assistant.
  const extra = q.title.replace(/\b(seller|selling|listing|buyer|buying|consult(ation)?|meeting|appt|appointment|is|it's|its|on|at|for|the|a|we|set|booked|book|yes|yeah|yep|ok|okay)\b/gi, " ").trim().split(/\s+/).filter(Boolean);
  if (extra.length > 2) return null;
  return { kind: "book", type, date, time };
}
