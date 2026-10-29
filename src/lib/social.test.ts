import { describe, expect, it } from "vitest";
import { SOCIAL_SLOTS, toSocialPosts } from "./social";

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
});
