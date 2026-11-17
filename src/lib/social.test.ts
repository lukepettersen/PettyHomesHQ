import { describe, expect, it } from "vitest";
import { SOCIAL_SLOTS, starterPost, toSocialPosts } from "./social";

describe("social posts", () => {
  it("buyers get Under Contract; sellers also get Coming Soon/Active", () => {
    expect(SOCIAL_SLOTS.buyer.map((s) => s.slot)).toEqual(["uc"]);
    expect(SOCIAL_SLOTS.listing.map((s) => s.slot)).toEqual(["listing", "uc"]);
  });
  it("keeps known slots with text and drops the rest", () => {
    expect(toSocialPosts({ uc: { text: "Under contract!", ready: true, at: "2026-10-29T12:00:00.000Z", by: "Luke Pettersen" }, listing: { text: "  " }, other: { text: "x" } }))
      .toEqual({ uc: { text: "Under contract!", ready: true, at: "2026-10-29T12:00:00.000Z", by: "Luke Pettersen" } });
    expect(toSocialPosts(null)).toEqual({});
    expect(toSocialPosts([])).toEqual({});
  });
  it("starts the Coming Soon post from Luke's caption with what the file knows", () => {
    const t = starterPost("listing", "listing", { address: "1233 Main St, Edina, MN 55424", price: 389000 });
    expect(t).toContain("🌟 Edina, MN 🌟");
    expect(t).toContain("🛏/ 🛁/ 🚗 $389,000");
    expect(t).toContain("🏠 1233 Main St");
    expect(starterPost("listing", "listing", { address: null, price: null })).toContain("🏠 Address");
    expect(starterPost("uc", "listing", { address: null, price: null })).toBe("🔥Under Contract🔥\n\nCongrats to my clients... 🥳");
    expect(starterPost("uc", "buyer", { address: null, price: null })).toBe("🔥Under Contract🔥\n\nCongrats to my clients... 🥳");
    expect(starterPost("listing", "buyer", { address: null, price: null })).toBe("");
  });
});
