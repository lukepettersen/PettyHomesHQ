// Group texting rules (SPEC.md §11, owner request 2026-10-22), kept pure so they can be unit tested.
import { normalizePhone } from "@/lib/normalize";

/** Group texts are stored under their Twilio Conversation SID instead of a phone number. */
export const isGroupKey = (s: string | null | undefined) => /^CH[0-9a-f]{32}$/i.test(s ?? "");
/** Twilio allows 10 people in a group text, us included. */
export const MAX_GROUP = 10;

type Binding = { type?: string; address?: string | null; proxy_address?: string | null; projected_address?: string | null } | null;
export type Participant = { identity?: string | null; messaging_binding?: Binding };

/**
 * Reads a Conversation's participants: which team number it's on, the other people (digits), whether it's a group
 * text, and our own sending identity in a group (a participant using our number as its projected address).
 */
export function readParticipants(parts: Participant[], teamNumbers: string[]) {
  const team = new Set(teamNumbers);
  let ourNumber: string | null = null, sender: string | null = null, group = false;
  const members: string[] = [];
  for (const p of parts) {
    const b = p.messaging_binding ?? null;
    if (b?.type === "group" || b?.projected_address) group = true;
    for (const n of [b?.proxy_address, b?.projected_address]) if (n && team.has(n)) ourNumber ??= n;
    if (b?.projected_address && team.has(b.projected_address) && p.identity) sender ??= p.identity;
    if (b?.address) {
      if (team.has(b.address)) ourNumber ??= b.address;
      else members.push(normalizePhone(b.address));
    }
  }
  if (members.length > 1) group = true;
  return { ourNumber, members: [...new Set(members)], group, sender };
}

/** "Alyce LaCoursiere & Maxwell Becker, Luke Pettersen" for the thread list. */
export const groupTitle = (names: string[]) => (names.length ? names.join(", ") : "Group text");
