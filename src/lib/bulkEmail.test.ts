import { describe, expect, it } from "vitest";
import { bulkFooter, pickRecipients, unsubToken, validUnsub } from "./bulkEmail";

describe("mass email", () => {
  it("picks one address per person and skips opted-out and empty", () => {
    const r = pickRecipients([
      { id: "1", name: "A", emails: ["A@x.com", "a2@x.com"], tags: [] },
      { id: "2", name: "B", emails: [], tags: [] },
      { id: "3", name: "C", emails: ["c@x.com"], tags: ["Email Unsubscribed"] },
      { id: "4", name: "D", emails: ["d@x.com"], tags: ["Bounced"] },
      { id: "5", name: "E", emails: ["a@x.com", "e@x.com"], tags: [] }, // shares A's address: gets their other one
    ]);
    expect(r.send).toEqual([{ personId: "1", name: "A", email: "a@x.com" }, { personId: "5", name: "E", email: "e@x.com" }]);
    expect(r.skipped).toEqual({ noEmail: 1, optedOut: 2 });
  });
  it("signs unsubscribe links", () => {
    const t = unsubToken("p1", "s3cret");
    expect(validUnsub("p1", t, "s3cret")).toBe(true);
    expect(validUnsub("p2", t, "s3cret")).toBe(false);
    expect(validUnsub("p1", "nope", "s3cret")).toBe(false);
  });
  it("adds the footer", () => {
    expect(bulkFooter(" 123 Main St, Edina, MN ", "https://hq/u")).toBe("\n\n---\nPetty Homes LLC · 123 Main St, Edina, MN\nDon't want these emails? [Unsubscribe](https://hq/u)");
  });
});
