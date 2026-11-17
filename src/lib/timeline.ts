// Which timeline entries people can edit or delete (owner request 2026-10-23). Pure, tested.

/**
 * Notes, logged calls and logged texts that someone typed. Not texts and emails HQ sent or received, answered or
 * missed calls, completed tasks or system lines: those are records of what actually happened.
 */
export function canEditEntry(e: { kind: string; outcome: string | null; authorId: string | null }): boolean {
  if (!e.authorId) return false;
  if (e.kind === "note") return true;
  if (e.kind === "call") return !["Answered", "Missed call"].includes(e.outcome ?? "");
  if (e.kind === "text") return !e.outcome; // HQ's own texts are "Sent" / "Received"; logged texts have no outcome
  return false;
}
