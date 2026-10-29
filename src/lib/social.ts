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

/** Luke's starter captions (owner 2026-10-29): Under Contract for everyone; Coming Soon for sellers, with the city,
 *  price and street filled in when the file has them. */
export function starterPost(slot: SocialSlot, kind: "buyer" | "listing", f: { address: string | null; price: number | null }): string {
  if (slot === "uc") return "🔥Under Contract🔥\n\nCongrats to my clients... 🥳";
  if (kind !== "listing") return "";
  const parts = (f.address ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  const street = parts[0] ?? "", city = parts.length > 2 ? parts[1] : "";
  const price = f.price ? `$${f.price.toLocaleString("en-US")}` : "$";
  return `🎈Coming Soon🎈

🌟 ${city ? `${city}, ` : ""}MN 🌟
🛏/ 🛁/ 🚗 ${price}

xxxxx

🏠 ${street || "Address"}

▪️
▪️
▪️

Want more info or a tour? Reach out to Luke Pettersen!
📞 612.702.0295
📧 Luke@theadvisorymn.com
🌟 Real Producers Rising Star
🏠 Petty Homes Real Estate`;
}
