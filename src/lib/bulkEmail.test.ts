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

describe("unsubscribe by kind (owner request 2026-11-02)", () => {
  it("skips people unsubscribed from this kind or from everything, not other kinds", async () => {
    const { pickRecipients, kindTag, cleanKinds } = await import("./bulkEmail");
    const people = [
      { id: "a", name: "A", emails: ["a@x.com"], tags: [kindTag("Monthly newsletter")] },
      { id: "b", name: "B", emails: ["b@x.com"], tags: ["Email Unsubscribed"] },
      { id: "c", name: "C", emails: ["c@x.com"], tags: [] },
    ];
    expect(pickRecipients(people, "Events & invites").send.map((r) => r.personId)).toEqual(["a", "c"]);
    expect(pickRecipients(people, "Monthly newsletter").send.map((r) => r.personId)).toEqual(["c"]);
    expect(cleanKinds([" Events  &  invites ", "events & invites", "", 5, "Newsletter"])).toEqual(["Events & invites", "Newsletter"]);
  });
});
