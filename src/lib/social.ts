// Social post descriptions on a deal (owner request 2026-10-29): Luke fixes the wording, Alyssa copies it to post.
// Buyers have an Under Contract post; sellers also have a Coming Soon/Active one. Pure, tested.

export type SocialSlot = "listing" | "uc";
export type SocialPost = { text: string; ready: boolean; at: string | null; by: string | null };
export type SocialPosts = Partial<Record<SocialSlot, SocialPost>>;

export const SOCIAL_SLOTS: Record<"buyer" | "listing", { slot: SocialSlot; label: string }[]> = {
  buyer: [{ slot: "uc", label: "Under Contract post" }],
  listing: [{ slot: "listing", label: "Coming Soon/Active post" }, { slot: "uc", label: "Under Contract post" }],
};

/** Reads the stored JSON, dropping anything that isn't a known slot with text. */
export function toSocialPosts(v: unknown): SocialPosts {
  const out: SocialPosts = {};
  if (!v || typeof v !== "object" || Array.isArray(v)) return out;
  for (const slot of ["listing", "uc"] as const) {
    const p = (v as Record<string, unknown>)[slot] as Partial<SocialPost> | undefined;
    if (p && typeof p.text === "string" && p.text.trim()) out[slot] = { text: p.text, ready: !!p.ready, at: typeof p.at === "string" ? p.at : null, by: typeof p.by === "string" ? p.by : null };
  }
  return out;
}
