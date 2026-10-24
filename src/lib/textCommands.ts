// Texting HQ commands from your own cell to your own HQ number (owner request 2026-10-24). Pure, tested.

export type TextCommand = { kind: "task"; words: string } | { kind: "help" };

/** "task call lender re Ortiz Fri 9am" → a task; "help" → the list. Anything else is a normal text. */
export function parseTextCommand(body: string): TextCommand | null {
  const m = /^\s*(task|help|commands)\b[\s:,-]*([\s\S]*)$/i.exec(body);
  if (!m) return null;
  return m[1].toLowerCase() === "task" ? { kind: "task", words: m[2].trim() } : { kind: "help" };
}

export const COMMAND_HELP = 'HQ commands: "task" then the task, like the Tasks box: task call lender re Ortiz Fri 9am (also tomorrow, next week, every month, #list, @alyssa). Text "help" for this list.';
