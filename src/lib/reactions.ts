// iPhone reactions (tapbacks) sent to a business number arrive as ordinary texts, e.g. Loved “See you tomorrow!”.
// HQ shows them as a small icon on the message they react to (owner request 2026-10-22). Pure, tested.

const KINDS: [RegExp, string][] = [
  [/^Loved$/i, "❤️"], [/^Liked$/i, "👍"], [/^Disliked$/i, "👎"], [/^Laughed at$/i, "😂"], [/^Emphasized$/i, "‼️"], [/^Questioned$/i, "❓"],
];
const QUOTED = /^(.+?) [“"](.+)[”"]\s*$/s;

export type Reaction = { emoji: string; target: string; removed: boolean };

/** Loved “…”, Reacted 🎉 to “…”, Removed a heart from “…” → the icon and the quoted text; null for a normal text. */
export function parseReaction(body: string): Reaction | null {
  const m = QUOTED.exec(body.trim());
  if (!m) return null;
  const [, verb, target] = m;
  const custom = /^Reacted (\S+) to$/i.exec(verb);
  if (custom) return { emoji: custom[1], target, removed: false };
  const removed = /^Removed (?:a|an) (heart|like|dislike|laugh|exclamation|question mark|\S+) from$/i.exec(verb);
  if (removed) {
    const map: Record<string, string> = { heart: "❤️", like: "👍", dislike: "👎", laugh: "😂", exclamation: "‼️", "question mark": "❓" };
    return { emoji: map[removed[1].toLowerCase()] ?? removed[1], target, removed: true };
  }
  const kind = KINDS.find(([re]) => re.test(verb));
  return kind ? { emoji: kind[1], target, removed: false } : null;
}

const plain = (s: string) => s.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim();
/** Does a message match the quoted text? iPhones shorten long ones with "…". */
export function reactsTo(target: string, body: string): boolean {
  const t = plain(target), b = plain(body);
  if (!t) return false;
  if (t.endsWith("…") || t.endsWith("...")) return b.startsWith(t.replace(/(…|\.\.\.)$/, "").trim());
  return b === t;
}

export type ReactionMark = { emoji: string; by: string };
/** Adds (or removes) one person's icon on a message; each person keeps one of each icon. */
export function applyReaction(list: ReactionMark[], r: { emoji: string; by: string; removed: boolean }): ReactionMark[] {
  const rest = list.filter((x) => !(x.by === r.by && x.emoji === r.emoji));
  return r.removed ? rest : [...rest, { emoji: r.emoji, by: r.by }];
}
