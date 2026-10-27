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
